import { Prisma } from "@/generated/prisma/client";
import { DEAL_PERMISSIONS } from "@/modules/deals";
import type { ServiceContext } from "@/platform/tenant/context";

import type { TabularReport } from "../catalog";
import { leadDimensionSql, leadOwnerSql, memberSql, rangeSql } from "../lead-sql";
import { dimensionsOf } from "../metrics";
import type { ResolvedReport } from "../report-params";

/**
 * Deal reports (M10-14, M10-15): bookings and closed business grouped by builder, project, manager, executive or
 * month; lost and not-interested leads by reason, executive and source. Values only for viewers allowed to see them.
 */
export const BOOKING_GROUPS = [
  { value: "builder", label: "Builder" },
  { value: "project", label: "Project" },
  { value: "manager", label: "Manager" },
  { value: "executive", label: "Executive" },
  { value: "month", label: "Month" },
] as const;
export type BookingGroup = (typeof BOOKING_GROUPS)[number]["value"];

export interface BookingGroupRow {
  key: string;
  label: string;
  bookings: number;
  closures: number;
  cancellations: number;
  /** Agreement value booked / closed in the period; null when the viewer may not see values. */
  bookedValue: string | null;
  closedValue: string | null;
}

export async function bookingsReport(
  ctx: ServiceContext,
  report: ResolvedReport,
): Promise<{
  group: BookingGroup;
  rows: BookingGroupRow[];
  total: BookingGroupRow;
  values: boolean;
}> {
  const group = BOOKING_GROUPS.find((entry) => entry.value === report.group)?.value ?? "project";
  const values = ctx.permissions.has(DEAL_PERMISSIONS.bookingsViewValue);
  const tz = report.scope.timezone;
  const { start, end } = rangeSql(report.filters.range, tz);
  const dims = dimensionsOf(report.filters);
  const where = Prisma.sql`b."organization_id" = ${ctx.organizationId}::uuid AND l."deleted_at" IS NULL
    AND ${memberSql(report.scope, Prisma.sql`b."executive_id"`)}
    ${dims.projectId ? Prisma.sql`AND b."project_id" = ${dims.projectId}::uuid` : Prisma.empty}
    ${dims.builderId ? Prisma.sql`AND b."builder_id" = ${dims.builderId}::uuid` : Prisma.empty}
    ${dims.sourceId ? Prisma.sql`AND l."source_id" = ${dims.sourceId}::uuid` : Prisma.empty}`;
  const from = Prisma.sql`FROM "bookings" b JOIN "leads" l ON l."organization_id" = b."organization_id" AND l."id" = b."lead_id"`;
  const key = (day: Prisma.Sql) =>
    group === "builder"
      ? Prisma.sql`b."builder_id"::text`
      : group === "project"
        ? Prisma.sql`b."project_id"::text`
        : group === "manager"
          ? Prisma.sql`COALESCE(b."manager_id"::text, 'none')`
          : group === "executive"
            ? Prisma.sql`b."executive_id"::text`
            : Prisma.sql`to_char(${day}, 'YYYY-MM')`;
  const closedDay = Prisma.sql`(b."closed_at" AT TIME ZONE ${tz})::date`;
  const cancelledDay = Prisma.sql`(b."cancelled_at" AT TIME ZONE ${tz})::date`;
  const rows = await ctx.db.$queryRaw<
    {
      key: string;
      bookings: number;
      closures: number;
      cancellations: number;
      booked_value: string | null;
      closed_value: string | null;
    }[]
  >`
    WITH ev AS (
      SELECT 'booked' AS kind, ${key(Prisma.sql`b."booking_date"`)} AS key, b."agreement_value" AS value ${from}
      WHERE ${where} AND b."booking_date" >= ${report.filters.range.from}::date AND b."booking_date" <= ${report.filters.range.to}::date
      UNION ALL
      SELECT 'closed', ${key(closedDay)}, b."agreement_value" ${from}
      WHERE ${where} AND b."status" = 'CLOSED_WON' AND b."closed_at" >= ${start} AND b."closed_at" < ${end}
      UNION ALL
      SELECT 'cancelled', ${key(cancelledDay)}, b."agreement_value" ${from}
      WHERE ${where} AND b."status" = 'CANCELLED' AND b."cancelled_at" >= ${start} AND b."cancelled_at" < ${end}
    )
    SELECT key,
      COUNT(*) FILTER (WHERE kind = 'booked')::int AS "bookings",
      COUNT(*) FILTER (WHERE kind = 'closed')::int AS "closures",
      COUNT(*) FILTER (WHERE kind = 'cancelled')::int AS "cancellations",
      COALESCE(SUM(value) FILTER (WHERE kind = 'booked'), 0)::text AS "booked_value",
      COALESCE(SUM(value) FILTER (WHERE kind = 'closed'), 0)::text AS "closed_value"
    FROM ev GROUP BY key`;
  const labels = await groupLabels(
    ctx,
    group,
    rows.map((row) => row.key),
  );
  const result = rows.map((row) => ({
    key: row.key,
    label: labels.get(row.key) ?? (row.key === "none" ? "No manager" : row.key),
    bookings: row.bookings,
    closures: row.closures,
    cancellations: row.cancellations,
    bookedValue: values ? row.booked_value : null,
    closedValue: values ? row.closed_value : null,
  }));
  result.sort((a, b) =>
    group === "month"
      ? a.key.localeCompare(b.key)
      : b.closures - a.closures || b.bookings - a.bookings || a.label.localeCompare(b.label),
  );
  const sum = (field: "bookedValue" | "closedValue") =>
    values
      ? result
          .reduce(
            (total, row) => total.plus(new Prisma.Decimal(row[field] ?? 0)),
            new Prisma.Decimal(0),
          )
          .toFixed(2)
      : null;
  return {
    group,
    values,
    rows: result,
    total: {
      key: "total",
      label: "Total",
      bookings: result.reduce((total, row) => total + row.bookings, 0),
      closures: result.reduce((total, row) => total + row.closures, 0),
      cancellations: result.reduce((total, row) => total + row.cancellations, 0),
      bookedValue: sum("bookedValue"),
      closedValue: sum("closedValue"),
    },
  };
}

async function groupLabels(ctx: ServiceContext, group: BookingGroup, keys: string[]) {
  const ids = keys.filter((key) => /^[0-9a-f-]{36}$/.test(key));
  const labels = new Map<string, string>();
  if (group === "builder") {
    for (const builder of await ctx.db.builder.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    })) {
      labels.set(builder.id, builder.name);
    }
  } else if (group === "project") {
    for (const project of await ctx.db.project.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, builder: { select: { name: true } } },
    })) {
      labels.set(project.id, `${project.name} · ${project.builder.name}`);
    }
  } else if (group === "manager" || group === "executive") {
    for (const member of await ctx.db.membership.findMany({
      where: { id: { in: ids } },
      select: { id: true, user: { select: { name: true } } },
    })) {
      labels.set(member.id, member.user.name);
    }
  }
  return labels;
}

export function bookingsTable(data: Awaited<ReturnType<typeof bookingsReport>>): TabularReport {
  const groupLabel = BOOKING_GROUPS.find((entry) => entry.value === data.group)!.label;
  const money = { numeric: true, width: 16, numFmt: "#,##0.00" };
  return {
    title: "Bookings & closed business",
    columns: [
      { header: groupLabel, width: 30 },
      { header: "Bookings", numeric: true, width: 10 },
      { header: "Closed / won", numeric: true, width: 12 },
      { header: "Cancelled", numeric: true, width: 10 },
      ...(data.values
        ? [
            { header: "Value booked", ...money },
            { header: "Value closed", ...money },
          ]
        : []),
    ],
    rows: [...data.rows, data.total].map((row) => [
      row.label,
      row.bookings,
      row.closures,
      row.cancellations,
      ...(data.values ? [Number(row.bookedValue), Number(row.closedValue)] : []),
    ]),
  };
}

// --- Lost leads (M10-15) ------------------------------------------------------------------------------------------------

export interface LostBreakdownRow {
  key: string;
  label: string;
  lost: number;
  notInterested: number;
}

export interface LostLead {
  id: string;
  number: string;
  name: string;
  status: string;
  reason: string | null;
  ownerName: string | null;
  sourceName: string | null;
  lostAt: string;
}

export async function lostReport(ctx: ServiceContext, report: ResolvedReport, limit = 200) {
  const { start, end } = rangeSql(report.filters.range, report.scope.timezone);
  const where = Prisma.sql`l."organization_id" = ${ctx.organizationId}::uuid AND l."deleted_at" IS NULL
    AND s."category" = 'LOST' AND l."lost_at" >= ${start} AND l."lost_at" < ${end}
    AND ${leadOwnerSql(report.scope, report.filters).sql} ${leadDimensionSql(dimensionsOf(report.filters))}`;
  const breakdown = (column: Prisma.Sql, label: Prisma.Sql, joins: Prisma.Sql) =>
    ctx.db.$queryRaw<
      { key: string | null; label: string | null; lost: number; notInterested: number }[]
    >`
      SELECT ${column}::text AS "key", ${label} AS "label",
        COUNT(*) FILTER (WHERE s."key" <> 'NOT_INTERESTED')::int AS "lost",
        COUNT(*) FILTER (WHERE s."key" = 'NOT_INTERESTED')::int AS "notInterested"
      FROM "leads" l
      JOIN "lead_statuses" s ON s."organization_id" = l."organization_id" AND s."id" = l."status_id"
      ${joins}
      WHERE ${where}
      GROUP BY 1, 2
      ORDER BY COUNT(*) DESC, 2`;
  const [byReason, byOwner, bySource, recent] = await Promise.all([
    breakdown(
      Prisma.sql`l."loss_reason_id"`,
      Prisma.sql`r."label"`,
      Prisma.sql`LEFT JOIN "loss_reasons" r ON r."organization_id" = l."organization_id" AND r."id" = l."loss_reason_id"`,
    ),
    breakdown(
      Prisma.sql`l."owner_id"`,
      Prisma.sql`u."name"`,
      Prisma.sql`LEFT JOIN "memberships" m ON m."organization_id" = l."organization_id" AND m."id" = l."owner_id"
        LEFT JOIN "users" u ON u."id" = m."user_id"`,
    ),
    breakdown(
      Prisma.sql`l."source_id"`,
      Prisma.sql`src."name"`,
      Prisma.sql`LEFT JOIN "lead_sources" src ON src."organization_id" = l."organization_id" AND src."id" = l."source_id"`,
    ),
    ctx.db.$queryRaw<LostLead[]>`
      SELECT l."id", l."number", l."name", s."label" AS "status", r."label" AS "reason", u."name" AS "ownerName",
        src."name" AS "sourceName",
        to_char(l."lost_at" AT TIME ZONE ${report.scope.timezone}, 'YYYY-MM-DD HH24:MI') AS "lostAt"
      FROM "leads" l
      JOIN "lead_statuses" s ON s."organization_id" = l."organization_id" AND s."id" = l."status_id"
      LEFT JOIN "loss_reasons" r ON r."organization_id" = l."organization_id" AND r."id" = l."loss_reason_id"
      LEFT JOIN "memberships" m ON m."organization_id" = l."organization_id" AND m."id" = l."owner_id"
      LEFT JOIN "users" u ON u."id" = m."user_id"
      LEFT JOIN "lead_sources" src ON src."organization_id" = l."organization_id" AND src."id" = l."source_id"
      WHERE ${where}
      ORDER BY l."lost_at" DESC
      LIMIT ${limit}`,
  ]);
  const shape = (rows: typeof byReason, none: string): LostBreakdownRow[] =>
    rows.map((row) => ({
      key: row.key ?? "none",
      label: row.label ?? none,
      lost: row.lost,
      notInterested: row.notInterested,
    }));
  return {
    byReason: shape(byReason, "No reason recorded"),
    byOwner: shape(byOwner, "Unassigned"),
    bySource: shape(bySource, "No source"),
    recent,
    lost: byReason.reduce((total, row) => total + row.lost, 0),
    notInterested: byReason.reduce((total, row) => total + row.notInterested, 0),
  };
}

export function lostTable(recent: LostLead[]): TabularReport {
  return {
    title: "Lost leads",
    columns: [
      { header: "Lead", width: 14 },
      { header: "Name", width: 26 },
      { header: "Status", width: 16 },
      { header: "Reason", width: 28 },
      { header: "Owner", width: 22 },
      { header: "Source", width: 18 },
      { header: "Closed on", width: 20 },
    ],
    rows: recent.map((lead) => [
      lead.number,
      lead.name,
      lead.status,
      lead.reason,
      lead.ownerName,
      lead.sourceName,
      lead.lostAt,
    ]),
  };
}
