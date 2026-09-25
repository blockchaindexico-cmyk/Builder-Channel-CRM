import type { Metadata } from "next";
import { createLoader, parseAsString } from "nuqs/server";

import { PageHeader } from "@/components/shared/page-header";
import { formatMoney } from "@/lib/format";
import { ExpensesManager } from "@/modules/billing/components/expenses-manager";
import { ReportFilters } from "@/modules/billing/components/report-filters";
import { StatCard, SummaryTable } from "@/modules/billing/components/summary-table";
import { EXPENSE_CATEGORIES } from "@/modules/billing/constants";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { listBusinessExpenses } from "@/modules/billing/server/expenses";
import { resolvePeriod } from "@/modules/billing/server/period";
import { type CostPerLeadRow, getCostPerLead } from "@/modules/billing/server/reports";
import { listProjectOptions } from "@/modules/catalog";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Business expenses" };

const loadParams = createLoader({
  from: parseAsString,
  to: parseAsString,
  category: parseAsString,
});

/** Business expense ledger and cost per lead (M09-15). */
export default async function ExpensesPage({ searchParams }: PageProps<"/billing/expenses">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, BILLING_PERMISSIONS.financeView);
  const params = await loadParams(searchParams);
  const regional = await getRegionalSettings(ctx);
  const { today, period } = resolvePeriod(regional, params);
  const category =
    EXPENSE_CATEGORIES.find((entry) => entry.value === params.category)?.value ?? null;
  const [expenses, costPerLead, sources, campaigns, projects] = await Promise.all([
    listBusinessExpenses(ctx, { period, category }),
    getCostPerLead(ctx, period),
    ctx.db.leadSource.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    ctx.db.campaign.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sourceId: true },
    }),
    listProjectOptions(ctx),
  ]);
  const money = (value: string | null) => (value ? formatMoney(value, regional) : "—");
  return (
    <>
      <PageHeader
        title="Business expenses"
        description="Overheads and marketing spend outside individual deals. They reduce the organization's profit."
      />
      <ReportFilters period={period} categories={EXPENSE_CATEGORIES} exportRegister="expenses" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Spent in the period" value={money(expenses.total)} />
      </div>
      <ExpensesManager
        rows={expenses.rows}
        canManage={ctx.permissions.has(BILLING_PERMISSIONS.financeManage)}
        today={today}
        sources={sources.map((source) => ({ id: source.id, label: source.name }))}
        campaigns={campaigns.map((campaign) => ({
          id: campaign.id,
          label: campaign.name,
          sourceId: campaign.sourceId,
        }))}
        projects={projects.map((project) => ({
          id: project.id,
          label: `${project.name} · ${project.builderName}`,
        }))}
      />
      <section className="mt-8" aria-labelledby="cpl-heading">
        <h2 id="cpl-heading" className="mb-1 text-lg font-semibold">
          Cost per lead
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Marketing spend by lead source against the leads created and units booked in the period.
        </p>
        <SummaryTable<CostPerLeadRow>
          caption="Cost per lead by source"
          rows={costPerLead}
          empty="No marketing spend or leads in this period."
          columns={[
            { key: "label", header: "Source", cell: (row) => row.label },
            { key: "spend", header: "Spend", numeric: true, cell: (row) => money(row.spend) },
            { key: "leads", header: "Leads", numeric: true, cell: (row) => row.leads },
            { key: "bookings", header: "Bookings", numeric: true, cell: (row) => row.bookings },
            {
              key: "cpl",
              header: "Cost per lead",
              numeric: true,
              cell: (row) => money(row.costPerLead),
            },
            {
              key: "cpb",
              header: "Cost per booking",
              numeric: true,
              cell: (row) => money(row.costPerBooking),
            },
          ]}
        />
      </section>
    </>
  );
}
