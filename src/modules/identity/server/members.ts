import type { Prisma } from "@/generated/prisma/client";
import type { MembershipStatus } from "@/generated/prisma/enums";
import type { TableQuery } from "@/lib/table-query";
import { recordAudit } from "@/platform/audit";
import { sendInvitationEmail, sendPasswordResetEmail } from "@/platform/auth/emails";
import { createPasswordSetupToken, INVITATION_VALID_HOURS } from "@/platform/auth/tokens";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import { logger } from "@/platform/logger";
import { isWithinScope, resolveDataScope } from "@/platform/rbac/scope";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput, uuidOrNull } from "@/platform/validation";

import { ADMIN_ROLE_KEY, IDENTITY_PERMISSIONS } from "../permissions";
import {
  type CreateMemberInput,
  createMemberSchema,
  type UpdateMemberInput,
  updateMemberSchema,
} from "../schemas";

export interface MemberRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  roleId: string;
  roleKey: string;
  roleName: string;
  status: MembershipStatus;
  reportsToId: string | null;
  reportsToName: string | null;
  employeeCode: string | null;
  designation: string | null;
  lastLoginAt: string | null;
  invitedAt: string | null;
  joinedAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
}

export interface MemberFilters {
  roleId?: string | null;
  status?: MembershipStatus | null;
  reportsToId?: string | null;
}

export const MEMBER_SORTABLE_FIELDS = ["name", "createdAt", "lastLoginAt", "status"] as const;

const memberInclude = {
  user: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true } },
  role: { select: { id: true, key: true, name: true } },
  reportsTo: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.MembershipInclude;

type MemberRecord = Prisma.MembershipGetPayload<{ include: typeof memberInclude }>;

function toRow(member: MemberRecord): MemberRow {
  return {
    membershipId: member.id,
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    phone: member.user.phone,
    roleId: member.role.id,
    roleKey: member.role.key,
    roleName: member.role.name,
    status: member.status,
    reportsToId: member.reportsToId,
    reportsToName: member.reportsTo?.user.name ?? null,
    employeeCode: member.employeeCode,
    designation: member.designation,
    lastLoginAt: member.user.lastLoginAt?.toISOString() ?? null,
    invitedAt: member.invitedAt?.toISOString() ?? null,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    deactivatedAt: member.deactivatedAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown, field: string): boolean {
  const prismaError = error as {
    code?: string;
    meta?: { target?: unknown; driverAdapterError?: unknown };
  };
  if (prismaError?.code !== "P2002") return false;
  return JSON.stringify(prismaError.meta ?? {}).includes(field);
}

/** Members visible to the actor (users.view: TEAM → own reporting tree, ALL → everyone). */
export async function listMembers(
  ctx: ServiceContext,
  query: TableQuery,
  filters: MemberFilters = {},
): Promise<{ rows: MemberRow[]; total: number }> {
  const scope = await resolveDataScope(ctx, IDENTITY_PERMISSIONS.usersView);
  const where: Prisma.MembershipWhereInput = {};
  if (scope.scope !== "ALL") where.id = { in: scope.membershipIds };
  const roleId = uuidOrNull(filters.roleId);
  const reportsToId = uuidOrNull(filters.reportsToId);
  if (roleId) where.roleId = roleId;
  if (filters.status) where.status = filters.status;
  if (reportsToId) where.reportsToId = reportsToId;
  if (query.q) {
    where.OR = [
      { user: { name: { contains: query.q, mode: "insensitive" } } },
      { user: { email: { contains: query.q, mode: "insensitive" } } },
      { user: { phone: { contains: query.q } } },
      { employeeCode: { contains: query.q, mode: "insensitive" } },
    ];
  }

  const direction = query.sort?.direction ?? "asc";
  const orderBy: Prisma.MembershipOrderByWithRelationInput[] =
    query.sort?.field === "createdAt"
      ? [{ createdAt: direction }]
      : query.sort?.field === "lastLoginAt"
        ? [{ user: { lastLoginAt: { sort: direction, nulls: "last" } } }]
        : query.sort?.field === "status"
          ? [{ status: direction }, { user: { name: "asc" } }]
          : [{ user: { name: direction } }];

  const [members, total] = await Promise.all([
    ctx.db.membership.findMany({
      where,
      orderBy,
      skip: query.skip,
      take: query.take,
      include: memberInclude,
    }),
    ctx.db.membership.count({ where }),
  ]);
  return { rows: members.map(toRow), total };
}

export async function getMember(ctx: ServiceContext, membershipId: string): Promise<MemberRow> {
  const scope = await resolveDataScope(ctx, IDENTITY_PERMISSIONS.usersView);
  if (!isWithinScope(scope, membershipId)) throw new NotFoundError("User", membershipId);
  const member = await ctx.db.membership.findFirst({
    where: { id: membershipId },
    include: memberInclude,
  });
  if (!member) throw new NotFoundError("User", membershipId);
  return toRow(member);
}

/** People who can be chosen as a reporting manager (active or invited members). */
export async function listManagerOptions(ctx: ServiceContext) {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.usersManage);
  const members = await ctx.db.membership.findMany({
    where: { status: { not: "INACTIVE" } },
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      designation: true,
      user: { select: { name: true } },
      role: { select: { name: true } },
    },
  });
  return members.map((member) => ({
    membershipId: member.id,
    name: member.user.name,
    detail: member.designation ?? member.role.name,
  }));
}

async function subtreeIds(
  db: TenantDbOrTx,
  organizationId: string,
  membershipId: string,
): Promise<Set<string>> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT m.id FROM "memberships" m WHERE m.organization_id = ${organizationId}::uuid AND m.id = ${membershipId}::uuid
      UNION
      SELECT child.id FROM "memberships" child JOIN tree ON child.reports_to_id = tree.id
      WHERE child.organization_id = ${organizationId}::uuid
    )
    SELECT id FROM tree`;
  return new Set(rows.map((row) => row.id));
}

async function assertValidManager(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  reportsToId: string | null | undefined,
  membershipId?: string,
) {
  if (!reportsToId) return;
  const manager = await tx.membership.findFirst({
    where: { id: reportsToId, status: { not: "INACTIVE" } },
    select: { id: true },
  });
  if (!manager) {
    throw new ValidationError("Choose an active reporting manager.", {
      reportsToId: ["Not an active member"],
    });
  }
  if (membershipId) {
    const subtree = await subtreeIds(tx, ctx.organizationId, membershipId);
    if (subtree.has(reportsToId)) {
      throw new ValidationError(
        "A person cannot report to themselves or to someone in their own team.",
        {
          reportsToId: ["This would create a circular reporting line"],
        },
      );
    }
  }
}

async function assertNotLastAdmin(tx: TenantDbOrTx, membershipId: string, message: string) {
  const otherActiveAdmins = await tx.membership.count({
    where: { id: { not: membershipId }, status: "ACTIVE", role: { key: ADMIN_ROLE_KEY } },
  });
  if (otherActiveAdmins === 0) throw new ConflictError(message);
}

/** Creates a user + membership and e-mails an invitation to set a password (M02-10). */
export async function createMember(
  ctx: ServiceContext,
  input: CreateMemberInput,
): Promise<{ member: MemberRow; invitationSent: boolean }> {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.usersManage);
  const values = parseInput(createMemberSchema, input);

  let created: MemberRecord;
  try {
    created = await ctx.db.$transaction(async (tx) => {
      const role = await tx.role.findFirst({ where: { id: values.roleId }, select: { id: true } });
      if (!role) throw new ValidationError("Choose a role.", { roleId: ["Unknown role"] });
      await assertValidManager(tx, ctx, values.reportsToId);

      if (await tx.user.findFirst({ where: { email: values.email }, select: { id: true } })) {
        throw new ConflictError("A user with this e-mail address already exists.", {
          field: "email",
        });
      }
      const user = await tx.user.create({
        data: { name: values.name, email: values.email, phone: values.phone ?? null },
      });
      const membership = await tx.membership.create({
        data: {
          organizationId: ctx.organizationId,
          userId: user.id,
          roleId: values.roleId,
          reportsToId: values.reportsToId ?? null,
          employeeCode: values.employeeCode ?? null,
          designation: values.designation ?? null,
          status: "INVITED",
          invitedAt: new Date(),
        },
        include: memberInclude,
      });
      await recordAudit(tx, ctx, {
        action: "member.create",
        entityType: "User",
        entityId: user.id,
        summary: `Invited ${values.name} <${values.email}> as ${membership.role.name}`,
        after: {
          name: values.name,
          email: values.email,
          phone: values.phone ?? null,
          role: membership.role.name,
          reportsTo: membership.reportsTo?.user.name ?? null,
          employeeCode: values.employeeCode ?? null,
          designation: values.designation ?? null,
        },
        before: {},
      });
      await publishEvent(tx, ctx, "member.invited", {
        membershipId: membership.id,
        userId: user.id,
        roleId: values.roleId,
      });
      return membership;
    });
  } catch (error) {
    if (isUniqueViolation(error, "email")) {
      throw new ConflictError("This e-mail address is already used by another account.", {
        field: "email",
      });
    }
    if (isUniqueViolation(error, "employee_code")) {
      throw new ValidationError("Another user already has this employee code.", {
        employeeCode: ["Already in use"],
      });
    }
    throw error;
  }

  const invitationSent = await sendInvitation(
    ctx,
    created.user.id,
    created.user.email,
    created.user.name,
  );
  return { member: toRow(created), invitationSent };
}

async function sendInvitation(
  ctx: ServiceContext,
  userId: string,
  email: string,
  name: string,
): Promise<boolean> {
  try {
    const organization = await ctx.db.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { name: true },
    });
    const token = await createPasswordSetupToken(userId, INVITATION_VALID_HOURS);
    await sendInvitationEmail({
      email,
      name,
      token,
      organizationName: organization.name,
      invitedBy: ctx.actor.name,
      validHours: INVITATION_VALID_HOURS,
    });
    return true;
  } catch (error) {
    logger.error({ err: error, userId }, "failed to send invitation");
    return false;
  }
}

/** Updates details, role and reporting manager (M02-11). */
export async function updateMember(
  ctx: ServiceContext,
  membershipId: string,
  input: UpdateMemberInput,
) {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.usersManage);
  const values = parseInput(updateMemberSchema, input);

  try {
    return await ctx.db.$transaction(async (tx) => {
      const before = await tx.membership.findFirst({
        where: { id: membershipId },
        include: memberInclude,
      });
      if (!before) throw new NotFoundError("User", membershipId);

      const role = await tx.role.findFirst({
        where: { id: values.roleId },
        select: { id: true, key: true, name: true },
      });
      if (!role) throw new ValidationError("Choose a role.", { roleId: ["Unknown role"] });
      if (before.role.key === ADMIN_ROLE_KEY && role.key !== ADMIN_ROLE_KEY) {
        if (membershipId === ctx.actor.membershipId) {
          throw new ConflictError("You cannot remove your own Admin role.");
        }
        await assertNotLastAdmin(tx, membershipId, "At least one active Admin is required.");
      }
      await assertValidManager(tx, ctx, values.reportsToId, membershipId);

      await tx.user.update({
        where: { id: before.user.id },
        data: { name: values.name, phone: values.phone ?? null },
      });
      const after = await tx.membership.update({
        where: { id: membershipId },
        data: {
          roleId: values.roleId,
          reportsToId: values.reportsToId ?? null,
          employeeCode: values.employeeCode ?? null,
          designation: values.designation ?? null,
        },
        include: memberInclude,
      });

      const snapshot = (member: MemberRecord) => ({
        name: member.user.name,
        phone: member.user.phone,
        role: member.role.name,
        reportsTo: member.reportsTo?.user.name ?? null,
        employeeCode: member.employeeCode,
        designation: member.designation,
      });
      const beforeSnapshot = snapshot(before);
      const afterSnapshot = { ...snapshot(after), name: values.name, phone: values.phone ?? null };
      const changedFields = Object.keys(afterSnapshot).filter(
        (key) =>
          beforeSnapshot[key as keyof typeof beforeSnapshot] !==
          afterSnapshot[key as keyof typeof afterSnapshot],
      );
      if (changedFields.length > 0) {
        await recordAudit(tx, ctx, {
          action: before.roleId !== values.roleId ? "member.role_change" : "member.update",
          entityType: "User",
          entityId: before.user.id,
          summary: `Updated ${values.name} (${changedFields.join(", ")})`,
          before: beforeSnapshot,
          after: afterSnapshot,
        });
        await publishEvent(tx, ctx, "member.updated", { membershipId, changedFields });
      }
      return toRow({
        ...after,
        user: { ...after.user, name: values.name, phone: values.phone ?? null },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, "employee_code")) {
      throw new ValidationError("Another user already has this employee code.", {
        employeeCode: ["Already in use"],
      });
    }
    throw error;
  }
}

/**
 * Deactivates a member (M02-12): blocks sign-in immediately and ends their sessions. Their records stay
 * intact for accountability (PRD §28); leads are reassigned with the M05 wizard.
 */
export async function deactivateMember(ctx: ServiceContext, membershipId: string): Promise<void> {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.usersManage);
  if (membershipId === ctx.actor.membershipId)
    throw new ConflictError("You cannot deactivate your own account.");
  await ctx.db.$transaction(async (tx) => {
    const member = await tx.membership.findFirst({
      where: { id: membershipId },
      include: memberInclude,
    });
    if (!member) throw new NotFoundError("User", membershipId);
    if (member.status === "INACTIVE") return;
    if (member.role.key === ADMIN_ROLE_KEY) {
      await assertNotLastAdmin(tx, membershipId, "The last active Admin cannot be deactivated.");
    }
    await tx.membership.update({
      where: { id: membershipId },
      data: { status: "INACTIVE", deactivatedAt: new Date() },
    });
    const ended = await tx.session.deleteMany({ where: { userId: member.user.id } });
    await recordAudit(tx, ctx, {
      action: "member.deactivate",
      entityType: "User",
      entityId: member.user.id,
      summary: `Deactivated ${member.user.name}`,
      changes: { status: { from: member.status, to: "INACTIVE" } },
      metadata: { sessionsEnded: ended.count },
    });
    await publishEvent(tx, ctx, "member.deactivated", { membershipId, userId: member.user.id });
  });
}

/** Restores access: ACTIVE if the person already set a password, otherwise INVITED (with a new invite). */
export async function reactivateMember(
  ctx: ServiceContext,
  membershipId: string,
): Promise<{ status: MembershipStatus }> {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.usersManage);
  const result = await ctx.db.$transaction(async (tx) => {
    const member = await tx.membership.findFirst({
      where: { id: membershipId },
      include: memberInclude,
    });
    if (!member) throw new NotFoundError("User", membershipId);
    if (member.status !== "INACTIVE") return { status: member.status, member };
    const status: MembershipStatus = member.joinedAt ? "ACTIVE" : "INVITED";
    await tx.membership.update({
      where: { id: membershipId },
      data: { status, deactivatedAt: null },
    });
    await recordAudit(tx, ctx, {
      action: "member.reactivate",
      entityType: "User",
      entityId: member.user.id,
      summary: `Reactivated ${member.user.name}`,
      changes: { status: { from: "INACTIVE", to: status } },
    });
    await publishEvent(tx, ctx, "member.reactivated", { membershipId, userId: member.user.id });
    return { status, member };
  });
  if (result.status === "INVITED") {
    await sendInvitation(
      ctx,
      result.member.user.id,
      result.member.user.email,
      result.member.user.name,
    );
  }
  return { status: result.status };
}

/** Admin-triggered password reset e-mail (M02-13). */
export async function sendMemberPasswordReset(
  ctx: ServiceContext,
  membershipId: string,
): Promise<void> {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.usersManage);
  const member = await ctx.db.membership.findFirst({
    where: { id: membershipId },
    include: memberInclude,
  });
  if (!member) throw new NotFoundError("User", membershipId);
  if (member.status !== "ACTIVE") {
    throw new ConflictError(
      "Password resets are only for active users. Resend the invitation instead.",
    );
  }
  const token = await createPasswordSetupToken(member.user.id, 1);
  await sendPasswordResetEmail({
    userId: member.user.id,
    email: member.user.email,
    name: member.user.name,
    token,
  });
  await recordAudit(ctx.db, ctx, {
    action: "member.password_reset_sent",
    entityType: "User",
    entityId: member.user.id,
    summary: `Sent a password reset link to ${member.user.name}`,
  });
}

/** Sends a fresh invitation (M02-13). */
export async function resendInvitation(ctx: ServiceContext, membershipId: string): Promise<void> {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.usersManage);
  const member = await ctx.db.membership.findFirst({
    where: { id: membershipId },
    include: memberInclude,
  });
  if (!member) throw new NotFoundError("User", membershipId);
  if (member.status !== "INVITED")
    throw new ConflictError("Only invited users can receive a new invitation.");
  const sent = await sendInvitation(ctx, member.user.id, member.user.email, member.user.name);
  if (!sent) throw new ConflictError("The invitation could not be sent. Please try again.");
  await recordAudit(ctx.db, ctx, {
    action: "member.invitation_resent",
    entityType: "User",
    entityId: member.user.id,
    summary: `Resent the invitation to ${member.user.name}`,
  });
}

/** Guard used by pages: a manager may only open members of their own team. */
export async function assertCanViewMember(
  ctx: ServiceContext,
  membershipId: string,
): Promise<void> {
  const scope = await resolveDataScope(ctx, IDENTITY_PERMISSIONS.usersView);
  if (!isWithinScope(scope, membershipId)) throw new ForbiddenError();
}

/**
 * Members for other modules' checks and pickers (e.g. who may own leads): optionally only these ids, only active
 * members, only roles that grant `withPermission`. Works inside the caller's transaction; no permission check.
 */
export async function findMembers(
  db: TenantDbOrTx,
  options: { ids?: readonly string[]; activeOnly?: boolean; withPermission?: string } = {},
): Promise<{ membershipId: string; name: string; status: MembershipStatus }[]> {
  const members = await db.membership.findMany({
    where: {
      ...(options.ids ? { id: { in: [...options.ids] } } : {}),
      ...(options.activeOnly ? { status: "ACTIVE" as const } : {}),
      ...(options.withPermission
        ? { role: { permissions: { some: { permission: options.withPermission } } } }
        : {}),
    },
    orderBy: { user: { name: "asc" } },
    select: { id: true, status: true, user: { select: { name: true } } },
  });
  return members.map((member) => ({
    membershipId: member.id,
    name: member.user.name,
    status: member.status,
  }));
}

/**
 * Colleague names for pickers and filters in other modules (owner, manager…). Names are not sensitive inside
 * an organization, so no permission is required; callers pass the ids their own scope allows.
 */
export async function listMemberOptions(
  ctx: ServiceContext,
  options: { ids?: readonly string[]; managersOnly?: boolean; includeInactive?: boolean } = {},
): Promise<
  {
    membershipId: string;
    name: string;
    email: string;
    employeeCode: string | null;
    roleName: string;
    status: MembershipStatus;
  }[]
> {
  const where: Prisma.MembershipWhereInput = {};
  if (options.ids) where.id = { in: [...options.ids] };
  if (!options.includeInactive) where.status = { not: "INACTIVE" };
  if (options.managersOnly) where.directReports = { some: {} };
  const members = await ctx.db.membership.findMany({
    where,
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      status: true,
      employeeCode: true,
      user: { select: { name: true, email: true } },
      role: { select: { name: true } },
    },
  });
  return members.map((member) => ({
    membershipId: member.id,
    name: member.user.name,
    email: member.user.email,
    employeeCode: member.employeeCode,
    roleName: member.role.name,
    status: member.status,
  }));
}
