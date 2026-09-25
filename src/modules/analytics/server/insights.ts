import { Prisma } from "@/generated/prisma/client";
import type { ServiceContext } from "@/platform/tenant/context";

import { leadDimensionSql, leadOwnerSql, rangeSql } from "./lead-sql";
import { dimensionsOf, type ReportFilters, type ReportScope, resolveReportScope } from "./metrics";

/**
 * Lead-journey figures for dashboards and reports (M10-05, M10-06, M10-16): the cohort funnel of leads created in
 * the period, performance by source and campaign, by project and builder, and today's agenda counts. Funnel stages
 * are cumulative — a lead booked without a recorded visit still counts as visited and contacted — so every stage is
 * a subset of the one before.
 */
export interface FunnelCounts {
  created: number;
  contacted: number;
  visited: number;
  booked: number;
  won: number;
  lost: number;
  /** Average days from creation to each milestone, for the leads that reached it. */
  daysToContact: number | null;
  daysToVisit: number | null;
  daysToBooking: number | null;
  daysToWin: number | null;
}

type FunnelRow = Record<keyof FunnelCounts, number | null>;

const funnelColumns = Prisma.sql`
  COUNT(*)::int AS "created",
  COUNT(*) FILTER (WHERE l."last_contacted_at" IS NOT NULL OR l."first_visit_at" IS NOT NULL OR l."booked_at" IS NOT NULL
    OR l."closed_at" IS NOT NULL)::int AS "contacted",
  COUNT(*) FILTER (WHERE l."first_visit_at" IS NOT NULL OR l."booked_at" IS NOT NULL OR l."closed_at" IS NOT NULL)::int AS "visited",
  COUNT(*) FILTER (WHERE l."booked_at" IS NOT NULL OR l."closed_at" IS NOT NULL)::int AS "booked",
  COUNT(*) FILTER (WHERE l."closed_at" IS NOT NULL)::int AS "won",
  COUNT(*) FILTER (WHERE l."lost_at" IS NOT NULL)::int AS "lost",
  ROUND(AVG(EXTRACT(EPOCH FROM ((SELECT MIN(c."started_at") FROM "call_logs" c WHERE c."organization_id" = l."organization_id"
    AND c."lead_id" = l."id" AND c."connected") - l."created_at")) / 86400) FILTER (WHERE l."last_contacted_at" IS NOT NULL)::numeric, 1)::float AS "daysToContact",
  ROUND(AVG(EXTRACT(EPOCH FROM (l."first_visit_at" - l."created_at")) / 86400) FILTER (WHERE l."first_visit_at" >= l."created_at")::numeric, 1)::float AS "daysToVisit",
  ROUND(AVG(EXTRACT(EPOCH FROM (l."booked_at" - l."created_at")) / 86400) FILTER (WHERE l."booked_at" >= l."created_at")::numeric, 1)::float AS "daysToBooking",
  ROUND(AVG(EXTRACT(EPOCH FROM (l."closed_at" - l."created_at")) / 86400) FILTER (WHERE l."closed_at" >= l."created_at")::numeric, 1)::float AS "daysToWin"`;

const toFunnel = (row: FunnelRow | undefined): FunnelCounts => ({
  created: Number(row?.created ?? 0),
  contacted: Number(row?.contacted ?? 0),
  visited: Number(row?.visited ?? 0),
  booked: Number(row?.booked ?? 0),
  won: Number(row?.won ?? 0),
  lost: Number(row?.lost ?? 0),
  daysToContact: row?.daysToContact ?? null,
  daysToVisit: row?.daysToVisit ?? null,
  daysToBooking: row?.daysToBooking ?? null,
  daysToWin: row?.daysToWin ?? null,
});

async function leadBase(ctx: ServiceContext, filters: ReportFilters, scope?: ReportScope) {
  const resolved = scope ?? (await resolveReportScope(ctx, filters));
  const { start, end } = rangeSql(filters.range, resolved.timezone);
  const where = Prisma.sql`l."organization_id" = ${ctx.organizationId}::uuid AND l."deleted_at" IS NULL
    AND l."duplicate_status" <> 'MERGED' AND l."created_at" >= ${start} AND l."created_at" < ${end}
    AND ${leadOwnerSql(resolved, filters).sql} ${leadDimensionSql(dimensionsOf(filters))}`;
  return { resolved, where };
}

/** How far the leads created in the period have come (cohort funnel). */
export async function getFunnel(
  ctx: ServiceContext,
  filters: ReportFilters,
  scope?: ReportScope,
): Promise<FunnelCounts> {
  const { where } = await leadBase(ctx, filters, scope);
  const [row] = await ctx.db.$queryRaw<
    FunnelRow[]
  >`SELECT ${funnelColumns} FROM "leads" l WHERE ${where}`;
  return toFunnel(row);
}

export interface SourcePerformance extends FunnelCounts {
  key: string;
  sourceId: string | null;
  sourceName: string;
  campaignId: string | null;
  campaignName: string | null;
}

/** The cohort funnel per source (and campaign when `byCampaign`) — M10-16 source/campaign performance. */
export async function getSourcePerformance(
  ctx: ServiceContext,
  filters: ReportFilters,
  options: { byCampaign?: boolean } = {},
  scope?: ReportScope,
): Promise<SourcePerformance[]> {
  const { where } = await leadBase(ctx, filters, scope);
  const campaign = options.byCampaign ? Prisma.sql`l."campaign_id"` : Prisma.sql`NULL::uuid`;
  const rows = await ctx.db.$queryRaw<
    (FunnelRow & { source_id: string | null; campaign_id: string | null })[]
  >`
    SELECT l."source_id", ${campaign} AS "campaign_id", ${funnelColumns}
    FROM "leads" l WHERE ${where}
    GROUP BY 1, 2`;
  const [sources, campaigns] = await Promise.all([
    ctx.db.leadSource.findMany({ select: { id: true, name: true } }),
    options.byCampaign
      ? ctx.db.campaign.findMany({ select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const sourceName = new Map(sources.map((source) => [source.id, source.name]));
  const campaignName = new Map(campaigns.map((entry) => [entry.id, entry.name]));
  return rows
    .map((row) => ({
      key: `${row.source_id ?? "none"}:${row.campaign_id ?? "none"}`,
      sourceId: row.source_id,
      sourceName: row.source_id ? (sourceName.get(row.source_id) ?? "Unknown source") : "No source",
      campaignId: row.campaign_id,
      campaignName: row.campaign_id
        ? (campaignName.get(row.campaign_id) ?? "Unknown campaign")
        : null,
      ...toFunnel(row),
    }))
    .sort((a, b) => b.created - a.created || a.sourceName.localeCompare(b.sourceName));
}

export interface ProjectPerformance {
  projectId: string;
  projectName: string;
  builderId: string;
  builderName: string;
  /** Leads created in the period that are interested in the project. */
  interestedLeads: number;
  visits: number;
  revisits: number;
  bookings: number;
  closures: number;
  cancellations: number;
}

/** Visits, bookings and closures per project in the period (M10-06 builder- and project-wise overview). */
export async function getProjectPerformance(
  ctx: ServiceContext,
  filters: ReportFilters,
  scope?: ReportScope,
): Promise<ProjectPerformance[]> {
  const resolved = scope ?? (await resolveReportScope(ctx, filters));
  const { start, end } = rangeSql(filters.range, resolved.timezone);
  const org = Prisma.sql`${ctx.organizationId}::uuid`;
  const members = resolved.memberIds;
  const byMember = (column: Prisma.Sql) =>
    members ? Prisma.sql`${column} = ANY(${members}::uuid[])` : Prisma.sql`TRUE`;
  const dims = dimensionsOf(filters);
  const projectFilter = Prisma.sql`${dims.projectId ? Prisma.sql`AND p."id" = ${dims.projectId}::uuid` : Prisma.empty}
    ${dims.builderId ? Prisma.sql`AND p."builder_id" = ${dims.builderId}::uuid` : Prisma.empty}`;
  const { where: leadWhere } = await leadBase(
    ctx,
    { ...filters, projectId: null, builderId: null },
    resolved,
  );
  const rows = await ctx.db.$queryRaw<
    (Omit<ProjectPerformance, "projectName" | "builderName"> & {
      project_name: string;
      builder_name: string;
    })[]
  >`
    SELECT p."id" AS "projectId", p."name" AS project_name, b."id" AS "builderId", b."name" AS builder_name,
      (SELECT COUNT(DISTINCT l."id")::int FROM "leads" l JOIN "lead_project_interests" i
         ON i."organization_id" = l."organization_id" AND i."lead_id" = l."id" AND i."project_id" = p."id"
       WHERE ${leadWhere}) AS "interestedLeads",
      (SELECT COUNT(*)::int FROM "site_visits" v WHERE v."organization_id" = ${org} AND v."project_id" = p."id"
         AND v."status" = 'COMPLETED' AND NOT v."is_revisit" AND v."completed_at" >= ${start} AND v."completed_at" < ${end}
         AND ${byMember(Prisma.sql`v."assigned_to_id"`)}) AS "visits",
      (SELECT COUNT(*)::int FROM "site_visits" v WHERE v."organization_id" = ${org} AND v."project_id" = p."id"
         AND v."status" = 'COMPLETED' AND v."is_revisit" AND v."completed_at" >= ${start} AND v."completed_at" < ${end}
         AND ${byMember(Prisma.sql`v."assigned_to_id"`)}) AS "revisits",
      (SELECT COUNT(*)::int FROM "bookings" bk WHERE bk."organization_id" = ${org} AND bk."project_id" = p."id"
         AND bk."booking_date" >= ${filters.range.from}::date AND bk."booking_date" <= ${filters.range.to}::date
         AND ${byMember(Prisma.sql`bk."executive_id"`)}) AS "bookings",
      (SELECT COUNT(*)::int FROM "bookings" bk WHERE bk."organization_id" = ${org} AND bk."project_id" = p."id"
         AND bk."status" = 'CLOSED_WON' AND bk."closed_at" >= ${start} AND bk."closed_at" < ${end}
         AND ${byMember(Prisma.sql`bk."executive_id"`)}) AS "closures",
      (SELECT COUNT(*)::int FROM "bookings" bk WHERE bk."organization_id" = ${org} AND bk."project_id" = p."id"
         AND bk."status" = 'CANCELLED' AND bk."cancelled_at" >= ${start} AND bk."cancelled_at" < ${end}
         AND ${byMember(Prisma.sql`bk."executive_id"`)}) AS "cancellations"
    FROM "projects" p
    JOIN "builders" b ON b."organization_id" = p."organization_id" AND b."id" = p."builder_id"
    WHERE p."organization_id" = ${org} ${projectFilter}`;
  return rows
    .map(({ project_name, builder_name, ...row }) => ({
      ...row,
      projectName: project_name,
      builderName: builder_name,
    }))
    .filter(
      (row) =>
        row.interestedLeads +
          row.visits +
          row.revisits +
          row.bookings +
          row.closures +
          row.cancellations >
        0,
    )
    .sort(
      (a, b) =>
        b.bookings - a.bookings || b.visits - a.visits || b.interestedLeads - a.interestedLeads,
    );
}

export interface AgendaToday {
  followUpsDue: number;
  callbacksDue: number;
  followUpsDone: number;
  overdue: number;
  visitsToday: number;
}

/** What is planned for today in the organization's time zone, for the scope's members (M10-04 "My Day"). */
export async function getAgendaToday(
  ctx: ServiceContext,
  scope: ReportScope,
  now = new Date(),
): Promise<AgendaToday> {
  const { start, end } = rangeSql({ from: scope.today, to: scope.today }, scope.timezone);
  const org = Prisma.sql`${ctx.organizationId}::uuid`;
  const members = scope.memberIds;
  const assigned = (column: Prisma.Sql) =>
    members ? Prisma.sql`${column} = ANY(${members}::uuid[])` : Prisma.sql`TRUE`;
  const [row] = await ctx.db.$queryRaw<AgendaToday[]>`
    SELECT
      (SELECT COUNT(*)::int FROM "follow_ups" f WHERE f."organization_id" = ${org} AND f."type" = 'FOLLOW_UP'
         AND f."status" IN ('SCHEDULED', 'MISSED', 'COMPLETED') AND f."due_at" >= ${start} AND f."due_at" < ${end}
         AND ${assigned(Prisma.sql`f."assigned_to_id"`)}) AS "followUpsDue",
      (SELECT COUNT(*)::int FROM "follow_ups" f WHERE f."organization_id" = ${org} AND f."type" = 'CALLBACK'
         AND f."status" IN ('SCHEDULED', 'MISSED', 'COMPLETED') AND f."due_at" >= ${start} AND f."due_at" < ${end}
         AND ${assigned(Prisma.sql`f."assigned_to_id"`)}) AS "callbacksDue",
      (SELECT COUNT(*)::int FROM "follow_ups" f WHERE f."organization_id" = ${org} AND f."status" = 'COMPLETED'
         AND f."completed_at" >= ${start} AND f."completed_at" < ${end}
         AND ${assigned(Prisma.sql`COALESCE(f."completed_by_id", f."assigned_to_id")`)}) AS "followUpsDone",
      (SELECT COUNT(*)::int FROM "follow_ups" f WHERE f."organization_id" = ${org}
         AND f."status" IN ('SCHEDULED', 'MISSED') AND f."due_at" < ${now}
         AND ${assigned(Prisma.sql`f."assigned_to_id"`)}) AS "overdue",
      (SELECT COUNT(*)::int FROM "site_visits" v WHERE v."organization_id" = ${org}
         AND v."status" IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW')
         AND v."scheduled_at" >= ${start} AND v."scheduled_at" < ${end}
         AND ${assigned(Prisma.sql`v."assigned_to_id"`)}) AS "visitsToday"`;
  return row ?? { followUpsDue: 0, callbacksDue: 0, followUpsDone: 0, overdue: 0, visitsToday: 0 };
}
