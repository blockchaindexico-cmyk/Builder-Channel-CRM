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

/**
 * Visits, bookings and closures per project in the period (M10-06 builder- and project-wise overview): three grouped
 * queries (interested leads, visits, bookings) merged per project.
 */
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
  const projectFilter = (alias: string) => {
    const table = Prisma.raw(alias);
    return Prisma.sql`${dims.projectId ? Prisma.sql`AND ${table}."project_id" = ${dims.projectId}::uuid` : Prisma.empty}
      ${dims.builderId ? Prisma.sql`AND ${table}."builder_id" = ${dims.builderId}::uuid` : Prisma.empty}`;
  };
  const { where: leadWhere } = await leadBase(
    ctx,
    { ...filters, projectId: null, builderId: null },
    resolved,
  );
  const [interested, visits, bookings, projects] = await Promise.all([
    ctx.db.$queryRaw<{ project_id: string; count: number }[]>`
      SELECT i."project_id", COUNT(DISTINCT l."id")::int AS "count"
      FROM "leads" l
      JOIN "lead_project_interests" i ON i."organization_id" = l."organization_id" AND i."lead_id" = l."id"
      WHERE ${leadWhere}
        ${dims.projectId ? Prisma.sql`AND i."project_id" = ${dims.projectId}::uuid` : Prisma.empty}
      GROUP BY 1`,
    ctx.db.$queryRaw<{ project_id: string; visits: number; revisits: number }[]>`
      SELECT v."project_id",
        COUNT(*) FILTER (WHERE NOT v."is_revisit")::int AS "visits",
        COUNT(*) FILTER (WHERE v."is_revisit")::int AS "revisits"
      FROM "site_visits" v
      WHERE v."organization_id" = ${org} AND v."status" = 'COMPLETED'
        AND v."completed_at" >= ${start} AND v."completed_at" < ${end}
        AND ${byMember(Prisma.sql`v."assigned_to_id"`)} ${projectFilter("v")}
      GROUP BY 1`,
    ctx.db.$queryRaw<
      { project_id: string; bookings: number; closures: number; cancellations: number }[]
    >`
      SELECT b."project_id",
        COUNT(*) FILTER (WHERE b."booking_date" >= ${filters.range.from}::date AND b."booking_date" <= ${filters.range.to}::date)::int AS "bookings",
        COUNT(*) FILTER (WHERE b."status" = 'CLOSED_WON' AND b."closed_at" >= ${start} AND b."closed_at" < ${end})::int AS "closures",
        COUNT(*) FILTER (WHERE b."status" = 'CANCELLED' AND b."cancelled_at" >= ${start} AND b."cancelled_at" < ${end})::int AS "cancellations"
      FROM "bookings" b
      WHERE b."organization_id" = ${org} AND ${byMember(Prisma.sql`b."executive_id"`)} ${projectFilter("b")}
        AND ((b."booking_date" >= ${filters.range.from}::date AND b."booking_date" <= ${filters.range.to}::date)
          OR (b."closed_at" >= ${start} AND b."closed_at" < ${end})
          OR (b."cancelled_at" >= ${start} AND b."cancelled_at" < ${end}))
      GROUP BY 1`,
    ctx.db.project.findMany({
      where: {
        ...(dims.projectId ? { id: dims.projectId } : {}),
        ...(dims.builderId ? { builderId: dims.builderId } : {}),
      },
      select: { id: true, name: true, builderId: true, builder: { select: { name: true } } },
    }),
  ]);
  const rows = new Map<string, ProjectPerformance>();
  const row = (projectId: string) => {
    let entry = rows.get(projectId);
    if (!entry) {
      entry = {
        projectId,
        projectName: "",
        builderId: "",
        builderName: "",
        interestedLeads: 0,
        visits: 0,
        revisits: 0,
        bookings: 0,
        closures: 0,
        cancellations: 0,
      };
      rows.set(projectId, entry);
    }
    return entry;
  };
  for (const entry of interested) row(entry.project_id).interestedLeads = entry.count;
  for (const entry of visits)
    Object.assign(row(entry.project_id), { visits: entry.visits, revisits: entry.revisits });
  for (const entry of bookings) {
    Object.assign(row(entry.project_id), {
      bookings: entry.bookings,
      closures: entry.closures,
      cancellations: entry.cancellations,
    });
  }
  const known = new Map(projects.map((project) => [project.id, project]));
  return [...rows.values()]
    .filter((entry) => known.has(entry.projectId))
    .map((entry) => {
      const project = known.get(entry.projectId)!;
      return {
        ...entry,
        projectName: project.name,
        builderId: project.builderId,
        builderName: project.builder.name,
      };
    })
    .filter(
      (entry) =>
        entry.interestedLeads +
          entry.visits +
          entry.revisits +
          entry.bookings +
          entry.closures +
          entry.cancellations >
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
