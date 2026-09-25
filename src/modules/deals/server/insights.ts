import { TZDate } from "@date-fns/tz";
import { addDays, startOfDay, startOfMonth, subDays } from "date-fns";

import type { Prisma } from "@/generated/prisma/client";
import { zonedClock } from "@/lib/date-range";
import { plural } from "@/lib/utils";
import { findMembers } from "@/modules/identity";
import type { AlertCandidate, AlertRule, DigestLine, DigestSection } from "@/modules/notifications";
import { getRegionalSettings } from "@/modules/organization";
import { getSubtreeMembershipIds } from "@/platform/rbac/scope";

import { OPEN_VISIT_STATUSES } from "../constants";
import { DEAL_PERMISSIONS } from "../permissions";
import { bookingScopeWhere, visitScopeWhere } from "./scope";
import { getDealSettings } from "./settings";
import { visitLabel } from "./visits";

const OPEN = [...OPEN_VISIT_STATUSES];

/**
 * Visits whose outcome is still missing some hours after they were due (M08-14 via M06-11): their executive is
 * reminded once per visit, and managers get one alert a day with the count for their team.
 */
export const visitsPendingOutcomeRule: AlertRule = {
  key: "visits-pending-outcome",
  label: "Visits waiting for their outcome",
  async evaluate(ctx, now) {
    const { outcomeDueHours } = await getDealSettings(ctx.db, ctx);
    const cutoff = new Date(now.getTime() - outcomeDueHours * 3_600_000);
    const visits = await ctx.db.siteVisit.findMany({
      where: {
        status: { in: OPEN },
        scheduledAt: { lt: cutoff, gte: subDays(now, 30) },
        lead: { deletedAt: null },
      },
      select: {
        id: true,
        number: true,
        isRevisit: true,
        assignedToId: true,
        project: { select: { name: true } },
        lead: { select: { id: true, number: true, name: true } },
      },
      take: 1000,
    });
    if (visits.length === 0) return [];
    const candidates: AlertCandidate[] = [];
    for (const visit of visits) {
      if (!visit.assignedToId) continue;
      candidates.push({
        recipientId: visit.assignedToId,
        type: "visit.outcome_pending",
        dedupeKey: `visit:${visit.id}`,
        title: `How did it go? ${visitLabel(visit)} of ${visit.lead.number} · ${visit.lead.name} — ${visit.project.name}`,
        body: "Record the outcome, or mark it as a no-show or move it.",
        link: `/leads/${visit.lead.id}?tab=visits`,
      });
    }
    const watchers = await findMembers(ctx.db, {
      activeOnly: true,
      withPermission: DEAL_PERMISSIONS.visitsView,
      scopes: ["TEAM", "ALL"],
    });
    const pending = new Map<string | null, number>();
    for (const visit of visits) {
      pending.set(visit.assignedToId, (pending.get(visit.assignedToId) ?? 0) + 1);
    }
    const { timezone } = await getRegionalSettings(ctx);
    const { date } = zonedClock(now, timezone);
    for (const watcher of watchers) {
      let total = 0;
      if (watcher.scope === "ALL") {
        for (const value of pending.values()) total += value;
      } else {
        if (!watcher.hasReports) continue;
        const team = await getSubtreeMembershipIds(
          ctx.db,
          ctx.organizationId,
          watcher.membershipId,
        );
        for (const memberId of team) {
          if (memberId !== watcher.membershipId) total += pending.get(memberId) ?? 0;
        }
      }
      if (total === 0) continue;
      candidates.push({
        recipientId: watcher.membershipId,
        type: "team.visits_pending_outcome",
        dedupeKey: `${watcher.membershipId}:${date}`,
        title: `${plural(total, "site visit")} in ${watcher.scope === "ALL" ? "the organization" : "your team"} without an outcome`,
        body: `Visits more than ${plural(outcomeDueHours, "hour")} past their time with nothing recorded.`,
        link: "/visits?status=pending-outcome",
      });
    }
    return candidates;
  },
};

/** Daily summary block (M06-12): visits and bookings of the recipient's team or organization. */
export const dealsDigestSection: DigestSection = {
  key: "visits-bookings",
  order: 30,
  async build(ctx, now) {
    const canVisits = ctx.permissions.has(DEAL_PERMISSIONS.visitsView);
    const canBookings = ctx.permissions.has(DEAL_PERMISSIONS.bookingsView);
    if (!canVisits && !canBookings) return null;
    const { timezone } = await getRegionalSettings(ctx);
    const todayStart = startOfDay(new TZDate(now, timezone));
    const today = {
      gte: new Date(todayStart.getTime()),
      lt: new Date(addDays(todayStart, 1).getTime()),
    };
    const yesterday = { gte: new Date(subDays(todayStart, 1).getTime()), lt: today.gte };
    const lines: DigestLine[] = [];
    if (canVisits) {
      const scope = await visitScopeWhere(ctx);
      const count = (where: Prisma.SiteVisitWhereInput) =>
        ctx.db.siteVisit.count({ where: { AND: [scope, where] } });
      const { outcomeDueHours } = await getDealSettings(ctx.db, ctx);
      const [plannedToday, doneYesterday, noShowYesterday, waiting] = await Promise.all([
        count({ status: { in: OPEN }, scheduledAt: today }),
        count({ status: "COMPLETED", completedAt: yesterday }),
        count({ status: "NO_SHOW", noShowAt: yesterday }),
        count({
          status: { in: OPEN },
          scheduledAt: { lt: new Date(now.getTime() - outcomeDueHours * 3_600_000) },
        }),
      ]);
      lines.push(
        { label: "Site visits today", value: plannedToday, link: "/visits" },
        { label: "Visits done yesterday", value: doneYesterday },
        { label: "No-shows yesterday", value: noShowYesterday, attention: true },
        {
          label: "Visits waiting for their outcome",
          value: waiting,
          link: "/visits?status=pending-outcome",
          attention: true,
        },
      );
    }
    if (canBookings) {
      const scope = await bookingScopeWhere(ctx);
      const monthStart = new Date(startOfMonth(new TZDate(now, timezone)).getTime());
      const [bookedYesterday, closedThisMonth, cancelledThisMonth] = await Promise.all([
        ctx.db.booking.count({ where: { AND: [scope, { createdAt: yesterday }] } }),
        ctx.db.booking.count({
          where: { AND: [scope, { status: "CLOSED_WON", closedAt: { gte: monthStart } }] },
        }),
        ctx.db.booking.count({
          where: { AND: [scope, { status: "CANCELLED", cancelledAt: { gte: monthStart } }] },
        }),
      ]);
      lines.push(
        { label: "Bookings yesterday", value: bookedYesterday, link: "/bookings" },
        {
          label: "Deals closed this month",
          value: closedThisMonth,
          link: "/bookings?status=CLOSED_WON",
        },
        {
          label: "Bookings cancelled this month",
          value: cancelledThisMonth,
          link: "/bookings?status=CANCELLED",
          attention: true,
        },
      );
    }
    return { title: "Site visits & bookings", lines };
  },
};
