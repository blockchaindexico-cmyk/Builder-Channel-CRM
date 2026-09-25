import { Copy, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { isIsoDate } from "@/lib/date-range";
import { toTableQuery } from "@/lib/table-query";
import { LEAD_PERMISSIONS } from "@/modules/leads";
import { LeadViewsBar } from "@/modules/leads/components/lead-views-bar";
import { LeadsTable } from "@/modules/leads/components/leads-table";
import {
  getLeadListOptions,
  LEAD_SORTABLE_FIELDS,
  LEAD_VIEWS,
  listLeads,
} from "@/modules/leads/server/leads";
import { getLeadFormOptions } from "@/modules/leads/server/masters";
import { loadCatalogFilterOptions, statusPermissions } from "@/modules/leads/server/page-data";
import { listSavedViews } from "@/modules/leads/server/views";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Leads" };

const loadSearchParams = createLoader({
  ...tableSearchParams,
  view: parseAsStringLiteral(LEAD_VIEWS),
  status: parseAsString,
  category: parseAsString,
  source: parseAsString,
  campaign: parseAsString,
  owner: parseAsString,
  team: parseAsString,
  project: parseAsString,
  builder: parseAsString,
  temperature: parseAsString,
  tag: parseAsString,
  createdFrom: parseAsString,
  createdTo: parseAsString,
  activityFrom: parseAsString,
  activityTo: parseAsString,
});

const range = (from: string | null, to: string | null) =>
  isIsoDate(from) && isIsoDate(to) ? { from, to } : null;

/** Leads (M04-12 → M04-15). */
export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, LEAD_PERMISSIONS.view);
  const params = await loadSearchParams(searchParams);
  const listOptions = await getLeadListOptions(ctx);
  const view =
    params.view && listOptions.views.includes(params.view) ? params.view : listOptions.views[0]!;
  const query = toTableQuery(params, {
    sortable: LEAD_SORTABLE_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const regional = await getRegionalSettings(ctx);
  const [leads, formOptions, catalog, savedViews] = await Promise.all([
    listLeads(ctx, query, {
      view,
      statusIds: params.status ? [params.status] : null,
      statusCategory: params.category,
      sourceId: params.source,
      campaignId: params.campaign,
      ownerId: params.owner,
      teamOf: params.team,
      projectId: params.project,
      builderId: params.builder,
      temperature: params.temperature,
      tag: params.tag,
      created: range(params.createdFrom, params.createdTo),
      lastActivity: range(params.activityFrom, params.activityTo),
      timezone: regional.timezone,
    }),
    getLeadFormOptions(ctx),
    loadCatalogFilterOptions(ctx),
    listSavedViews(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every enquiry with its customer, requirement, status and history."
        actions={
          <>
            {ctx.permissions.has(LEAD_PERMISSIONS.merge) ? (
              <Button asChild variant="outline">
                <Link href="/leads/duplicates">
                  <Copy /> Duplicates
                </Link>
              </Button>
            ) : null}
            {ctx.permissions.has(LEAD_PERMISSIONS.create) ? (
              <Button asChild>
                <Link href="/leads/new">
                  <Plus /> New lead
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="space-y-4">
        <LeadViewsBar views={listOptions.views} current={view} savedViews={savedViews} />
        <LeadsTable
          rows={leads.rows}
          total={leads.total}
          canBulkStatus={ctx.permissions.has(LEAD_PERMISSIONS.changeStatus)}
          statusPermissions={statusPermissions(ctx)}
          options={{
            statuses: formOptions.statuses,
            sources: formOptions.sources,
            campaigns: formOptions.campaigns,
            owners: listOptions.owners,
            managers: listOptions.managers,
            projects: catalog.projects,
            builders: catalog.builders,
          }}
        />
      </div>
    </>
  );
}
