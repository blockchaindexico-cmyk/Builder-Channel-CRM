import { ForbiddenError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";

import type { DataScopeValue } from "./permissions";

export type ResolvedScope = { scope: "ALL" } | { scope: "TEAM" | "OWN"; membershipIds: string[] };

const teamCache = new WeakMap<ServiceContext, Promise<string[]>>();

/**
 * A membership and everyone reporting to it directly or indirectly (multi-level hierarchy, Q-04).
 * Cycle-safe (`UNION`).
 */
export async function getSubtreeMembershipIds(
  db: Pick<ServiceContext["db"], "$queryRaw">,
  organizationId: string,
  membershipId: string,
): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT m.id FROM "memberships" m
      WHERE m.organization_id = ${organizationId}::uuid AND m.id = ${membershipId}::uuid
      UNION
      SELECT child.id FROM "memberships" child
      JOIN tree ON child.reports_to_id = tree.id
      WHERE child.organization_id = ${organizationId}::uuid
    )
    SELECT id FROM tree`;
  return rows.map((row) => row.id);
}

/** Memberships in the actor's reporting tree (the actor included), memoized per context. */
export function getTeamMembershipIds(ctx: ServiceContext): Promise<string[]> {
  const membershipId = ctx.actor.membershipId;
  if (!membershipId) return Promise.resolve([]);
  let pending = teamCache.get(ctx);
  if (!pending) {
    pending = getSubtreeMembershipIds(ctx.db, ctx.organizationId, membershipId);
    teamCache.set(ctx, pending);
  }
  return pending;
}

/**
 * Resolves the data scope of a record-level permission for the actor (BUILD_PLAN §2.5):
 * ALL → no restriction; TEAM → the actor's reporting tree; OWN → the actor only.
 * Throws `ForbiddenError` when the permission is not held.
 */
export async function resolveDataScope(
  ctx: ServiceContext,
  permission: string,
): Promise<ResolvedScope> {
  const scope: DataScopeValue | null = ctx.permissions.scope(permission);
  if (!scope) throw new ForbiddenError(undefined, permission);
  if (scope === "ALL") return { scope: "ALL" };
  const membershipId = ctx.actor.membershipId;
  if (!membershipId) return { scope: "ALL" };
  if (scope === "OWN") return { scope: "OWN", membershipIds: [membershipId] };
  return { scope: "TEAM", membershipIds: await getTeamMembershipIds(ctx) };
}

/** True when a record owned by `ownerMembershipId` is inside the resolved scope. */
export function isWithinScope(
  resolved: ResolvedScope,
  ownerMembershipId: string | null | undefined,
): boolean {
  if (resolved.scope === "ALL") return true;
  return Boolean(ownerMembershipId && resolved.membershipIds.includes(ownerMembershipId));
}
