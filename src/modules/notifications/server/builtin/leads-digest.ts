import { plural } from "@/lib/utils";
import { ASSIGNMENT_PERMISSIONS, getAssignmentSettings } from "@/modules/assignment";
import { countLeadsByOwner, LEAD_PERMISSIONS } from "@/modules/leads";
import { resolveDataScope } from "@/platform/rbac/scope";

import type { DigestLine, DigestSection } from "../../extensions";

/** Built-in block of the daily summary: the leads the recipient is responsible for. */
export const leadsDigestSection: DigestSection = {
  key: "leads",
  order: 10,
  async build(ctx, now) {
    if (!ctx.permissions.has(LEAD_PERMISSIONS.view)) return null;
    const scope = await resolveDataScope(ctx, LEAD_PERMISSIONS.view);
    const settings = await getAssignmentSettings(ctx.db, ctx);
    const counts = await countLeadsByOwner(ctx.db, ctx.organizationId, {
      ownerIds: scope.scope === "ALL" ? null : scope.membershipIds,
      unworkedBefore: new Date(now.getTime() - settings.unworkedHours * 3600 * 1000),
    });
    const owned = counts.filter((row) => row.ownerId !== null);
    const sum = (pick: (row: (typeof owned)[number]) => number) =>
      owned.reduce((total, row) => total + pick(row), 0);
    const lines: DigestLine[] = [
      {
        label: "Open leads with an owner",
        value: sum((row) => row.open),
        link: "/leads?open=true",
      },
      {
        label: "Not contacted yet (new or assigned)",
        value: sum((row) => row.untouched),
        attention: true,
      },
      {
        label: `Waiting more than ${plural(settings.unworkedHours, "hour")} since assignment`,
        value: sum((row) => row.unworked),
        link: ctx.permissions.has(ASSIGNMENT_PERMISSIONS.workloadView) ? "/team/workload" : null,
        attention: true,
      },
    ];
    if (ctx.permissions.has(ASSIGNMENT_PERMISSIONS.assign)) {
      lines.push({
        label: "Unassigned, waiting for an owner",
        value: counts.find((row) => row.ownerId === null)?.open ?? 0,
        link: "/leads/unassigned",
        attention: true,
      });
    }
    return {
      title: scope.scope === "ALL" ? "Leads — whole organization" : "Leads — your team",
      lines,
    };
  },
};
