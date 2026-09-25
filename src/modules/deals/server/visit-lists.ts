import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfDay, startOfWeek } from "date-fns";

import type { Prisma } from "@/generated/prisma/client";
import type { SiteVisitStatus } from "@/generated/prisma/enums";
import { type DateRange, isIsoDate, toUtcBounds } from "@/lib/date-range";
import type { TableQuery } from "@/lib/table-query";
import { findMembers } from "@/modules/identity";
import { getRegionalSettings } from "@/modules/organization";
import { resolveDataScope } from "@/platform/rbac/scope";
import type { ServiceContext } from "@/platform/tenant/context";
import { uuidOrNull } from "@/platform/validation";

import { OPEN_VISIT_STATUSES, VISIT_STATUSES } from "../constants";
import { DEAL_PERMISSIONS } from "../permissions";
import { visitScopeWhere } from "./scope";
import { toVisitRow, type VisitRow, visitRowInclude } from "./visits";

const OPEN = [...OPEN_VISIT_STATUSES];

export interface VisitFilters {
  /** Visit dates (calendar dates in the organization's time zone, inclusive). */
  range?: DateRange | null;
  projectId?: string | null;
  builderId?: string | null;
  assignedToId?: string | null;
  /** A visit status, or "pending-outcome" (open and past its time) / "upcoming". */
  status?: string | null;
  /** "visit" or "revisit". */
  kind?: string | null;
  timezone: string;
  now?: Date;
}

export const VISIT_SORTABLE_FIELDS = ["scheduledAt"] as const;

function filterWhere(filters: VisitFilters): Prisma.SiteVisitWhereInput[] {
  const and: Prisma.SiteVisitWhereInput[] = [];
  const now = filters.now ?? new Date();
  if (filters.range && isIsoDate(filters.range.from) && isIsoDate(filters.range.to)) {
    and.push({ scheduledAt: toUtcBounds(filters.range, filters.timezone) });
  }
  const projectId = uuidOrNull(filters.projectId);
  if (projectId) and.push({ projectId });
  const builderId = uuidOrNull(filters.builderId);
  if (builderId) and.push({ builderId });
  const assignedToId = uuidOrNull(filters.assignedToId);
  if (assignedToId) and.push({ assignedToId });
  if (filters.status === "pending-outcome") {
    and.push({ status: { in: OPEN }, scheduledAt: { lt: now } });
  } else if (filters.status === "upcoming") {
    and.push({ status: { in: OPEN }, scheduledAt: { gte: now } });
  } else if (VISIT_STATUSES.some((entry) => entry.value === filters.status)) {
    and.push({ status: filters.status as SiteVisitStatus });
  }
  if (filters.kind === "visit") and.push({ isRevisit: false });
  if (filters.kind === "revisit") and.push({ isRevisit: true });
  return and;
}

/** Visits within the actor's `visits.view` scope (by executive), with filters (M08-06). */
export async function listVisits(
  ctx: ServiceContext,
  query: TableQuery,
  filters: VisitFilters,
): Promise<{ rows: VisitRow[]; total: number }> {
  const and = [await visitScopeWhere(ctx), ...filterWhere(filters)];
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { lead: { name: { contains: q, mode: "insensitive" } } },
        { lead: { number: { contains: q, mode: "insensitive" } } },
        { project: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  const where: Prisma.SiteVisitWhereInput = { AND: and };
  const direction = query.sort?.direction ?? "desc";
  const [total, records] = await Promise.all([
    ctx.db.siteVisit.count({ where }),
    ctx.db.siteVisit.findMany({
      where,
      include: visitRowInclude,
      orderBy: [{ scheduledAt: direction }, { id: "desc" }],
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return { total, rows: records.map(toVisitRow) };
}

/** Visits between two instants (the calendar), soonest first; rescheduled ones are left out. */
export async function listVisitsBetween(
  ctx: ServiceContext,
  from: Date,
  to: Date,
  filters: VisitFilters,
): Promise<VisitRow[]> {
  const records = await ctx.db.siteVisit.findMany({
    where: {
      AND: [
        await visitScopeWhere(ctx),
        ...filterWhere({ ...filters, range: null }),
        { scheduledAt: { gte: from, lt: to }, status: { not: "RESCHEDULED" } },
      ],
    },
    include: visitRowInclude,
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    take: 500,
  });
  return records.map(toVisitRow);
}

export interface VisitSummary {
  upcoming: number;
  pendingOutcome: number;
  completed: number;
  noShow: number;
  cancelled: number;
  revisits: number;
}

/** Counts for the visits page header, for the same filters (the range counts completed and missed visits). */
export async function summarizeVisits(
  ctx: ServiceContext,
  filters: VisitFilters,
): Promise<VisitSummary> {
  const now = filters.now ?? new Date();
  const scope = await visitScopeWhere(ctx);
  const base = filterWhere({ ...filters, status: null });
  const count = (where: Prisma.SiteVisitWhereInput) =>
    ctx.db.siteVisit.count({ where: { AND: [scope, ...base, where] } });
  const [upcoming, pendingOutcome, completed, noShow, cancelled, revisits] = await Promise.all([
    count({ status: { in: OPEN }, scheduledAt: { gte: now } }),
    count({ status: { in: OPEN }, scheduledAt: { lt: now } }),
    count({ status: "COMPLETED" }),
    count({ status: "NO_SHOW" }),
    count({ status: "CANCELLED" }),
    count({ isRevisit: true, status: "COMPLETED" }),
  ]);
  return { upcoming, pendingOutcome, completed, noShow, cancelled, revisits };
}

export interface TeamVisitRow {
  membershipId: string | null;
  name: string;
  upcoming: number;
  pendingOutcome: number;
  completed: number;
  revisits: number;
  noShow: number;
  cancelled: number;
}

/**
 * Team view (M08-06, PRD §11 "managers can monitor team visits and outcomes"): per executive in the actor's scope,
 * their visits in the range by state.
 */
export async function teamVisitSummary(
  ctx: ServiceContext,
  filters: VisitFilters,
): Promise<TeamVisitRow[]> {
  const scope = await resolveDataScope(ctx, DEAL_PERMISSIONS.visitsView);
  if (scope.scope === "OWN") return [];
  const now = filters.now ?? new Date();
  const where: Prisma.SiteVisitWhereInput = {
    AND: [
      await visitScopeWhere(ctx),
      ...filterWhere({ ...filters, status: null, assignedToId: null }),
      { status: { not: "RESCHEDULED" } },
    ],
  };
  const records = await ctx.db.siteVisit.findMany({
    where,
    select: { assignedToId: true, status: true, scheduledAt: true, isRevisit: true },
    take: 20_000,
  });
  const members = await findMembers(ctx.db, {
    activeOnly: true,
    withPermission: DEAL_PERMISSIONS.visitsView,
    ...(scope.scope === "TEAM" ? { ids: scope.membershipIds } : {}),
  });
  const rows = new Map<string | null, TeamVisitRow>();
  const rowFor = (id: string | null, name: string) => {
    let row = rows.get(id);
    if (!row) {
      row = {
        membershipId: id,
        name,
        upcoming: 0,
        pendingOutcome: 0,
        completed: 0,
        revisits: 0,
        noShow: 0,
        cancelled: 0,
      };
      rows.set(id, row);
    }
    return row;
  };
  for (const member of members) rowFor(member.membershipId, member.name);
  const names = new Map(members.map((member) => [member.membershipId, member.name]));
  const missing = [
    ...new Set(records.map((record) => record.assignedToId).filter((id) => id && !names.has(id))),
  ] as string[];
  if (missing.length) {
    for (const member of await findMembers(ctx.db, { ids: missing })) {
      names.set(member.membershipId, member.name);
    }
  }
  for (const record of records) {
    const row = rowFor(
      record.assignedToId,
      record.assignedToId ? (names.get(record.assignedToId) ?? "Former member") : "No executive",
    );
    if (record.status === "COMPLETED") {
      row.completed += 1;
      if (record.isRevisit) row.revisits += 1;
    } else if (record.status === "NO_SHOW") row.noShow += 1;
    else if (record.status === "CANCELLED") row.cancelled += 1;
    else if (record.scheduledAt < now) row.pendingOutcome += 1;
    else row.upcoming += 1;
  }
  return [...rows.values()]
    .filter(
      (row) =>
        row.upcoming + row.pendingOutcome + row.completed + row.noShow + row.cancelled > 0 ||
        row.membershipId !== ctx.actor.membershipId,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface VisitWeek {
  /** First day of the week shown (yyyy-MM-dd). */
  start: string;
  previous: string;
  next: string;
  /** Today in the organization's time zone (yyyy-MM-dd). */
  today: string;
  days: { date: string; items: VisitRow[] }[];
}

/** The calendar (M08-06): one week of visits, the week containing `anchor` (a date) or today. */
export async function getVisitWeek(
  ctx: ServiceContext,
  anchor: string | null,
  filters: VisitFilters,
): Promise<VisitWeek> {
  const regional = await getRegionalSettings(ctx);
  const now = filters.now ?? new Date();
  const today = startOfDay(new TZDate(now, regional.timezone));
  const [year, month, date] = isIsoDate(anchor) ? anchor.split("-").map(Number) : [];
  const base = year && month && date ? new TZDate(year, month - 1, date, regional.timezone) : today;
  const weekStart = startOfWeek(base, { weekStartsOn: regional.weekStartsOn as 0 });
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(weekStart, index);
    return {
      date: format(day, "yyyy-MM-dd"),
      start: new Date(day.getTime()),
      end: new Date(addDays(day, 1).getTime()),
    };
  });
  const items = await listVisitsBetween(ctx, days[0]!.start, days[6]!.end, filters);
  return {
    start: days[0]!.date,
    previous: format(addDays(weekStart, -7), "yyyy-MM-dd"),
    next: format(addDays(weekStart, 7), "yyyy-MM-dd"),
    today: format(today, "yyyy-MM-dd"),
    days: days.map((day) => ({
      date: day.date,
      items: items.filter((item) => {
        const at = new Date(item.scheduledAt);
        return at >= day.start && at < day.end;
      }),
    })),
  };
}

/** "My agenda" (M08-06): the signed-in person's visits waiting for an outcome and those of the next two weeks. */
export async function getMyVisits(
  ctx: ServiceContext,
  now: Date,
): Promise<{ pending: VisitRow[]; upcoming: VisitRow[] }> {
  const me = ctx.actor.membershipId;
  if (!me || !ctx.permissions.has(DEAL_PERMISSIONS.visitsView))
    return { pending: [], upcoming: [] };
  const records = await ctx.db.siteVisit.findMany({
    where: {
      assignedToId: me,
      status: { in: OPEN },
      scheduledAt: { lt: new Date(now.getTime() + 14 * 86_400_000) },
      lead: { deletedAt: null },
    },
    include: visitRowInclude,
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    take: 300,
  });
  const rows = records.map(toVisitRow);
  const nowIso = now.toISOString();
  return {
    pending: rows.filter((row) => row.scheduledAt < nowIso),
    upcoming: rows.filter((row) => row.scheduledAt >= nowIso),
  };
}
