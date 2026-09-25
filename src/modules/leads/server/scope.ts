import type { Prisma } from "@/generated/prisma/client";
import { ForbiddenError, NotFoundError } from "@/platform/errors";
import { resolveDataScope } from "@/platform/rbac/scope";
import type { ServiceContext } from "@/platform/tenant/context";

import { LEAD_PERMISSIONS } from "../permissions";

/**
 * Lead visibility (BUILD_PLAN §1.2, §2.5), applied to every lead query — lists, search, detail, export:
 * - ALL: every lead;
 * - TEAM: leads owned by the actor's reporting tree, plus unassigned leads (managers distribute them, M05);
 * - OWN: leads the actor owns.
 * Deleted leads are never visible.
 */
export async function leadScopeWhere(
  ctx: ServiceContext,
  permission: string = LEAD_PERMISSIONS.view,
): Promise<Prisma.LeadWhereInput> {
  const scope = await resolveDataScope(ctx, permission);
  if (scope.scope === "ALL") return { deletedAt: null };
  if (scope.scope === "TEAM") {
    return { deletedAt: null, OR: [{ ownerId: { in: scope.membershipIds } }, { ownerId: null }] };
  }
  return { deletedAt: null, ownerId: { in: scope.membershipIds } };
}

/** True when the lead's owner lies within the actor's scope for `permission`. */
export async function isLeadInScope(
  ctx: ServiceContext,
  lead: { ownerId: string | null },
  permission: string,
): Promise<boolean> {
  const scope = await resolveDataScope(ctx, permission).catch(() => null);
  if (!scope) return false;
  if (scope.scope === "ALL") return true;
  if (lead.ownerId === null) return scope.scope === "TEAM";
  return scope.membershipIds.includes(lead.ownerId);
}

/**
 * Loads a lead the actor may see; others are reported as "not found" (no information leak). When
 * `permission` is given (update, change status…), the lead must also be inside that permission's scope.
 */
export async function findVisibleLead<T extends Prisma.LeadInclude | undefined = undefined>(
  ctx: ServiceContext,
  leadId: string,
  options: { permission?: string; include?: T; db?: Pick<ServiceContext["db"], "lead"> } = {},
) {
  const where = await leadScopeWhere(ctx);
  const db = options.db ?? ctx.db;
  const lead = (await db.lead.findFirst({
    where: { AND: [where, { id: leadId }] },
    include: options.include,
  })) as Prisma.LeadGetPayload<{ include: T }> | null;
  if (!lead) throw new NotFoundError("Lead", leadId);
  if (options.permission && !(await isLeadInScope(ctx, lead, options.permission))) {
    throw new ForbiddenError(undefined, options.permission);
  }
  return lead;
}
