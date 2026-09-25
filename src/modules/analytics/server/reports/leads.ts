import { Prisma } from "@/generated/prisma/client";
import type { ServiceContext } from "@/platform/tenant/context";

import type { TabularReport } from "../catalog";
import type { FunnelCounts, SourcePerformance } from "../insights";
import { leadDimensionSql, leadOwnerSql, rangeSql } from "../lead-sql";
import { dimensionsOf } from "../metrics";
import type { ResolvedReport } from "../report-params";

/**
 * The lead database report (M10-10): every lead created in the period with its status, owner, source, projects and
 * milestones, for the scope and filters. It is analytical — contact details stay in the lead list and its export,
 * which have their own permission.
 */
export const LEAD_REPORT_MAX_ROWS = 100_000;

export interface LeadReportRow {
  id: string;
  number: string;
  name: string;
  status: string;
  category: string;
  ownerName: string | null;
  sourceName: string | null;
  campaignName: string | null;
  projects: string | null;
  temperature: string | null;
  createdAt: string;
  lastActivityAt: string;
  nextFollowUpAt: string | null;
  firstVisitAt: string | null;
  bookedAt: string | null;
  closedAt: string | null;
  lostAt: string | null;
  lossReason: string | null;
}

function leadWhere(ctx: ServiceContext, report: ResolvedReport) {
  const { start, end } = rangeSql(report.filters.range, report.scope.timezone);
  return Prisma.sql`l."organization_id" = ${ctx.organizationId}::uuid AND l."deleted_at" IS NULL
    AND l."duplicate_status" <> 'MERGED' AND l."created_at" >= ${start} AND l."created_at" < ${end}
    AND ${leadOwnerSql(report.scope, report.filters).sql} ${leadDimensionSql(dimensionsOf(report.filters))}`;
}

export async function leadReportRows(
  ctx: ServiceContext,
  report: ResolvedReport,
  page: { skip: number; take: number },
): Promise<{
  rows: LeadReportRow[];
  total: number;
  byStatus: { label: string; category: string; count: number }[];
}> {
  const where = leadWhere(ctx, report);
  const tz = report.scope.timezone;
  const local = (column: Prisma.Sql) =>
    Prisma.sql`to_char(${column} AT TIME ZONE ${tz}, 'YYYY-MM-DD HH24:MI')`;
  const [rows, [count], byStatus] = await Promise.all([
    ctx.db.$queryRaw<LeadReportRow[]>`
      SELECT l."id", l."number", l."name", s."label" AS "status", s."category"::text AS "category",
        u."name" AS "ownerName", src."name" AS "sourceName", c."name" AS "campaignName",
        (SELECT string_agg(p."name", ', ' ORDER BY p."name") FROM "lead_project_interests" i
           JOIN "projects" p ON p."organization_id" = i."organization_id" AND p."id" = i."project_id"
           WHERE i."organization_id" = l."organization_id" AND i."lead_id" = l."id") AS "projects",
        l."temperature"::text AS "temperature",
        ${local(Prisma.sql`l."created_at"`)} AS "createdAt",
        ${local(Prisma.sql`l."last_activity_at"`)} AS "lastActivityAt",
        ${local(Prisma.sql`l."next_follow_up_at"`)} AS "nextFollowUpAt",
        ${local(Prisma.sql`l."first_visit_at"`)} AS "firstVisitAt",
        ${local(Prisma.sql`l."booked_at"`)} AS "bookedAt",
        ${local(Prisma.sql`l."closed_at"`)} AS "closedAt",
        ${local(Prisma.sql`l."lost_at"`)} AS "lostAt",
        r."label" AS "lossReason"
      FROM "leads" l
      JOIN "lead_statuses" s ON s."organization_id" = l."organization_id" AND s."id" = l."status_id"
      LEFT JOIN "memberships" m ON m."organization_id" = l."organization_id" AND m."id" = l."owner_id"
      LEFT JOIN "users" u ON u."id" = m."user_id"
      LEFT JOIN "lead_sources" src ON src."organization_id" = l."organization_id" AND src."id" = l."source_id"
      LEFT JOIN "campaigns" c ON c."organization_id" = l."organization_id" AND c."id" = l."campaign_id"
      LEFT JOIN "loss_reasons" r ON r."organization_id" = l."organization_id" AND r."id" = l."loss_reason_id"
      WHERE ${where}
      ORDER BY l."created_at" DESC, l."id"
      LIMIT ${page.take} OFFSET ${page.skip}`,
    ctx.db.$queryRaw<
      { count: number }[]
    >`SELECT COUNT(*)::int AS "count" FROM "leads" l WHERE ${where}`,
    ctx.db.$queryRaw<{ label: string; category: string; count: number }[]>`
      SELECT s."label", s."category"::text AS "category", COUNT(*)::int AS "count"
      FROM "leads" l JOIN "lead_statuses" s ON s."organization_id" = l."organization_id" AND s."id" = l."status_id"
      WHERE ${where}
      GROUP BY s."label", s."category", s."sort_order" ORDER BY s."sort_order"`,
  ]);
  return { rows, total: count?.count ?? 0, byStatus };
}

export function leadsTable(rows: LeadReportRow[]): TabularReport {
  const columns: [string, number][] = [
    ["Lead", 14],
    ["Name", 26],
    ["Status", 16],
    ["Owner", 22],
    ["Source", 18],
    ["Campaign", 18],
    ["Projects", 30],
    ["Temperature", 12],
    ["Created", 17],
    ["Last activity", 17],
    ["Next follow-up", 17],
    ["First visit", 17],
    ["Booked", 17],
    ["Closed / won", 17],
    ["Lost", 17],
    ["Loss reason", 24],
  ];
  return {
    title: "Lead database",
    columns: columns.map(([header, width]) => ({ header, width })),
    rows: rows.map((row) => [
      row.number,
      row.name,
      row.status,
      row.ownerName,
      row.sourceName,
      row.campaignName,
      row.projects,
      row.temperature,
      row.createdAt,
      row.lastActivityAt,
      row.nextFollowUpAt,
      row.firstVisitAt,
      row.bookedAt,
      row.closedAt,
      row.lostAt,
      row.lossReason,
    ]),
  };
}

export function funnelTable(funnel: FunnelCounts, sources: SourcePerformance[]): TabularReport {
  const pct = (part: number, whole: number) =>
    whole ? Math.round((part / whole) * 1000) / 10 : null;
  const counts = (row: FunnelCounts) => [
    row.created,
    row.contacted,
    row.visited,
    row.booked,
    row.won,
    row.lost,
    pct(row.won, row.created),
    row.daysToContact,
    row.daysToVisit,
    row.daysToBooking,
    row.daysToWin,
  ];
  return {
    title: "Funnel & sources",
    columns: [
      { header: "Source", width: 22 },
      { header: "Campaign", width: 22 },
      ...[
        "Leads",
        "Contacted",
        "Visited",
        "Booked",
        "Won",
        "Lost",
        "Conversion %",
        "Days to contact",
        "Days to visit",
        "Days to booking",
        "Days to win",
      ].map((header) => ({ header, numeric: true, width: 12 })),
    ],
    rows: [
      ...sources.map((row) => [row.sourceName, row.campaignName, ...counts(row)]),
      ["All sources", null, ...counts(funnel)],
    ],
  };
}
