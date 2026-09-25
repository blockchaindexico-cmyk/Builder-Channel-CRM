import type { DataScope } from "@/generated/prisma/enums";
import { appRegistry } from "@/modules/registry";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import type { PermissionDefinition } from "@/platform/registry/types";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import {
  ADMIN_ROLE_KEY,
  IDENTITY_PERMISSIONS,
  SYSTEM_ROLES,
  type SystemRoleKey,
} from "../permissions";
import {
  type CreateRoleInput,
  createRoleSchema,
  type RolePermissionsInput,
  rolePermissionsSchema,
  type UpdateRoleInput,
  updateRoleSchema,
} from "../schemas";

export interface RoleGrant {
  permission: string;
  scope: DataScope | null;
}

function catalogue(): readonly PermissionDefinition[] {
  return appRegistry.permissionCatalogue();
}

function defaultGrant(role: SystemRoleKey, definition: PermissionDefinition): RoleGrant | null {
  if (role === "admin")
    return { permission: definition.key, scope: definition.scoped ? "ALL" : null };
  const value = definition.defaults?.[role];
  if (!value) return null;
  return {
    permission: definition.key,
    scope: definition.scoped ? (value === true ? "ALL" : value) : null,
  };
}

/**
 * Ensures the system roles exist and grants default permissions for catalogue entries they have not seen
 * before (M02-06). Idempotent; runs in the seed and when an organization is created. Admin edits to a
 * role's permissions are preserved because each permission is only defaulted once.
 */
export async function syncSystemRoles(db: TenantDbOrTx, organizationId: string): Promise<void> {
  const permissions = catalogue();
  for (const definition of SYSTEM_ROLES) {
    const role = await db.role.upsert({
      where: { organizationId_key: { organizationId, key: definition.key } },
      create: {
        organizationId,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      update: {},
    });
    const unseen = permissions.filter(
      (permission) => !role.seededPermissions.includes(permission.key),
    );
    if (unseen.length === 0) continue;

    const grants = unseen
      .map((permission) => defaultGrant(definition.key, permission))
      .filter((grant): grant is RoleGrant => grant !== null);
    if (grants.length > 0) {
      await db.rolePermission.createMany({
        data: grants.map((grant) => ({ organizationId, roleId: role.id, ...grant })),
        skipDuplicates: true,
      });
    }
    await db.role.update({
      where: { id: role.id },
      data: {
        seededPermissions: [
          ...role.seededPermissions,
          ...unseen.map((permission) => permission.key),
        ],
      },
    });
  }
}

export interface RoleSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  permissionCount: number;
}

export async function listRoles(ctx: ServiceContext): Promise<RoleSummary[]> {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.rolesManage);
  const roles = await ctx.db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { memberships: true, permissions: true } } },
  });
  return roles.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    memberCount: role._count.memberships,
    permissionCount: role._count.permissions,
  }));
}

/**
 * Role names for pickers in other modules (e.g. an announcement's audience). Names are not sensitive inside an
 * organization, so no permission is required.
 */
export async function listRoleOptions(
  db: TenantDbOrTx,
  options: { ids?: readonly string[] } = {},
): Promise<{ id: string; key: string; name: string }[]> {
  return db.role.findMany({
    where: options.ids ? { id: { in: [...options.ids] } } : {},
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: { id: true, key: true, name: true },
  });
}

/** Roles available in pickers (user form) — readable by anyone who can manage users. */
export async function listAssignableRoles(ctx: ServiceContext) {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.usersManage);
  return ctx.db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: { id: true, key: true, name: true },
  });
}

export async function getRole(ctx: ServiceContext, roleId: string) {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.rolesManage);
  const role = await ctx.db.role.findFirst({
    where: { id: roleId },
    include: {
      permissions: { select: { permission: true, scope: true } },
      _count: { select: { memberships: true } },
    },
  });
  if (!role) throw new NotFoundError("Role", roleId);
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    /** The admin role always holds every permission and cannot be edited (prevents lock-out). */
    locked: role.key === ADMIN_ROLE_KEY,
    memberCount: role._count.memberships,
    grants: role.permissions as RoleGrant[],
  };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "role"
  );
}

/** Creates a custom role, optionally copying the permissions of an existing role (e.g. "Accounts"). */
export async function createRole(ctx: ServiceContext, input: CreateRoleInput) {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.rolesManage);
  const values = parseInput(createRoleSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const base = slugify(values.name);
    let key = base;
    for (
      let attempt = 2;
      await tx.role.findFirst({ where: { key }, select: { id: true } });
      attempt += 1
    ) {
      key = `${base}-${attempt}`;
    }
    if (SYSTEM_ROLES.some((role) => role.key === key)) key = `${key}-custom`;

    const role = await tx.role.create({
      data: {
        organizationId: ctx.organizationId,
        key,
        name: values.name,
        description: values.description ?? null,
        isSystem: false,
        seededPermissions: catalogue().map((permission) => permission.key),
      },
    });
    if (values.copyFromRoleId) {
      const source = await tx.role.findFirst({
        where: { id: values.copyFromRoleId },
        include: { permissions: true },
      });
      if (!source) throw new NotFoundError("Role", values.copyFromRoleId);
      if (source.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: source.permissions.map((grant) => ({
            organizationId: ctx.organizationId,
            roleId: role.id,
            permission: grant.permission,
            scope: grant.scope,
          })),
        });
      }
    }
    await recordAudit(tx, ctx, {
      action: "role.create",
      entityType: "Role",
      entityId: role.id,
      summary: `Created role "${role.name}"`,
      metadata: values.copyFromRoleId ? { copiedFrom: values.copyFromRoleId } : undefined,
    });
    return role;
  });
}

export async function updateRole(ctx: ServiceContext, roleId: string, input: UpdateRoleInput) {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.rolesManage);
  const values = parseInput(updateRoleSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const before = await tx.role.findFirst({ where: { id: roleId } });
    if (!before) throw new NotFoundError("Role", roleId);
    const after = await tx.role.update({
      where: { id: roleId },
      data: { name: values.name, description: values.description ?? null },
    });
    await recordAudit(tx, ctx, {
      action: "role.update",
      entityType: "Role",
      entityId: roleId,
      summary: `Updated role "${after.name}"`,
      before: { name: before.name, description: before.description },
      after: { name: after.name, description: after.description },
    });
    return after;
  });
}

/** Replaces a role's permissions (M02-09). Validates keys and scopes against the catalogue. */
export async function setRolePermissions(
  ctx: ServiceContext,
  roleId: string,
  input: RolePermissionsInput,
) {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.rolesManage);
  const { grants } = parseInput(rolePermissionsSchema, input);
  const definitions = new Map(catalogue().map((definition) => [definition.key, definition]));

  const normalized = new Map<string, RoleGrant>();
  for (const grant of grants) {
    const definition = definitions.get(grant.permission);
    if (!definition) throw new ValidationError(`Unknown permission "${grant.permission}".`);
    normalized.set(grant.permission, {
      permission: grant.permission,
      scope: definition.scoped ? (grant.scope ?? "ALL") : null,
    });
  }

  return ctx.db.$transaction(async (tx) => {
    const role = await tx.role.findFirst({ where: { id: roleId }, include: { permissions: true } });
    if (!role) throw new NotFoundError("Role", roleId);
    if (role.key === ADMIN_ROLE_KEY) {
      throw new ConflictError("The Admin role always has every permission and cannot be edited.");
    }

    const previous = new Map(role.permissions.map((grant) => [grant.permission, grant.scope]));
    const changes: Record<string, { from: string | null; to: string | null }> = {};
    for (const [permission, scope] of previous) {
      const next = normalized.get(permission);
      if (!next) changes[permission] = { from: scope ?? "granted", to: null };
      else if (next.scope !== scope) changes[permission] = { from: scope, to: next.scope };
    }
    for (const [permission, grant] of normalized) {
      if (!previous.has(permission))
        changes[permission] = { from: null, to: grant.scope ?? "granted" };
    }

    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (normalized.size > 0) {
      await tx.rolePermission.createMany({
        data: [...normalized.values()].map((grant) => ({
          organizationId: ctx.organizationId,
          roleId,
          ...grant,
        })),
      });
    }
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, ctx, {
        action: "role.permissions.update",
        entityType: "Role",
        entityId: roleId,
        summary: `Changed ${Object.keys(changes).length} permission(s) of role "${role.name}"`,
        changes,
      });
      await publishEvent(tx, ctx, "role.permissions_changed", {
        roleId,
        changedPermissions: Object.keys(changes),
      });
    }
    return { changed: Object.keys(changes).length };
  });
}

export async function deleteRole(ctx: ServiceContext, roleId: string): Promise<void> {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.rolesManage);
  await ctx.db.$transaction(async (tx) => {
    const role = await tx.role.findFirst({
      where: { id: roleId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!role) throw new NotFoundError("Role", roleId);
    if (role.isSystem) throw new ConflictError("System roles cannot be deleted.");
    if (role._count.memberships > 0) {
      throw new ConflictError("Move the users of this role to another role before deleting it.");
    }
    await tx.role.delete({ where: { id: roleId } });
    await recordAudit(tx, ctx, {
      action: "role.delete",
      entityType: "Role",
      entityId: roleId,
      summary: `Deleted role "${role.name}"`,
    });
  });
}
