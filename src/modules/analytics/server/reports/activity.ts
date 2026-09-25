import { Prisma } from "@/generated/prisma/client";
import type { ServiceContext } from "@/platform/tenant/context";

import { addCounters, derived, emptyCounters } from "../../metrics";
import type { Cell, TabularReport } from "../catalog";
import { leadDimensionSql, leadOwnerSql, memberSql, rangeSql } from "../lead-sql";
import { dimensionsOf, getMemberMetrics, type MemberMetrics, type MetricValues } from "../metrics";
import type { ResolvedReport } from "../report-params";

/**
 * Activity reports (M10-09, M10-11 → M10-13): executives & teams, calling, follow-ups and site visits — all from the
 * shared counters, plus the few breakdowns counters cannot carry (per outcome, open follow-ups now).
 */
const pct = (value: number | null) => (value === null ? null : value);
const minutes = (seconds: number) => Math.round(seconds / 6) / 10;

// --- Executives & teams (M10-09) ----------------------------------------------------------------------------------------

export interface PerformanceRow {
  key: string;
  label: string;
  detail: string | null;
  members: number;
  values: MetricValues;
}

export async function executivesReport(
  ctx: ServiceContext,
  report: ResolvedReport,
): Promise<{ rows: PerformanceRow[]; total: MetricValues; grouping: "member" | "team" }> {
  const members = await getMemberMetrics(ctx, report.filters, report.scope);
  const grouping = report.group === "team" ? "team" : "member";
  const total = members.reduce((sum, member) => addCounters(sum, member.values), emptyCounters());
  let rows: PerformanceRow[];
  if (grouping === "member") {
    rows = members.map((member) => ({
      key: member.memberId,
      label: member.name,
      detail: member.managerName,
      members: 1,
      values: member.values,
    }));
  } else {
    const teams = new Map<string, { label: string; members: MemberMetrics[] }>();
    for (const member of members) {
      const key = member.managerId ?? "none";
      const team = teams.get(key) ?? { label: member.managerName ?? "No manager", members: [] };
      team.members.push(member);
      teams.set(key, team);
    }
    rows = [...teams.entries()].map(([key, team]) => {
      const values = team.members.reduce(
        (sum, member) => addCounters(sum, member.values),
        emptyCounters(),
      );
      return {
        key,
        label: `${team.label}'s team`,
        detail: team.members.map((member) => member.name).join(", "),
        members: team.members.length,
        values: { ...values, ...derived(values) },
      };
    });
  }
  rows.sort(
    (a, b) =>
      b.values.closures - a.values.closures ||
      b.values.bookings - a.values.bookings ||
      b.values.calls - a.values.calls ||
      a.label.localeCompare(b.label),
  );
  return { rows, total: { ...total, ...derived(total) }, grouping };
}

export function performanceTable(
  title: string,
  first: string,
  rows: PerformanceRow[],
): TabularReport {
  const columns = [
    { header: first, width: 26 },
    { header: "Manager / members", width: 30 },
    ...[
      "Leads assigned",
      "Calls",
      "Connected",
      "Connect %",
      "Positive",
      "Negative",
      "Unresponsive",
      "Talk (min)",
      "Follow-ups due",
      "Follow-ups done",
      "On time %",
      "Missed",
      "Visits",
      "Revisits",
      "No-shows",
      "Bookings",
      "Closed",
      "Cancelled",
      "Lost",
      "Not interested",
    ].map((header) => ({ header, numeric: true, width: 12 })),
  ];
  return {
    title,
    columns,
    rows: rows.map((row): Cell[] => {
      const v = row.values;
      return [
        row.label,
        row.detail,
        v.leadsAssigned,
        v.calls,
        v.callsConnected,
        pct(v.connectRate),
        v.callsPositive,
        v.callsNegative,
        v.callsUnresponsive,
        minutes(v.talkSeconds),
        v.followUpsDue,
        v.followUpsCompleted,
        pct(v.followUpAdherence),
        v.followUpsMissed,
        v.visitsCompleted,
        v.revisitsCompleted,
        v.visitsNoShow,
        v.bookings,
        v.closures,
        v.bookingsCancelled,
        v.lost,
        v.notInterested,
      ];
    }),
  };
}

// --- Calling (M10-11) ---------------------------------------------------------------------------------------------------

export interface OutcomeCount {
  key: string;
  label: string;
  category: string;
  count: number;
}

/** Calls of the period per outcome (the master list), for the scope and filters. */
export async function callsByOutcome(
  ctx: ServiceContext,
  report: ResolvedReport,
): Promise<OutcomeCount[]> {
  const { start, end } = rangeSql(report.filters.range, report.scope.timezone);
  const rows = await ctx.db.$queryRaw<
    { id: string; label: string; category: string; count: number }[]
  >`
    SELECT o."id", o."label", o."category"::text AS "category", COUNT(*)::int AS "count"
    FROM "call_logs" c
    JOIN "call_outcomes" o ON o."organization_id" = c."organization_id" AND o."id" = c."outcome_id"
    JOIN "leads" l ON l."organization_id" = c."organization_id" AND l."id" = c."lead_id"
    WHERE c."organization_id" = ${ctx.organizationId}::uuid AND c."started_at" >= ${start} AND c."started_at" < ${end}
      AND ${memberSql(report.scope, Prisma.sql`c."caller_id"`)} AND l."deleted_at" IS NULL
      ${leadDimensionSql(dimensionsOf(report.filters))}
    GROUP BY 1, 2, 3
    ORDER BY 4 DESC, 2`;
  return rows.map((row) => ({
    key: row.id,
    label: row.label,
    category: row.category,
    count: row.count,
  }));
}

export function callsTable(members: MemberMetrics[]): TabularReport {
  return {
    title: "Calling",
    columns: [
      { header: "Executive", width: 26 },
      ...[
        "Calls",
        "Connected",
        "Connect %",
        "Positive",
        "Negative",
        "Unresponsive",
        "Callbacks",
        "Talk (min)",
        "Avg call (min)",
      ].map((header) => ({ header, numeric: true, width: 12 })),
    ],
    rows: members.map((member) => {
      const v = member.values;
      return [
        member.name,
        v.calls,
        v.callsConnected,
        pct(v.connectRate),
        v.callsPositive,
        v.callsNegative,
        v.callsUnresponsive,
        v.callsCallback,
        minutes(v.talkSeconds),
        v.callsConnected ? minutes(v.talkSeconds / v.callsConnected) : null,
      ];
    }),
  };
}

// --- Follow-ups (M10-12) ------------------------------------------------------------------------------------------------

export interface OpenFollowUps {
  memberId: string;
  upcoming: number;
  overdue: number;
  callbacksUpcoming: number;
}

/** Follow-ups still to do right now, per assignee: upcoming and overdue (M10-12). */
export async function openFollowUps(
  ctx: ServiceContext,
  report: ResolvedReport,
): Promise<OpenFollowUps[]> {
  const now = new Date();
  return ctx.db.$queryRaw<OpenFollowUps[]>`
    SELECT f."assigned_to_id" AS "memberId",
      COUNT(*) FILTER (WHERE f."status" = 'SCHEDULED' AND f."due_at" >= ${now})::int AS "upcoming",
      COUNT(*) FILTER (WHERE f."due_at" < ${now})::int AS "overdue",
      COUNT(*) FILTER (WHERE f."status" = 'SCHEDULED' AND f."due_at" >= ${now} AND f."type" = 'CALLBACK')::int AS "callbacksUpcoming"
    FROM "follow_ups" f
    JOIN "leads" l ON l."organization_id" = f."organization_id" AND l."id" = f."lead_id"
    WHERE f."organization_id" = ${ctx.organizationId}::uuid AND f."status" IN ('SCHEDULED', 'MISSED')
      AND f."assigned_to_id" IS NOT NULL AND ${memberSql(report.scope, Prisma.sql`f."assigned_to_id"`)}
      AND l."deleted_at" IS NULL ${leadDimensionSql(dimensionsOf(report.filters))}
    GROUP BY 1`;
}

export function followUpsTable(members: MemberMetrics[], open: OpenFollowUps[]): TabularReport {
  const openBy = new Map(open.map((row) => [row.memberId, row]));
  return {
    title: "Follow-ups",
    columns: [
      { header: "Executive", width: 26 },
      ...["Due", "Done", "On time", "Adherence %", "Missed", "Upcoming now", "Overdue now"].map(
        (header) => ({
          header,
          numeric: true,
          width: 12,
        }),
      ),
    ],
    rows: members.map((member) => {
      const v = member.values;
      const now = openBy.get(member.memberId);
      return [
        member.name,
        v.followUpsDue,
        v.followUpsCompleted,
        v.followUpsOnTime,
        pct(v.followUpAdherence),
        v.followUpsMissed,
        now?.upcoming ?? 0,
        now?.overdue ?? 0,
      ];
    }),
  };
}

// --- Site visits (M10-13) -----------------------------------------------------------------------------------------------

/** Completed visits of the period by recorded outcome. */
export async function visitsByOutcome(
  ctx: ServiceContext,
  report: ResolvedReport,
): Promise<OutcomeCount[]> {
  const { start, end } = rangeSql(report.filters.range, report.scope.timezone);
  const dims = dimensionsOf(report.filters);
  const rows = await ctx.db.$queryRaw<
    { id: string | null; label: string | null; category: string | null; count: number }[]
  >`
    SELECT vo."id", vo."label", vo."category"::text AS "category", COUNT(*)::int AS "count"
    FROM "site_visits" v
    JOIN "leads" l ON l."organization_id" = v."organization_id" AND l."id" = v."lead_id"
    LEFT JOIN "visit_outcomes" vo ON vo."organization_id" = v."organization_id" AND vo."id" = v."outcome_id"
    WHERE v."organization_id" = ${ctx.organizationId}::uuid AND v."status" = 'COMPLETED'
      AND v."completed_at" >= ${start} AND v."completed_at" < ${end}
      AND ${memberSql(report.scope, Prisma.sql`v."assigned_to_id"`)} AND l."deleted_at" IS NULL
      ${dims.projectId ? Prisma.sql`AND v."project_id" = ${dims.projectId}::uuid` : Prisma.empty}
      ${dims.builderId ? Prisma.sql`AND v."builder_id" = ${dims.builderId}::uuid` : Prisma.empty}
      ${dims.sourceId ? Prisma.sql`AND l."source_id" = ${dims.sourceId}::uuid` : Prisma.empty}
    GROUP BY 1, 2, 3
    ORDER BY 4 DESC`;
  return rows.map((row) => ({
    key: row.id ?? "none",
    label: row.label ?? "No outcome recorded",
    category: row.category ?? "NONE",
    count: row.count,
  }));
}

export interface VisitConversion {
  visited: number;
  booked: number;
  won: number;
}

/** Of the leads whose first visit fell in the period, how many were booked and closed (visit → booking/closure). */
export async function visitConversion(
  ctx: ServiceContext,
  report: ResolvedReport,
): Promise<VisitConversion> {
  const { start, end } = rangeSql(report.filters.range, report.scope.timezone);
  const [row] = await ctx.db.$queryRaw<VisitConversion[]>`
    SELECT COUNT(*)::int AS "visited",
      COUNT(*) FILTER (WHERE l."booked_at" IS NOT NULL OR l."closed_at" IS NOT NULL)::int AS "booked",
      COUNT(*) FILTER (WHERE l."closed_at" IS NOT NULL)::int AS "won"
    FROM "leads" l
    WHERE l."organization_id" = ${ctx.organizationId}::uuid AND l."deleted_at" IS NULL
      AND l."first_visit_at" >= ${start} AND l."first_visit_at" < ${end}
      AND ${leadOwnerSql(report.scope, report.filters).sql} ${leadDimensionSql(dimensionsOf(report.filters))}`;
  return row ?? { visited: 0, booked: 0, won: 0 };
}

export function visitsTable(members: MemberMetrics[]): TabularReport {
  return {
    title: "Site visits",
    columns: [
      { header: "Executive", width: 26 },
      ...["Visits", "Revisits", "No-shows", "Bookings", "Closed", "Visit → booking %"].map(
        (header) => ({
          header,
          numeric: true,
          width: 14,
        }),
      ),
    ],
    rows: members.map((member) => {
      const v = member.values;
      return [
        member.name,
        v.visitsCompleted,
        v.revisitsCompleted,
        v.visitsNoShow,
        v.bookings,
        v.closures,
        pct(v.visitToBooking),
      ];
    }),
  };
}
