import { prisma } from "@/platform/db/client";
import { PermissionSet } from "@/platform/rbac/permissions";

import { createServiceContext, type ServiceContext } from "./context";

/**
 * Context for background work done on behalf of a member, e.g. an import they started: the member's current role
 * permissions and data scope apply, so a job can never do more than its author. Returns null when the member (or
 * the organization) is no longer active.
 */
export async function createMemberContext(
  organizationId: string,
  membershipId: string,
  options: { requestId?: string } = {},
): Promise<ServiceContext | null> {
  const membership = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      organizationId,
      status: "ACTIVE",
      organization: { status: "ACTIVE" },
    },
    select: {
      id: true,
      user: { select: { id: true, name: true } },
      role: { select: { permissions: { select: { permission: true, scope: true } } } },
    },
  });
  if (!membership) return null;
  return createServiceContext({
    organizationId,
    actor: {
      type: "USER",
      id: membership.user.id,
      name: membership.user.name,
      membershipId: membership.id,
    },
    permissions: PermissionSet.fromGrants(membership.role.permissions),
    requestId: options.requestId,
  });
}
