import { addDays, format, parse } from "date-fns";

import { Prisma } from "@/generated/prisma/client";
import type { DateRange } from "@/lib/date-range";
import { getAssignmentSettings } from "@/modules/assignment";
import { getRegionalSettings } from "@/modules/organization";
import {
  getSubtreeMembershipIds,
  resolveDataScope,
  type ResolvedScope,
} from "@/platform/rbac/scope";
import type { ServiceContext } from "@/platform/tenant/context";
import { uuidOrNull } from "@/platform/validation";

import { addCounters, type Counters, derived, emptyCounters } from "../metrics";
import {
  type Bucket,
  bucketKeyOf,
  bucketsOf,
  changePercent,
  type Granularity,
  previousPeriod,
} from "../period";
import { ANALYTICS_PERMISSIONS } from "../permissions";
import { localDay, readDailyStats } from "./aggregates";
import { leadDimensionSql, leadOwnerSql } from "./lead-sql";
import {
  computeMemberDaily,
  type DimensionFilters,
  hasDimensions,
  type MemberDayRow,
} from "./member-daily";

/**
 * The metrics service (M10-01, M10-02): the same counters for every dashboard and report, restricted to the
 * viewer's data scope for `reports.view` and to the chosen filters.
 */
export interface ReportFilters extends DimensionFilters {
  range: DateRange;
  managerId?: string | null;
  executiveId?: string | null;
}

export interface ReportScope {
  scope: ResolvedScope["scope"];
  /** Members whose work is counted; null = everyone in the organization. */
  memberIds: string[] | null;
  timezone: string;
  today: string;
  weekStartsOn: 0 | 1;
}

/** Scope ∩ manager subtree ∩ executive. Throws when the viewer has no `reports.view`. */
export async function resolveReportScope(
  ctx: ServiceContext,
  filters: Pick<ReportFilters, "managerId" | "executiveId"> = {},
): Promise<ReportScope> {
  const [scope, regional] = await Promise.all([
    resolveDataScope(ctx, ANALYTICS_PERMISSIONS.reportsView),
    getRegionalSettings(ctx),
  ]);
  let memberIds: string[] | null = scope.scope === "ALL" ? null : [...scope.membershipIds];
  const managerId = uuidOrNull(filters.managerId);
  if (managerId) {
    const subtree = await getSubtreeMembershipIds(ctx.db, ctx.organizationId, managerId);
    memberIds = memberIds ? memberIds.filter((id) => subtree.includes(id)) : subtree;
  }
  const executiveId = uuidOrNull(filters.executiveId);
  if (executiveId)
    memberIds = memberIds ? memberIds.filter((id) => id === executiveId) : [executiveId];
  return {
    scope: scope.scope,
    memberIds,
    timezone: regional.timezone,
    today: localDay(new Date(), regional.timezone),
    weekStartsOn: regional.weekStartsOn === 0 ? 0 : 1,
  };
}

export const dimensionsOf = (filters: ReportFilters): DimensionFilters => ({
  builderId: uuidOrNull(filters.builderId),
  projectId: uuidOrNull(filters.projectId),
  sourceId: uuidOrNull(filters.sourceId),
  statusId: uuidOrNull(filters.statusId),
});

const ISO = "yyyy-MM-dd";
const dayBefore = (day: string) => format(addDays(parse(day, ISO, new Date(2000, 0, 1)), -1), ISO);

/**
 * Counters per member and day. Stored rows serve past days without dimension filters; today (always fresh) and
 * any filtered request are computed live from the activity tables.
 */
export async function loadMemberDays(
  ctx: ServiceContext,
  scope: ReportScope,
  range: DateRange,
  dimensions: DimensionFilters,
): Promise<MemberDayRow[]> {
  if (scope.memberIds && scope.memberIds.length === 0) return [];
  const live = (from: string, to: string) =>
    computeMemberDaily(ctx.db, ctx.organizationId, {
      from,
      to,
      timezone: scope.timezone,
      memberIds: scope.memberIds,
      filters: dimensions,
    });
  if (hasDimensions(dimensions) || range.from >= scope.today) return live(range.from, range.to);
  const storedTo = range.to >= scope.today ? dayBefore(scope.today) : range.to;
  const [stored, fresh] = await Promise.all([
    readDailyStats(ctx.db, { from: range.from, to: storedTo, memberIds: scope.memberIds }),
    range.to >= scope.today ? live(scope.today, range.to) : Promise.resolve([]),
  ]);
  return [...stored, ...fresh];
}

const sumRows = (rows: MemberDayRow[]) =>
  rows.reduce((total, row) => addCounters(total, row), emptyCounters());

export type MetricValues = Counters & ReturnType<typeof derived>;

export interface MetricSummary {
  range: DateRange;
  previousRange: DateRange;
  current: MetricValues;
  previous: MetricValues;
  /** Change vs the previous period in percent, per counter (null when there was nothing before). */
  change: Partial<Record<keyof Counters, number | null>>;
}

/** Totals of the period and of the previous one (M10-02). */
export async function getMetricSummary(
  ctx: ServiceContext,
  filters: ReportFilters,
  scope?: ReportScope,
): Promise<MetricSummary> {
  const resolved = scope ?? (await resolveReportScope(ctx, filters));
  const dimensions = dimensionsOf(filters);
  const previousRange = previousPeriod(filters.range);
  const [current, previous] = await Promise.all([
    loadMemberDays(ctx, resolved, filters.range, dimensions).then(sumRows),
    loadMemberDays(ctx, resolved, previousRange, dimensions).then(sumRows),
  ]);
  const change: MetricSummary["change"] = {};
  for (const key of Object.keys(current) as (keyof Counters)[]) {
    change[key] = changePercent(current[key], previous[key]);
  }
  return {
    range: filters.range,
    previousRange,
    current: { ...current, ...derived(current) },
    previous: { ...previous, ...derived(previous) },
    change,
  };
}

export interface SeriesPoint extends Bucket {
  values: MetricValues;
}

/** Counters per day, week or month of the period, empty buckets included. */
export async function getMetricSeries(
  ctx: ServiceContext,
  filters: ReportFilters,
  granularity: Granularity,
  scope?: ReportScope,
): Promise<SeriesPoint[]> {
  const resolved = scope ?? (await resolveReportScope(ctx, filters));
  const rows = await loadMemberDays(ctx, resolved, filters.range, dimensionsOf(filters));
  const buckets = bucketsOf(filters.range, granularity, resolved.weekStartsOn);
  const totals = new Map(buckets.map((bucket) => [bucket.key, emptyCounters()]));
  for (const row of rows) {
    const target = totals.get(bucketKeyOf(row.day, granularity, resolved.weekStartsOn));
    if (target) addCounters(target, row);
  }
  return buckets.map((bucket) => {
    const values = totals.get(bucket.key)!;
    return { ...bucket, values: { ...values, ...derived(values) } };
  });
}

export interface MemberMetrics {
  memberId: string;
  name: string;
  managerName: string | null;
  isActive: boolean;
  values: MetricValues;
}

/** Counters per member of the scope for the period (leaderboards, executive and team reports). */
export async function getMemberMetrics(
  ctx: ServiceContext,
  filters: ReportFilters,
  scope?: ReportScope,
): Promise<MemberMetrics[]> {
  const resolved = scope ?? (await resolveReportScope(ctx, filters));
  const [rows, members] = await Promise.all([
    loadMemberDays(ctx, resolved, filters.range, dimensionsOf(filters)),
    ctx.db.membership.findMany({
      where: resolved.memberIds
        ? { id: { in: resolved.memberIds } }
        : { status: { not: "INVITED" } },
      select: {
        id: true,
        status: true,
        user: { select: { name: true } },
        reportsTo: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);
  const totals = new Map<string, Counters>();
  for (const row of rows) {
    totals.set(row.memberId, addCounters(totals.get(row.memberId) ?? emptyCounters(), row));
  }
  return members
    .filter((member) => member.status === "ACTIVE" || totals.has(member.id))
    .map((member) => {
      const values = totals.get(member.id) ?? emptyCounters();
      return {
        memberId: member.id,
        name: member.user.name,
        managerName: member.reportsTo?.user.name ?? null,
        isActive: member.status === "ACTIVE",
        values: { ...values, ...derived(values) },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- Point-in-time figures (not per period) --------------------------------------------------------------------------

export interface PipelineSnapshot {
  /** Leads per current status (open, won, lost…), for the scope and lead filters. */
  byStatus: {
    statusId: string;
    key: string;
    label: string;
    color: string;
    category: string;
    count: number;
  }[];
  open: number;
  /** Open leads with an overdue follow-up or no next step planned (glossary §1.6). */
  pending: number;
  /** Open leads assigned more than the unworked threshold ago with no activity since. */
  unworked: number;
  /** Follow-ups and callbacks past due and not done. */
  overdueFollowUps: number;
  /** Open leads without an owner (only for team and organization scopes). */
  unassigned: number | null;
}

/** Where the leads stand right now (dashboards, M10-04 → M10-06). */
export async function getPipeline(
  ctx: ServiceContext,
  filters: Omit<ReportFilters, "range">,
  scope?: ReportScope,
): Promise<PipelineSnapshot> {
  const resolved = scope ?? (await resolveReportScope(ctx, filters));
  const dimensions = dimensionsOf({ ...filters, range: { from: "", to: "" } });
  const org = Prisma.sql`${ctx.organizationId}::uuid`;
  const members = resolved.memberIds;
  const { sql: owner, includesUnassigned: includeUnassigned } = leadOwnerSql(resolved, filters);
  const dimSql = leadDimensionSql(dimensions);
  const { unworkedHours } = await getAssignmentSettings(ctx.db, ctx);
  const now = new Date();
  const unworkedBefore = new Date(now.getTime() - unworkedHours * 3_600_000);

  const [statusRows, [flags]] = await Promise.all([
    ctx.db.$queryRaw<{ status_id: string; count: number }[]>`
      SELECT l."status_id", COUNT(*)::int AS "count"
      FROM "leads" l
      WHERE l."organization_id" = ${org} AND l."deleted_at" IS NULL AND l."duplicate_status" <> 'MERGED'
        AND ${owner} ${dimSql}
      GROUP BY 1`,
    ctx.db.$queryRaw<{ pending: number; unworked: number; unassigned: number; overdue: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE
          EXISTS (SELECT 1 FROM "follow_ups" f WHERE f."organization_id" = l."organization_id" AND f."lead_id" = l."id"
                  AND f."status" IN ('SCHEDULED', 'MISSED') AND f."due_at" < ${now})
          OR NOT EXISTS (SELECT 1 FROM "follow_ups" f WHERE f."organization_id" = l."organization_id" AND f."lead_id" = l."id"
                  AND f."status" = 'SCHEDULED')
             AND NOT EXISTS (SELECT 1 FROM "site_visits" v WHERE v."organization_id" = l."organization_id" AND v."lead_id" = l."id"
                  AND v."status" IN ('SCHEDULED', 'CONFIRMED') AND v."scheduled_at" >= ${now})
        )::int AS "pending",
        COUNT(*) FILTER (WHERE l."owner_id" IS NOT NULL AND l."owner_assigned_at" < ${unworkedBefore}
          AND l."last_activity_at" <= l."owner_assigned_at")::int AS "unworked",
        COUNT(*) FILTER (WHERE l."owner_id" IS NULL)::int AS "unassigned",
        (SELECT COUNT(*)::int FROM "follow_ups" f
          JOIN "leads" fl ON fl."organization_id" = f."organization_id" AND fl."id" = f."lead_id"
          WHERE f."organization_id" = ${org} AND f."status" IN ('SCHEDULED', 'MISSED') AND f."due_at" < ${now}
            AND fl."deleted_at" IS NULL
            AND ${members ? Prisma.sql`f."assigned_to_id" = ANY(${members}::uuid[])` : Prisma.sql`TRUE`}) AS "overdue"
      FROM "leads" l
      JOIN "lead_statuses" s ON s."organization_id" = l."organization_id" AND s."id" = l."status_id"
      WHERE l."organization_id" = ${org} AND l."deleted_at" IS NULL AND l."duplicate_status" <> 'MERGED'
        AND s."category" IN ('OPEN', 'ACTIVE', 'BOOKING') AND ${owner} ${dimSql}`,
  ]);
  const statuses = await ctx.db.leadStatus.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, label: true, color: true, category: true },
  });
  const counts = new Map(statusRows.map((row) => [row.status_id, row.count]));
  const byStatus = statuses
    .filter((status) => counts.has(status.id))
    .map((status) => ({
      statusId: status.id,
      key: status.key,
      label: status.label,
      color: status.color,
      category: status.category,
      count: counts.get(status.id)!,
    }));
  return {
    byStatus,
    open: byStatus
      .filter((status) => ["OPEN", "ACTIVE", "BOOKING"].includes(status.category))
      .reduce((total, status) => total + status.count, 0),
    pending: flags?.pending ?? 0,
    unworked: flags?.unworked ?? 0,
    overdueFollowUps: flags?.overdue ?? 0,
    unassigned: includeUnassigned ? (flags?.unassigned ?? 0) : null,
  };
}
