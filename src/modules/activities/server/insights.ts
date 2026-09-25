import { TZDate } from "@date-fns/tz";
import { addDays, startOfDay, subDays } from "date-fns";

import type { Prisma } from "@/generated/prisma/client";
import { zonedClock } from "@/lib/date-range";
import { plural } from "@/lib/utils";
import { findMembers } from "@/modules/identity";
import type { AlertCandidate, AlertRule, DigestSection } from "@/modules/notifications";
import { getRegionalSettings } from "@/modules/organization";
import { getSubtreeMembershipIds, resolveDataScope } from "@/platform/rbac/scope";

import { OPEN_FOLLOW_UP_STATUSES } from "../constants";
import { ACTIVITY_PERMISSIONS } from "../permissions";

const OPEN = [...OPEN_FOLLOW_UP_STATUSES];

/**
 * Manager alert (M07-13 via M06-11): follow-ups and callbacks of the team that are overdue, once a day per manager.
 * Sent to whoever may see the team follow-up board.
 */
export const overdueFollowUpsRule: AlertRule = {
  key: "overdue-follow-ups",
  label: "Overdue follow-ups",
  async evaluate(ctx, now) {
    const watchers = await findMembers(ctx.db, {
      activeOnly: true,
      withPermission: ACTIVITY_PERMISSIONS.teamFollowUpsView,
      scopes: ["TEAM", "ALL"],
    });
    if (watchers.length === 0) return [];
    const groups = await ctx.db.followUp.groupBy({
      by: ["assignedToId"],
      where: { status: { in: OPEN }, dueAt: { lt: now }, lead: { deletedAt: null } },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const overdue = new Map(groups.map((group) => [group.assignedToId, group._count._all]));
    const { timezone } = await getRegionalSettings(ctx);
    const { date } = zonedClock(now, timezone);
    const candidates: AlertCandidate[] = [];
    for (const watcher of watchers) {
      let total = 0;
      if (watcher.scope === "ALL") {
        for (const value of overdue.values()) total += value;
      } else {
        if (!watcher.hasReports) continue;
        const team = await getSubtreeMembershipIds(
          ctx.db,
          ctx.organizationId,
          watcher.membershipId,
        );
        for (const memberId of team) total += overdue.get(memberId) ?? 0;
      }
      if (total === 0) continue;
      candidates.push({
        recipientId: watcher.membershipId,
        type: "team.followups_overdue",
        dedupeKey: `${watcher.membershipId}:${date}`,
        title: `${plural(total, "overdue follow-up")} in ${watcher.scope === "ALL" ? "the organization" : "your team"}`,
        body: "Follow-ups and callbacks whose time has passed without being done.",
        link: "/team/follow-ups",
      });
    }
    return candidates;
  },
};

/** Daily summary block (M06-12): follow-ups and callbacks of the recipient's team or organization. */
export const followUpsDigestSection: DigestSection = {
  key: "follow-ups",
  order: 20,
  async build(ctx, now) {
    if (!ctx.permissions.has(ACTIVITY_PERMISSIONS.followUpsView)) return null;
    const scope = await resolveDataScope(ctx, ACTIVITY_PERMISSIONS.followUpsView);
    const { timezone } = await getRegionalSettings(ctx);
    const todayStart = startOfDay(new TZDate(now, timezone));
    const today = {
      gte: new Date(todayStart.getTime()),
      lt: new Date(addDays(todayStart, 1).getTime()),
    };
    const yesterday = { gte: new Date(subDays(todayStart, 1).getTime()), lt: today.gte };
    const base: Prisma.FollowUpWhereInput = {
      lead: { deletedAt: null },
      ...(scope.scope === "ALL" ? {} : { assignedToId: { in: scope.membershipIds } }),
    };
    const count = (where: Prisma.FollowUpWhereInput) =>
      ctx.db.followUp.count({ where: { AND: [base, where] } });
    const [dueToday, overdue, callbacks, missedYesterday] = await Promise.all([
      count({ status: { in: OPEN }, dueAt: today }),
      count({ status: { in: OPEN }, dueAt: { lt: now } }),
      count({ type: "CALLBACK", status: { in: OPEN } }),
      count({ missedAt: yesterday }),
    ]);
    const board = ctx.permissions.has(ACTIVITY_PERMISSIONS.teamFollowUpsView)
      ? "/team/follow-ups"
      : "/agenda";
    return {
      title: scope.scope === "ALL" ? "Follow-ups — whole organization" : "Follow-ups — your team",
      lines: [
        { label: "Due today", value: dueToday, link: board },
        { label: "Overdue", value: overdue, link: board, attention: true },
        {
          label: "Callbacks waiting",
          value: callbacks,
          link: "/leads?callback=pending",
          attention: true,
        },
        { label: "Missed yesterday", value: missedYesterday, attention: true },
      ],
    };
  },
};
