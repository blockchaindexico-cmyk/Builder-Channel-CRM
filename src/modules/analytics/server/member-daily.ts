import { Prisma } from "@/generated/prisma/client";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";

import { type Counters, emptyCounters } from "../metrics";

/**
 * The metric definitions in SQL (M10-01): counters per member and local day, straight from the activity tables.
 * Dashboards and reports read these rows — from `daily_member_stats` when no dimension filter is set (the rows are
 * this function's output, refreshed from events), or live when the viewer filters by builder, project, source or
 * status. No permission check: callers pass the members the viewer's scope allows.
 */
export interface DimensionFilters {
  builderId?: string | null;
  projectId?: string | null;
  sourceId?: string | null;
  /** The lead's current status. */
  statusId?: string | null;
}

export interface MemberDayRow extends Counters {
  memberId: string;
  day: string;
}

export const hasDimensions = (filters: DimensionFilters) =>
  Boolean(filters.builderId || filters.projectId || filters.sourceId || filters.statusId);

/** Conditions on the lead (alias `l`) for the dimension filters. */
function leadConditions(filters: DimensionFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (filters.sourceId) parts.push(Prisma.sql`AND l."source_id" = ${filters.sourceId}::uuid`);
  if (filters.statusId) parts.push(Prisma.sql`AND l."status_id" = ${filters.statusId}::uuid`);
  if (filters.projectId) {
    parts.push(Prisma.sql`AND EXISTS (SELECT 1 FROM "lead_project_interests" i
      WHERE i."organization_id" = l."organization_id" AND i."lead_id" = l."id" AND i."project_id" = ${filters.projectId}::uuid)`);
  }
  if (filters.builderId) {
    parts.push(Prisma.sql`AND EXISTS (SELECT 1 FROM "lead_project_interests" i
      JOIN "projects" p ON p."organization_id" = i."organization_id" AND p."id" = i."project_id"
      WHERE i."organization_id" = l."organization_id" AND i."lead_id" = l."id" AND p."builder_id" = ${filters.builderId}::uuid)`);
  }
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

/** Conditions for rows that carry their own project and builder (visits, bookings), plus the lead's source/status. */
function dealConditions(alias: "v" | "b", filters: DimensionFilters): Prisma.Sql {
  const table = Prisma.raw(alias);
  const parts: Prisma.Sql[] = [];
  if (filters.projectId)
    parts.push(Prisma.sql`AND ${table}."project_id" = ${filters.projectId}::uuid`);
  if (filters.builderId)
    parts.push(Prisma.sql`AND ${table}."builder_id" = ${filters.builderId}::uuid`);
  if (filters.sourceId) parts.push(Prisma.sql`AND l."source_id" = ${filters.sourceId}::uuid`);
  if (filters.statusId) parts.push(Prisma.sql`AND l."status_id" = ${filters.statusId}::uuid`);
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

type Raw = Record<string, unknown> & { member_id: string; day: Date | string };

const dayString = (value: Date | string) =>
  typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);

/**
 * Counters per member and day for the local calendar days `from`–`to` (inclusive) in `timezone`.
 * `memberIds` null means every member.
 */
export async function computeMemberDaily(
  db: TenantDbOrTx,
  organizationId: string,
  input: {
    from: string;
    to: string;
    timezone: string;
    memberIds: readonly string[] | null;
    filters?: DimensionFilters;
  },
): Promise<MemberDayRow[]> {
  const filters = input.filters ?? {};
  const org = Prisma.sql`${organizationId}::uuid`;
  const tz = input.timezone;
  const members = input.memberIds ? [...input.memberIds] : null;
  // Instants of the local range: from 00:00 on `from` to 00:00 the day after `to`, in the org's zone.
  const start = Prisma.sql`(${input.from}::date::timestamp AT TIME ZONE ${tz})`;
  const end = Prisma.sql`((${input.to}::date + 1)::timestamp AT TIME ZONE ${tz})`;
  const inRange = (column: Prisma.Sql) => Prisma.sql`${column} >= ${start} AND ${column} < ${end}`;
  const day = (column: Prisma.Sql) => Prisma.sql`(${column} AT TIME ZONE ${tz})::date`;
  const member = (column: Prisma.Sql) =>
    Prisma.sql`(${members}::uuid[] IS NULL OR ${column} = ANY(${members}::uuid[]))`;
  const leads = leadConditions(filters);

  const queries: Promise<Raw[]>[] = [
    // Assignments received.
    db.$queryRaw<Raw[]>`
      SELECT a."assignee_id" AS member_id, ${day(Prisma.sql`a."assigned_at"`)} AS day,
             COUNT(*)::int AS "leadsAssigned"
      FROM "lead_assignments" a
      JOIN "leads" l ON l."organization_id" = a."organization_id" AND l."id" = a."lead_id"
      WHERE a."organization_id" = ${org} AND a."assignee_id" IS NOT NULL
        AND ${inRange(Prisma.sql`a."assigned_at"`)} AND ${member(Prisma.sql`a."assignee_id"`)}
        AND l."deleted_at" IS NULL ${leads}
      GROUP BY 1, 2`,
    // Leads added.
    db.$queryRaw<Raw[]>`
      SELECT l."created_by_id" AS member_id, ${day(Prisma.sql`l."created_at"`)} AS day,
             COUNT(*)::int AS "leadsCreated"
      FROM "leads" l
      WHERE l."organization_id" = ${org} AND l."created_by_id" IS NOT NULL AND l."deleted_at" IS NULL
        AND ${inRange(Prisma.sql`l."created_at"`)} AND ${member(Prisma.sql`l."created_by_id"`)} ${leads}
      GROUP BY 1, 2`,
    // Calls.
    db.$queryRaw<Raw[]>`
      SELECT c."caller_id" AS member_id, ${day(Prisma.sql`c."started_at"`)} AS day,
             COUNT(*)::int AS "calls",
             COUNT(*) FILTER (WHERE c."connected")::int AS "callsConnected",
             COUNT(*) FILTER (WHERE o."category" IN ('POSITIVE', 'INTERESTED'))::int AS "callsPositive",
             COUNT(*) FILTER (WHERE o."category" IN ('NEGATIVE', 'NOT_INTERESTED'))::int AS "callsNegative",
             COUNT(*) FILTER (WHERE o."category" = 'UNRESPONSIVE')::int AS "callsUnresponsive",
             COUNT(*) FILTER (WHERE o."category" = 'CALLBACK')::int AS "callsCallback",
             COALESCE(SUM(c."duration_seconds"), 0)::int AS "talkSeconds"
      FROM "call_logs" c
      JOIN "call_outcomes" o ON o."organization_id" = c."organization_id" AND o."id" = c."outcome_id"
      JOIN "leads" l ON l."organization_id" = c."organization_id" AND l."id" = c."lead_id"
      WHERE c."organization_id" = ${org} AND c."caller_id" IS NOT NULL
        AND ${inRange(Prisma.sql`c."started_at"`)} AND ${member(Prisma.sql`c."caller_id"`)}
        AND l."deleted_at" IS NULL ${leads}
      GROUP BY 1, 2`,
    // Follow-ups due (and whether they were done before being missed).
    db.$queryRaw<Raw[]>`
      SELECT f."assigned_to_id" AS member_id, ${day(Prisma.sql`f."due_at"`)} AS day,
             COUNT(*)::int AS "followUpsDue",
             COUNT(*) FILTER (WHERE f."status" = 'COMPLETED' AND f."missed_at" IS NULL)::int AS "followUpsOnTime"
      FROM "follow_ups" f
      JOIN "leads" l ON l."organization_id" = f."organization_id" AND l."id" = f."lead_id"
      WHERE f."organization_id" = ${org} AND f."assigned_to_id" IS NOT NULL
        AND f."status" NOT IN ('RESCHEDULED', 'CANCELLED')
        AND ${inRange(Prisma.sql`f."due_at"`)} AND ${member(Prisma.sql`f."assigned_to_id"`)}
        AND l."deleted_at" IS NULL ${leads}
      GROUP BY 1, 2`,
    // Follow-ups done.
    db.$queryRaw<Raw[]>`
      SELECT COALESCE(f."completed_by_id", f."assigned_to_id") AS member_id,
             ${day(Prisma.sql`f."completed_at"`)} AS day,
             COUNT(*)::int AS "followUpsCompleted"
      FROM "follow_ups" f
      JOIN "leads" l ON l."organization_id" = f."organization_id" AND l."id" = f."lead_id"
      WHERE f."organization_id" = ${org} AND f."status" = 'COMPLETED'
        AND COALESCE(f."completed_by_id", f."assigned_to_id") IS NOT NULL
        AND ${inRange(Prisma.sql`f."completed_at"`)}
        AND ${member(Prisma.sql`COALESCE(f."completed_by_id", f."assigned_to_id")`)}
        AND l."deleted_at" IS NULL ${leads}
      GROUP BY 1, 2`,
    // Follow-ups missed.
    db.$queryRaw<Raw[]>`
      SELECT f."assigned_to_id" AS member_id, ${day(Prisma.sql`f."missed_at"`)} AS day,
             COUNT(*)::int AS "followUpsMissed"
      FROM "follow_ups" f
      JOIN "leads" l ON l."organization_id" = f."organization_id" AND l."id" = f."lead_id"
      WHERE f."organization_id" = ${org} AND f."assigned_to_id" IS NOT NULL AND f."missed_at" IS NOT NULL
        AND ${inRange(Prisma.sql`f."missed_at"`)} AND ${member(Prisma.sql`f."assigned_to_id"`)}
        AND l."deleted_at" IS NULL ${leads}
      GROUP BY 1, 2`,
    // Visits done and revisits.
    db.$queryRaw<Raw[]>`
      SELECT v."assigned_to_id" AS member_id, ${day(Prisma.sql`v."completed_at"`)} AS day,
             COUNT(*) FILTER (WHERE NOT v."is_revisit")::int AS "visitsCompleted",
             COUNT(*) FILTER (WHERE v."is_revisit")::int AS "revisitsCompleted"
      FROM "site_visits" v
      JOIN "leads" l ON l."organization_id" = v."organization_id" AND l."id" = v."lead_id"
      WHERE v."organization_id" = ${org} AND v."status" = 'COMPLETED' AND v."assigned_to_id" IS NOT NULL
        AND ${inRange(Prisma.sql`v."completed_at"`)} AND ${member(Prisma.sql`v."assigned_to_id"`)}
        AND l."deleted_at" IS NULL ${dealConditions("v", filters)}
      GROUP BY 1, 2`,
    // No-shows.
    db.$queryRaw<Raw[]>`
      SELECT v."assigned_to_id" AS member_id, ${day(Prisma.sql`v."no_show_at"`)} AS day,
             COUNT(*)::int AS "visitsNoShow"
      FROM "site_visits" v
      JOIN "leads" l ON l."organization_id" = v."organization_id" AND l."id" = v."lead_id"
      WHERE v."organization_id" = ${org} AND v."status" = 'NO_SHOW' AND v."assigned_to_id" IS NOT NULL
        AND ${inRange(Prisma.sql`v."no_show_at"`)} AND ${member(Prisma.sql`v."assigned_to_id"`)}
        AND l."deleted_at" IS NULL ${dealConditions("v", filters)}
      GROUP BY 1, 2`,
    // Bookings by booking date (a calendar date already).
    db.$queryRaw<Raw[]>`
      SELECT b."executive_id" AS member_id, b."booking_date" AS day, COUNT(*)::int AS "bookings"
      FROM "bookings" b
      JOIN "leads" l ON l."organization_id" = b."organization_id" AND l."id" = b."lead_id"
      WHERE b."organization_id" = ${org}
        AND b."booking_date" >= ${input.from}::date AND b."booking_date" <= ${input.to}::date
        AND ${member(Prisma.sql`b."executive_id"`)} AND l."deleted_at" IS NULL ${dealConditions("b", filters)}
      GROUP BY 1, 2`,
    // Closures.
    db.$queryRaw<Raw[]>`
      SELECT b."executive_id" AS member_id, ${day(Prisma.sql`b."closed_at"`)} AS day, COUNT(*)::int AS "closures"
      FROM "bookings" b
      JOIN "leads" l ON l."organization_id" = b."organization_id" AND l."id" = b."lead_id"
      WHERE b."organization_id" = ${org} AND b."status" = 'CLOSED_WON'
        AND ${inRange(Prisma.sql`b."closed_at"`)} AND ${member(Prisma.sql`b."executive_id"`)}
        AND l."deleted_at" IS NULL ${dealConditions("b", filters)}
      GROUP BY 1, 2`,
    // Cancellations.
    db.$queryRaw<Raw[]>`
      SELECT b."executive_id" AS member_id, ${day(Prisma.sql`b."cancelled_at"`)} AS day,
             COUNT(*)::int AS "bookingsCancelled"
      FROM "bookings" b
      JOIN "leads" l ON l."organization_id" = b."organization_id" AND l."id" = b."lead_id"
      WHERE b."organization_id" = ${org} AND b."status" = 'CANCELLED'
        AND ${inRange(Prisma.sql`b."cancelled_at"`)} AND ${member(Prisma.sql`b."executive_id"`)}
        AND l."deleted_at" IS NULL ${dealConditions("b", filters)}
      GROUP BY 1, 2`,
    // Lost and not interested, attributed to the owner.
    db.$queryRaw<Raw[]>`
      SELECT l."owner_id" AS member_id, ${day(Prisma.sql`l."lost_at"`)} AS day,
             COUNT(*) FILTER (WHERE s."key" <> 'NOT_INTERESTED')::int AS "lost",
             COUNT(*) FILTER (WHERE s."key" = 'NOT_INTERESTED')::int AS "notInterested"
      FROM "leads" l
      JOIN "lead_statuses" s ON s."organization_id" = l."organization_id" AND s."id" = l."status_id"
      WHERE l."organization_id" = ${org} AND l."owner_id" IS NOT NULL AND l."deleted_at" IS NULL
        AND s."category" = 'LOST' AND ${inRange(Prisma.sql`l."lost_at"`)}
        AND ${member(Prisma.sql`l."owner_id"`)} ${leads}
      GROUP BY 1, 2`,
  ];

  const rows = new Map<string, MemberDayRow>();
  for (const result of await Promise.all(queries)) {
    for (const raw of result) {
      const date = dayString(raw.day);
      const key = `${raw.member_id}|${date}`;
      let row = rows.get(key);
      if (!row) {
        row = { memberId: raw.member_id, day: date, ...emptyCounters() };
        rows.set(key, row);
      }
      for (const [field, value] of Object.entries(raw)) {
        if (field !== "member_id" && field !== "day") {
          (row as unknown as Record<string, number>)[field] += Number(value);
        }
      }
    }
  }
  return [...rows.values()].sort(
    (a, b) => a.day.localeCompare(b.day) || a.memberId.localeCompare(b.memberId),
  );
}
