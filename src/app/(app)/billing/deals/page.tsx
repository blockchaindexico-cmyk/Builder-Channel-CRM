import type { Metadata } from "next";
import { createLoader, parseAsString } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { toTableQuery } from "@/lib/table-query";
import { DealsTable } from "@/modules/billing/components/deals-table";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { DEAL_SORTABLE_FIELDS, listDealFinancials } from "@/modules/billing/server/financials";
import { listBuilderOptions, listProjectOptions } from "@/modules/catalog";
import { listMemberOptions } from "@/modules/identity";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Deal financials" };

const loadParams = createLoader({
  ...tableSearchParams,
  from: parseAsString,
  to: parseAsString,
  status: parseAsString,
  builder: parseAsString,
  project: parseAsString,
  executive: parseAsString,
  manager: parseAsString,
  invoiced: parseAsString,
});

/** Deal financials (M09-06): every closed booking with its commission, costs and profit. */
export default async function DealsPage({ searchParams }: PageProps<"/billing/deals">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, BILLING_PERMISSIONS.financeView);
  const params = await loadParams(searchParams);
  const query = toTableQuery(params, {
    sortable: DEAL_SORTABLE_FIELDS,
    defaultSort: { field: "recognizedOn", direction: "desc" },
  });
  const filters = {
    from: params.from,
    to: params.to,
    status: params.status,
    builderId: params.builder,
    projectId: params.project,
    executiveId: params.executive,
    managerId: params.manager,
    invoiced:
      params.invoiced === "yes"
        ? ("yes" as const)
        : params.invoiced === "no"
          ? ("no" as const)
          : null,
  };
  const [deals, regional, builders, projects, members, managers] = await Promise.all([
    listDealFinancials(ctx, query, filters),
    getRegionalSettings(ctx),
    listBuilderOptions(ctx, { includeInactive: true }).catch(() => []),
    listProjectOptions(ctx),
    listMemberOptions(ctx, {}),
    listMemberOptions(ctx, { managersOnly: true }),
  ]);
  const money = (value: string) => formatMoney(value, regional, { compact: true });
  return (
    <>
      <PageHeader
        title="Deal financials"
        description="Commission, costs and profit of each closed booking. Drafts follow booking changes until confirmed."
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Totals">
        <Badge variant="outline">{deals.total} deals</Badge>
        <Badge variant="outline">Agreement value {money(deals.totals.agreementValue)}</Badge>
        <Badge variant="info">Commission {money(deals.totals.grossCommission)}</Badge>
        <Badge variant="success">Net profit {money(deals.totals.netProfit)}</Badge>
      </div>
      <DealsTable
        rows={deals.rows}
        total={deals.total}
        builders={builders.map((builder) => ({ id: builder.id, label: builder.name }))}
        projects={projects.map((project) => ({
          id: project.id,
          label: `${project.name} · ${project.builderName}`,
        }))}
        executives={members.map((member) => ({ id: member.membershipId, label: member.name }))}
        managers={managers.map((member) => ({ id: member.membershipId, label: member.name }))}
      />
    </>
  );
}
