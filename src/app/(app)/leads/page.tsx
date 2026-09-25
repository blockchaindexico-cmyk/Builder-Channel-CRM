import { Copy, Plus, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { LEAD_PERMISSIONS } from "@/modules/leads";
import { ExportLeadsButton } from "@/modules/leads/components/export-button";
import { LeadViewsBar } from "@/modules/leads/components/lead-views-bar";
import { LeadsTable } from "@/modules/leads/components/leads-table";
import { getImportBatch } from "@/modules/leads/server/import/service";
import { listLeads } from "@/modules/leads/server/leads";
import {
  loadLeadListExtras,
  loadLeadListParams,
  resolveLeadListRequest,
} from "@/modules/leads/server/list-query";
import { getLeadFormOptions } from "@/modules/leads/server/masters";
import { loadCatalogFilterOptions, statusPermissions } from "@/modules/leads/server/page-data";
import { listLeadListPresets, listSavedViews } from "@/modules/leads/server/views";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";
import { uuidOrNull } from "@/platform/validation";

export const metadata: Metadata = { title: "Leads" };

/** Leads (M04-12 → M04-15). */
export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, LEAD_PERMISSIONS.view);
  const [params, extras] = await Promise.all([
    loadLeadListParams(searchParams),
    loadLeadListExtras(searchParams),
  ]);
  const { view, query, filters, listOptions } = await resolveLeadListRequest(ctx, params, extras);
  const canImport = ctx.permissions.has(LEAD_PERMISSIONS.import);
  const [leads, formOptions, catalog, savedViews, importBatch] = await Promise.all([
    listLeads(ctx, query, filters),
    getLeadFormOptions(ctx),
    loadCatalogFilterOptions(ctx),
    listSavedViews(ctx),
    canImport && uuidOrNull(params.import)
      ? getImportBatch(ctx, params.import!).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every enquiry with its customer, requirement, status and history."
        actions={
          <>
            {ctx.permissions.has(LEAD_PERMISSIONS.export) ? <ExportLeadsButton /> : null}
            {canImport ? (
              <Button asChild variant="outline">
                <Link href="/leads/import">
                  <Upload /> Import
                </Link>
              </Button>
            ) : null}
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
        <LeadViewsBar
          views={listOptions.views}
          current={view}
          savedViews={savedViews}
          presets={listLeadListPresets(ctx)}
        />
        <LeadsTable
          rows={leads.rows}
          total={leads.total}
          canBulkStatus={ctx.permissions.has(LEAD_PERMISSIONS.changeStatus)}
          canExport={ctx.permissions.has(LEAD_PERMISSIONS.export)}
          importBatch={importBatch ? { id: importBatch.id, fileName: importBatch.fileName } : null}
          statusPermissions={statusPermissions(ctx)}
          now={new Date().toISOString()}
          options={{
            statuses: formOptions.statuses,
            sources: formOptions.sources,
            campaigns: formOptions.campaigns,
            owners: listOptions.owners,
            managers: listOptions.managers,
            projects: catalog.projects,
            builders: catalog.builders,
            extraFilters: listOptions.extraFilters,
          }}
        />
      </div>
    </>
  );
}
