import type { Metadata } from "next";
import { createLoader, parseAsString } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { UrlTabs } from "@/components/shared/url-tabs";
import { Badge } from "@/components/ui/badge";
import { isIsoDate } from "@/lib/date-range";
import { toTableQuery } from "@/lib/table-query";
import { ACTIVITY_PERMISSIONS } from "@/modules/activities";
import { listBuilderOptions, listProjectOptions } from "@/modules/catalog";
import { TeamVisitsTable } from "@/modules/deals/components/team-visits-table";
import { VisitCalendar } from "@/modules/deals/components/visit-calendar";
import { VisitsTable } from "@/modules/deals/components/visits-table";
import { DEAL_PERMISSIONS } from "@/modules/deals/permissions";
import {
  getVisitWeek,
  listVisits,
  summarizeVisits,
  teamVisitSummary,
  VISIT_SORTABLE_FIELDS,
} from "@/modules/deals/server/visit-lists";
import { listMemberOptions } from "@/modules/identity";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { resolveDataScope } from "@/platform/rbac/scope";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Site visits" };

const loadParams = createLoader({
  ...tableSearchParams,
  from: parseAsString,
  to: parseAsString,
  project: parseAsString,
  builder: parseAsString,
  executive: parseAsString,
  status: parseAsString,
  kind: parseAsString,
  week: parseAsString,
});

/** Site visits (M08-06): list, week calendar and — for managers — the team's visits and outcomes. */
export default async function VisitsPage({ searchParams }: PageProps<"/visits">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, DEAL_PERMISSIONS.visitsView);
  const params = await loadParams(searchParams);
  const now = new Date();
  const [regional, scope] = await Promise.all([
    getRegionalSettings(ctx),
    resolveDataScope(ctx, DEAL_PERMISSIONS.visitsView),
  ]);
  const filters = {
    range:
      isIsoDate(params.from) && isIsoDate(params.to) ? { from: params.from, to: params.to } : null,
    projectId: params.project,
    builderId: params.builder,
    assignedToId: params.executive,
    status: params.status,
    kind: params.kind,
    timezone: regional.timezone,
    now,
  };
  const query = toTableQuery(params, {
    sortable: VISIT_SORTABLE_FIELDS,
    defaultSort: { field: "scheduledAt", direction: "desc" },
  });
  const [visits, summary, week, team, projects, builders, executives] = await Promise.all([
    listVisits(ctx, query, filters),
    summarizeVisits(ctx, filters),
    getVisitWeek(ctx, params.week, filters),
    teamVisitSummary(ctx, filters),
    listProjectOptions(ctx),
    listBuilderOptions(ctx).catch(() => []),
    scope.scope === "OWN"
      ? Promise.resolve([])
      : listMemberOptions(ctx, scope.scope === "ALL" ? {} : { ids: scope.membershipIds }),
  ]);
  const abilities = {
    canBook: ctx.permissions.has(DEAL_PERMISSIONS.bookingsManage),
    canMarkLost: ctx.permissions.has(DEAL_PERMISSIONS.markLost),
    canFollowUp: ctx.permissions.has(ACTIVITY_PERMISSIONS.followUpsManage),
  };
  return (
    <>
      <PageHeader
        title="Site visits"
        description={
          scope.scope === "OWN"
            ? "Your site visits and revisits: what is coming up and how they went."
            : "Site visits and revisits of your team: what is coming up and how they went."
        }
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Summary">
        <Badge variant="info">{summary.upcoming} coming up</Badge>
        {summary.pendingOutcome ? (
          <Badge variant="warning">{summary.pendingOutcome} waiting for the outcome</Badge>
        ) : null}
        <Badge variant="success">
          {summary.completed} done ({summary.revisits} revisits)
        </Badge>
        {summary.noShow ? <Badge variant="destructive">{summary.noShow} no-shows</Badge> : null}
        {summary.cancelled ? (
          <Badge variant="secondary">{summary.cancelled} cancelled</Badge>
        ) : null}
      </div>
      <UrlTabs
        tabs={[
          {
            value: "list",
            label: "List",
            content: (
              <VisitsTable
                rows={visits.rows}
                total={visits.total}
                projects={projects.map((project) => ({
                  id: project.id,
                  label: `${project.name} · ${project.builderName}`,
                }))}
                builders={builders.map((builder) => ({ id: builder.id, label: builder.name }))}
                executives={executives.map((member) => ({
                  id: member.membershipId,
                  label: member.name,
                }))}
                canManage={ctx.permissions.has(DEAL_PERMISSIONS.visitsManage)}
                abilities={abilities}
                now={now.toISOString()}
              />
            ),
          },
          {
            value: "calendar",
            label: "Calendar",
            content: <VisitCalendar week={week} now={now.toISOString()} />,
          },
          ...(scope.scope === "OWN"
            ? []
            : [
                {
                  value: "team",
                  label: "Team",
                  content: <TeamVisitsTable rows={team} range={filters.range} />,
                },
              ]),
        ]}
      />
    </>
  );
}
