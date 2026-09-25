import type { Metadata } from "next";
import { createLoader, parseAsString } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { isIsoDate } from "@/lib/date-range";
import { toTableQuery } from "@/lib/table-query";
import { CallsTable } from "@/modules/activities/components/calls-table";
import { ACTIVITY_PERMISSIONS } from "@/modules/activities/permissions";
import { CALL_SORTABLE_FIELDS, listCalls, summarizeCalls } from "@/modules/activities/server/calls";
import { listCallOutcomes } from "@/modules/activities/server/masters";
import { listMemberOptions } from "@/modules/identity";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { resolveDataScope } from "@/platform/rbac/scope";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Calls" };

const loadParams = createLoader({
  ...tableSearchParams,
  from: parseAsString,
  to: parseAsString,
  outcome: parseAsString,
  caller: parseAsString,
  direction: parseAsString,
  reached: parseAsString,
});

/** Calls (M07-06): one's own, the team's or everyone's, by date, outcome, caller and direction. */
export default async function CallsPage({ searchParams }: PageProps<"/calls">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ACTIVITY_PERMISSIONS.callsView);
  const params = await loadParams(searchParams);
  const [regional, scope] = await Promise.all([
    getRegionalSettings(ctx),
    resolveDataScope(ctx, ACTIVITY_PERMISSIONS.callsView),
  ]);
  const filters = {
    range:
      isIsoDate(params.from) && isIsoDate(params.to) ? { from: params.from, to: params.to } : null,
    outcomeId: params.outcome,
    callerId: params.caller,
    direction: params.direction,
    connected: params.reached === "yes" ? true : params.reached === "no" ? false : null,
    timezone: regional.timezone,
  };
  const query = toTableQuery(params, {
    sortable: CALL_SORTABLE_FIELDS,
    defaultSort: { field: "startedAt", direction: "desc" },
  });
  const [calls, summary, outcomes, callers] = await Promise.all([
    listCalls(ctx, query, filters),
    summarizeCalls(ctx, filters),
    listCallOutcomes(ctx),
    scope.scope === "OWN"
      ? Promise.resolve([])
      : listMemberOptions(ctx, scope.scope === "ALL" ? {} : { ids: scope.membershipIds }),
  ]);
  const rate = summary.total ? Math.round((summary.connected / summary.total) * 100) : 0;
  return (
    <>
      <PageHeader
        title="Calls"
        description={
          scope.scope === "OWN"
            ? "Your calls with customers and how they went."
            : "Calls with customers, who made them and how they went."
        }
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Summary">
        <Badge variant="secondary">{summary.total} calls</Badge>
        <Badge variant="success">
          {summary.connected} reached ({rate}%)
        </Badge>
        {summary.byCategory.INTERESTED || summary.byCategory.POSITIVE ? (
          <Badge variant="outline">
            {(summary.byCategory.INTERESTED ?? 0) + (summary.byCategory.POSITIVE ?? 0)} positive
          </Badge>
        ) : null}
        {summary.byCategory.CALLBACK ? (
          <Badge variant="outline">{summary.byCategory.CALLBACK} callbacks asked</Badge>
        ) : null}
      </div>
      <CallsTable
        rows={calls.rows}
        total={calls.total}
        outcomes={outcomes.map((outcome) => ({ id: outcome.id, label: outcome.label }))}
        callers={callers.map((caller) => ({
          membershipId: caller.membershipId,
          name: caller.name,
        }))}
      />
    </>
  );
}
