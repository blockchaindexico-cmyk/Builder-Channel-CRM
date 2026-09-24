import { randomUUID } from "node:crypto";

import { syncSystemRoles } from "@/modules/identity/server/roles";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { PermissionSet } from "@/platform/rbac/permissions";
import { createServiceContext, type ServiceContext } from "@/platform/tenant/context";

import { createTestOrganization } from "./factories";

/** An organization with system roles, like the seed creates. */
export async function createOrganizationWithRoles() {
  const organization = await createTestOrganization();
  await syncSystemRoles(createTenantDb(organization.id), organization.id);
  const roles = await prisma.role.findMany({ where: { organizationId: organization.id } });
  const role = (key: string) => {
    const found = roles.find((r) => r.key === key);
    if (!found) throw new Error(`role ${key} missing`);
    return found;
  };
  return { organization, role };
}

/** Creates an ACTIVE member directly (no invitation) and returns a service context acting as them. */
export async function createMember(
  organizationId: string,
  roleId: string,
  options: {
    name?: string;
    reportsToId?: string | null;
    status?: "ACTIVE" | "INVITED" | "INACTIVE";
  } = {},
) {
  const name = options.name ?? `Member ${randomUUID().slice(0, 6)}`;
  const user = await prisma.user.create({
    data: { name, email: `${randomUUID().slice(0, 12)}@test.local` },
  });
  const membership = await prisma.membership.create({
    data: {
      organizationId,
      userId: user.id,
      roleId,
      reportsToId: options.reportsToId ?? null,
      status: options.status ?? "ACTIVE",
      joinedAt: options.status === "INVITED" ? null : new Date(),
    },
  });
  return { user, membership };
}

/** Context with the real permissions of the member's role (as getRequestContext would build it). */
export async function contextFor(membershipId: string): Promise<ServiceContext> {
  const membership = await prisma.membership.findUniqueOrThrow({
    where: { id: membershipId },
    include: { user: true, role: { include: { permissions: true } } },
  });
  return createServiceContext({
    organizationId: membership.organizationId,
    actor: {
      type: "USER",
      id: membership.userId,
      name: membership.user.name,
      membershipId: membership.id,
    },
    permissions: PermissionSet.fromGrants(membership.role.permissions),
    requestId: randomUUID(),
  });
}
