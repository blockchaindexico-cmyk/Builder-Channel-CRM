import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfDay, startOfWeek } from "date-fns";

import type { Prisma } from "@/generated/prisma/client";
import { listMemberOptions } from "@/modules/identity";
import { getRegionalSettings } from "@/modules/organization";
import { ForbiddenError } from "@/platform/errors";
import { resolveDataScope } from "@/platform/rbac/scope";
import type { ServiceContext } from "@/platform/tenant/context";
import { uuidOrNull } from "@/platform/validation";

import { OPEN_FOLLOW_UP_STATUSES } from "../constants";
import { ACTIVITY_PERMISSIONS } from "../permissions";
import {
  type FollowUpRow,
  followUpRowInclude,
  listOpenFollowUpsFor,
  toFollowUpRow,
} from "./follow-ups";

const OPEN = [...OPEN_FOLLOW_UP_STATUSES];

/** Today in the organization's time zone as UTC instants, plus the week around it. */
async function calendar(ctx: ServiceContext, now: Date) {
  const regional = await getRegionalSettings(ctx);
  const zoned = new TZDate(now, regional.timezone);
  const todayStart = startOfDay(zoned);
  const weekStart = startOfWeek(todayStart, { weekStartsOn: regional.weekStartsOn as 0 });
  return {
    timezone: regional.timezone,
    todayStart: new Date(todayStart.getTime()),
    todayEnd: new Date(addDays(todayStart, 1).getTime()),
    weekDays: Array.from({ length: 7 }, (_, index) => {
      const day = addDays(weekStart, index);
      return {
        date: format(day, "yyyy-MM-dd"),
        start: new Date(day.getTime()),
        end: new Date(addDays(day, 1).getTime()),
      };
    }),
  };
}

export interface Agenda {
  overdue: FollowUpRow[];
  today: FollowUpRow[];
  upcoming: FollowUpRow[];
  week: { date: string; items: FollowUpRow[] }[];
  stats: { callsToday: number; connectedToday: number; doneToday: number };
}

/** "My agenda" (M07-14): what the signed-in person has to do — overdue, today, the next two weeks and this week. */
export async function getMyAgenda(ctx: ServiceContext, now: Date = new Date()): Promise<Agenda> {
  ctx.permissions.assert(ACTIVITY_PERMISSIONS.followUpsView);
  const me = ctx.actor.membershipId;
  if (!me) throw new ForbiddenError("The agenda belongs to a person.");
  const cal = await calendar(ctx, now);
  const horizon = new Date(
    Math.max(cal.todayEnd.getTime() + 14 * 86_400_000, cal.weekDays[6]!.end.getTime()),
  );
  const open = await listOpenFollowUpsFor(ctx.db, [me], { to: horizon });
  const [callsToday, connectedToday, doneToday] = await Promise.all([
    ctx.db.callLog.count({
      where: { callerId: me, startedAt: { gte: cal.todayStart, lt: cal.todayEnd } },
    }),
    ctx.db.callLog.count({
      where: {
        callerId: me,
        connected: true,
        startedAt: { gte: cal.todayStart, lt: cal.todayEnd },
      },
    }),
    ctx.db.followUp.count({
      where: { completedById: me, completedAt: { gte: cal.todayStart, lt: cal.todayEnd } },
    }),
  ]);
  const at = (row: FollowUpRow) => new Date(row.dueAt).getTime();
  return {
    overdue: open.filter((row) => at(row) < now.getTime()),
    today: open.filter((row) => at(row) >= now.getTime() && at(row) < cal.todayEnd.getTime()),
    upcoming: open.filter((row) => at(row) >= cal.todayEnd.getTime()),
    week: cal.weekDays.map((day) => ({
      date: day.date,
      items: open.filter((row) => at(row) >= day.start.getTime() && at(row) < day.end.getTime()),
    })),
    stats: { callsToday, connectedToday, doneToday },
  };
}

// --- Team board (M07-15) -------------------------------------------------------------------------------------------

export interface TeamFollowUpRow {
  membershipId: string | null;
  name: string;
  overdue: number;
  dueToday: number;
  upcoming: number;
  missed: number;
  doneToday: number;
}

export type TeamBucket = "overdue" | "today" | "upcoming" | "missed";

async function boardMembers(ctx: ServiceContext) {
  const scope = await resolveDataScope(ctx, ACTIVITY_PERMISSIONS.teamFollowUpsView);
  const members = await listMemberOptions(
    ctx,
    scope.scope === "ALL" ? {} : { ids: scope.membershipIds },
  );
  return { scope, members };
}

function bucketWhere(
  bucket: TeamBucket,
  now: Date,
  cal: { todayEnd: Date },
): Prisma.FollowUpWhereInput {
  switch (bucket) {
    case "overdue":
      return { status: { in: OPEN }, dueAt: { lt: now } };
    case "today":
      return { status: { in: OPEN }, dueAt: { gte: now, lt: cal.todayEnd } };
    case "upcoming":
      return {
        status: "SCHEDULED",
        dueAt: { gte: cal.todayEnd, lt: new Date(cal.todayEnd.getTime() + 7 * 86_400_000) },
      };
    case "missed":
      return { status: "MISSED" };
  }
}

/** Pending and overdue follow-ups per person of the actor's team (or everyone), with the unassigned ones. */
export async function getTeamFollowUpBoard(
  ctx: ServiceContext,
  now: Date = new Date(),
): Promise<TeamFollowUpRow[]> {
  const { scope, members } = await boardMembers(ctx);
  const cal = await calendar(ctx, now);
  const assignee: Prisma.FollowUpWhereInput =
    scope.scope === "ALL" ? {} : { assignedToId: { in: scope.membershipIds } };
  const alive: Prisma.FollowUpWhereInput = { lead: { deletedAt: null } };
  const count = async (where: Prisma.FollowUpWhereInput) => {
    const groups = await ctx.db.followUp.groupBy({
      by: ["assignedToId"],
      where: { AND: [assignee, alive, where] },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.assignedToId, group._count._all]));
  };
  const [overdue, dueToday, upcoming, missed, done] = await Promise.all([
    count(bucketWhere("overdue", now, cal)),
    count(bucketWhere("today", now, cal)),
    count(bucketWhere("upcoming", now, cal)),
    count(bucketWhere("missed", now, cal)),
    count({ status: "COMPLETED", completedAt: { gte: cal.todayStart, lt: cal.todayEnd } }),
  ]);
  const rowFor = (membershipId: string | null, name: string): TeamFollowUpRow => ({
    membershipId,
    name,
    overdue: overdue.get(membershipId) ?? 0,
    dueToday: dueToday.get(membershipId) ?? 0,
    upcoming: upcoming.get(membershipId) ?? 0,
    missed: missed.get(membershipId) ?? 0,
    doneToday: done.get(membershipId) ?? 0,
  });
  const rows = members
    .map((member) => rowFor(member.membershipId, member.name))
    .filter(
      (row) =>
        row.overdue + row.dueToday + row.upcoming + row.missed + row.doneToday > 0 ||
        members.find((member) => member.membershipId === row.membershipId)?.status === "ACTIVE",
    );
  if (scope.scope === "ALL") {
    const waiting = rowFor(null, "Waiting for an owner");
    if (waiting.overdue + waiting.dueToday + waiting.upcoming + waiting.missed > 0)
      rows.push(waiting);
  }
  return rows.sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
}

/** Drill-down of the board: one person's (or the unassigned) follow-ups in one bucket. */
export async function listTeamFollowUps(
  ctx: ServiceContext,
  options: { assigneeId: string | null; bucket: TeamBucket },
  now: Date = new Date(),
): Promise<FollowUpRow[]> {
  const { scope } = await boardMembers(ctx);
  const assigneeId = options.assigneeId === "unassigned" ? null : uuidOrNull(options.assigneeId);
  if (assigneeId && scope.scope !== "ALL" && !scope.membershipIds.includes(assigneeId)) {
    throw new ForbiddenError(undefined, ACTIVITY_PERMISSIONS.teamFollowUpsView);
  }
  if (!assigneeId && scope.scope !== "ALL") {
    throw new ForbiddenError(undefined, ACTIVITY_PERMISSIONS.teamFollowUpsView);
  }
  const cal = await calendar(ctx, now);
  const records = await ctx.db.followUp.findMany({
    where: {
      assignedToId: assigneeId,
      lead: { deletedAt: null },
      ...bucketWhere(options.bucket, now, cal),
    },
    include: followUpRowInclude,
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: 300,
  });
  return records.map(toFollowUpRow);
}
