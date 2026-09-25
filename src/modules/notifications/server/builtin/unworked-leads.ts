import { zonedClock } from "@/lib/date-range";
import { plural } from "@/lib/utils";
import { ASSIGNMENT_PERMISSIONS, getAssignmentSettings } from "@/modules/assignment";
import { findMembers } from "@/modules/identity";
import { countLeadsByOwner } from "@/modules/leads";
import { getRegionalSettings } from "@/modules/organization";
import { getSubtreeMembershipIds } from "@/platform/rbac/scope";

import type { AlertCandidate, AlertRule } from "../../extensions";

/**
 * Built-in alert: leads assigned more than N hours ago (Settings → Lead assignment) with no activity since. Sent to
 * whoever watches the team's workload — their reporting tree, or everyone for an organization-wide scope — at most
 * once a day.
 */
export const unworkedLeadsRule: AlertRule = {
  key: "unworked-leads",
  label: "Unworked leads",
  async evaluate(ctx, now) {
    const watchers = await findMembers(ctx.db, {
      activeOnly: true,
      withPermission: ASSIGNMENT_PERMISSIONS.workloadView,
      scopes: ["TEAM", "ALL"],
    });
    if (watchers.length === 0) return [];
    const [settings, regional] = await Promise.all([
      getAssignmentSettings(ctx.db, ctx),
      getRegionalSettings(ctx),
    ]);
    const counts = await countLeadsByOwner(ctx.db, ctx.organizationId, {
      unworkedBefore: new Date(now.getTime() - settings.unworkedHours * 3600 * 1000),
    });
    const unworked = new Map(
      counts.flatMap((row) => (row.ownerId ? [[row.ownerId, row.unworked] as const] : [])),
    );
    const { date } = zonedClock(now, regional.timezone);

    const candidates: AlertCandidate[] = [];
    for (const watcher of watchers) {
      let total = 0;
      if (watcher.scope === "ALL") {
        for (const value of unworked.values()) total += value;
      } else {
        if (!watcher.hasReports) continue;
        const team = await getSubtreeMembershipIds(
          ctx.db,
          ctx.organizationId,
          watcher.membershipId,
        );
        for (const memberId of team) total += unworked.get(memberId) ?? 0;
      }
      if (total === 0) continue;
      candidates.push({
        recipientId: watcher.membershipId,
        type: "team.unworked_leads",
        dedupeKey: `${watcher.membershipId}:${date}`,
        title: `${plural(total, "lead")} waiting more than ${plural(settings.unworkedHours, "hour")}`,
        body: `${total === 1 ? "A lead was" : "Leads were"} assigned in ${
          watcher.scope === "ALL" ? "your organization" : "your team"
        } with no call, note or status change since.`,
        link: "/team/workload",
      });
    }
    return candidates;
  },
};
