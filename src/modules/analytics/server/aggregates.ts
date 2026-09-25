import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import { Prisma } from "@/generated/prisma/client";
import type { TenantDb, TenantDbOrTx } from "@/platform/db/tenant-scope";

import { COUNTER_KEYS, emptyCounters } from "../metrics";
import { computeMemberDaily, type MemberDayRow } from "./member-daily";

/**
 * `daily_member_stats` (M10-03): the unfiltered output of `computeMemberDaily`, stored per member and local day.
 * Refreshed for the day of each activity event (debounced per organization) and reconciled nightly for the last
 * weeks, so late or back-dated entries are picked up.
 */
export const localDay = (instant: Date, timezone: string) =>
  format(new TZDate(instant, timezone), "yyyy-MM-dd");

const dateOf = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** Recomputes the days `from`–`to` for every member and replaces the stored rows. Returns the rows written. */
export async function refreshDailyStats(
  db: TenantDb,
  organizationId: string,
  input: { from: string; to: string; timezone: string },
): Promise<number> {
  const rows = await computeMemberDaily(db, organizationId, { ...input, memberIds: null });
  // Members that no longer exist (hard-deleted) cannot hold rows.
  const members = new Set(
    (
      await db.membership.findMany({
        where: { id: { in: [...new Set(rows.map((row) => row.memberId))] } },
        select: { id: true },
      })
    ).map((member) => member.id),
  );
  const kept = rows.filter((row) => members.has(row.memberId));
  await db.$transaction(async (tx) => {
    await tx.dailyMemberStats.deleteMany({
      where: { day: { gte: dateOf(input.from), lte: dateOf(input.to) } },
    });
    if (kept.length) {
      await tx.dailyMemberStats.createMany({
        data: kept.map(({ memberId, day, ...counters }) => ({
          organizationId,
          membershipId: memberId,
          day: dateOf(day),
          ...counters,
        })),
      });
    }
  });
  return kept.length;
}

/** Stored rows for the days `from`–`to`, for `memberIds` (null = everyone). */
export async function readDailyStats(
  db: TenantDbOrTx,
  input: { from: string; to: string; memberIds: readonly string[] | null },
): Promise<MemberDayRow[]> {
  const records = await db.dailyMemberStats.findMany({
    where: {
      day: { gte: dateOf(input.from), lte: dateOf(input.to) },
      ...(input.memberIds ? { membershipId: { in: [...input.memberIds] } } : {}),
    },
    orderBy: [{ day: "asc" }, { membershipId: "asc" }],
  });
  return records.map((record) => {
    const counters = emptyCounters();
    for (const key of COUNTER_KEYS) counters[key] = record[key];
    return {
      memberId: record.membershipId,
      day: record.day.toISOString().slice(0, 10),
      ...counters,
    };
  });
}

/** Leads per owner and status at the moment of the snapshot, stored for `day` (replacing an earlier run). */
export async function snapshotLeads(
  db: TenantDb,
  organizationId: string,
  day: string,
): Promise<number> {
  const counts = await db.$queryRaw<
    { owner_id: string | null; status_id: string; count: number }[]
  >`
    SELECT l."owner_id", l."status_id", COUNT(*)::int AS "count"
    FROM "leads" l
    WHERE l."organization_id" = ${Prisma.sql`${organizationId}::uuid`}
      AND l."deleted_at" IS NULL AND l."duplicate_status" <> 'MERGED'
    GROUP BY 1, 2`;
  await db.$transaction(async (tx) => {
    await tx.dailyLeadSnapshot.deleteMany({ where: { day: dateOf(day) } });
    if (counts.length) {
      await tx.dailyLeadSnapshot.createMany({
        data: counts.map((row) => ({
          organizationId,
          day: dateOf(day),
          ownerId: row.owner_id,
          statusId: row.status_id,
          count: row.count,
        })),
      });
    }
  });
  return counts.length;
}
