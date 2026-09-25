import type { LeadStatusCategory, MembershipStatus } from "@/generated/prisma/enums";
import type { TableQuery } from "@/lib/table-query";
import { findMembers } from "@/modules/identity";
import { countLeadsByOwner, LEAD_PERMISSIONS, type LeadRow, listLeads } from "@/modules/leads";
import { getRegionalSettings } from "@/modules/organization";
import { ForbiddenError } from "@/platform/errors";
import { resolveDataScope } from "@/platform/rbac/scope";
import type { ServiceContext } from "@/platform/tenant/context";

import { ASSIGNMENT_PERMISSIONS } from "../permissions";
import { assignmentScope } from "./core";
import { getAssignmentSettings } from "./settings";

/**
 * Team workload (M05-08): per member of the manager's team (everyone for admins) — open leads, leads not touched
 * yet, leads unworked for longer than the organization's threshold (Q-08), and all leads by status category.
 * Numbers link to the lead list with the matching filters.
 */
export interface WorkloadRow {
  membershipId: string;
  name: string;
  status: MembershipStatus;
  open: number;
  untouched: number;
  unworked: number;
  byCategory: Record<LeadStatusCategory, number>;
}

export interface TeamWorkload {
  rows: WorkloadRow[];
  unassigned: { open: number; oldestCreatedAt: string | null };
  unworkedHours: number;
  totals: { open: number; untouched: number; unworked: number };
}

export async function getTeamWorkload(ctx: ServiceContext): Promise<TeamWorkload> {
  const scope = await resolveDataScope(ctx, ASSIGNMENT_PERMISSIONS.workloadView);
  const settings = await getAssignmentSettings(ctx.db, ctx);
  const ownerIds = scope.scope === "ALL" ? null : scope.membershipIds;
  const [members, counts, oldest] = await Promise.all([
    findMembers(ctx.db, {
      ids: ownerIds ?? undefined,
      withPermission: LEAD_PERMISSIONS.view,
    }),
    countLeadsByOwner(ctx.db, ctx.organizationId, {
      ownerIds,
      unworkedBefore: new Date(Date.now() - settings.unworkedHours * 3600 * 1000),
    }),
    listLeads(
      ctx,
      {
        page: 1,
        pageSize: 1,
        skip: 0,
        take: 1,
        q: "",
        sort: { field: "createdAt", direction: "asc" },
      },
      { view: "unassigned", openOnly: true, timezone: "UTC" },
    ).catch(() => null),
  ]);
  const byOwner = new Map(counts.map((entry) => [entry.ownerId, entry]));
  const rows = members
    .map((member) => {
      const entry = byOwner.get(member.membershipId);
      return {
        membershipId: member.membershipId,
        name: member.name,
        status: member.status,
        open: entry?.open ?? 0,
        untouched: entry?.untouched ?? 0,
        unworked: entry?.unworked ?? 0,
        byCategory: entry?.byCategory ?? {
          OPEN: 0,
          ACTIVE: 0,
          BOOKING: 0,
          WON: 0,
          LOST: 0,
          INVALID: 0,
        },
      };
    })
    // Inactive members only while they still own open leads (to hand them over).
    .filter((row) => row.status === "ACTIVE" || row.open > 0);
  const unassigned = byOwner.get(null);
  return {
    rows,
    unassigned: {
      open: unassigned?.open ?? 0,
      oldestCreatedAt: oldest?.rows[0]?.createdAt ?? null,
    },
    unworkedHours: settings.unworkedHours,
    totals: {
      open: rows.reduce((sum, row) => sum + row.open, 0),
      untouched: rows.reduce((sum, row) => sum + row.untouched, 0),
      unworked: rows.reduce((sum, row) => sum + row.unworked, 0),
    },
  };
}

/**
 * Unassigned open leads, oldest first, for people who may assign them (M05-07). Leads created before
 * `overdueBefore` have waited longer than the organization's threshold.
 */
export async function listUnassignedQueue(
  ctx: ServiceContext,
  query: TableQuery,
): Promise<{ rows: LeadRow[]; total: number; overdueHours: number; overdueBefore: string }> {
  if (!(await assignmentScope(ctx, ASSIGNMENT_PERMISSIONS.assign))) {
    throw new ForbiddenError("You are not allowed to assign leads.", ASSIGNMENT_PERMISSIONS.assign);
  }
  const [regional, settings] = await Promise.all([
    getRegionalSettings(ctx),
    getAssignmentSettings(ctx.db, ctx),
  ]);
  const list = await listLeads(
    ctx,
    { ...query, sort: query.sort ?? { field: "createdAt", direction: "asc" } },
    { view: "unassigned", openOnly: true, timezone: regional.timezone },
  );
  return {
    ...list,
    overdueHours: settings.unworkedHours,
    overdueBefore: new Date(Date.now() - settings.unworkedHours * 3600 * 1000).toISOString(),
  };
}
