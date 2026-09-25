import type { Metadata } from "next";
import Link from "next/link";
import { createLoader, parseAsString } from "nuqs/server";

import { PageHeader } from "@/components/shared/page-header";
import { formatMoney } from "@/lib/format";
import { ReportFilters } from "@/modules/billing/components/report-filters";
import { StatCard, SummaryTable } from "@/modules/billing/components/summary-table";
import { EXPENSE_CATEGORIES } from "@/modules/billing/constants";
import { sum, toMoney } from "@/modules/billing/money";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { resolvePeriod } from "@/modules/billing/server/period";
import {
  getProfitAndLoss,
  PL_DIMENSIONS,
  type PlDimension,
  type PlRow,
} from "@/modules/billing/server/reports";
import { listBuilderOptions } from "@/modules/catalog";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Profit & loss" };

const loadParams = createLoader({
  from: parseAsString,
  to: parseAsString,
  by: parseAsString,
  builder: parseAsString,
});

/** Where the deal's filter lives on the deals list, for drill-down from a row (M09-12). */
const DRILL_PARAM: Record<PlDimension, string | null> = {
  builder: "builder",
  project: "project",
  executive: "executive",
  manager: "manager",
  month: null,
};

/** Profit & loss (M09-12, M09-15): closed deals by builder, project, executive, manager or month, less overheads. */
export default async function ProfitLossPage({ searchParams }: PageProps<"/reports/profit-loss">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, BILLING_PERMISSIONS.financeView);
  const params = await loadParams(searchParams);
  const regional = await getRegionalSettings(ctx);
  const { period } = await resolvePeriod(ctx, regional.timezone, params);
  const dimension = PL_DIMENSIONS.find((entry) => entry.value === params.by)?.value ?? "builder";
  const [pl, builders] = await Promise.all([
    getProfitAndLoss(ctx, period, dimension, { builderId: params.builder }),
    listBuilderOptions(ctx, { includeInactive: true }).catch(() => []),
  ]);
  const money = (value: string) => formatMoney(value, regional);
  const drill = (row: PlRow) => {
    const query = new URLSearchParams({ from: period.from, to: period.to });
    if (params.builder) query.set("builder", params.builder);
    const param = DRILL_PARAM[dimension];
    if (dimension === "month") {
      const [year, month] = row.key.split("-").map(Number) as [number, number];
      const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
      query.set("from", `${row.key}-01`);
      query.set("to", `${row.key}-${String(last).padStart(2, "0")}`);
    } else if (param && row.key !== "none") {
      query.set(param, row.key);
    }
    return `/billing/deals?${query.toString()}`;
  };
  const dimensionLabel = PL_DIMENSIONS.find((entry) => entry.value === dimension)!.label;
  return (
    <>
      <PageHeader
        title="Profit & loss"
        description="Commission earned on closed deals, less cashback, payouts, incentives and expenses."
      />
      <ReportFilters
        period={period}
        dimensions={PL_DIMENSIONS}
        dimension={dimension}
        builders={builders.map((builder) => ({ value: builder.id, label: builder.name }))}
        exportRegister="profit-loss"
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Gross commission"
          value={money(pl.total.grossCommission)}
          hint={`${pl.total.deals} deals`}
        />
        <StatCard label="Net revenue" value={money(pl.total.netRevenue)} hint="After cashback" />
        <StatCard
          label="Net profit on deals"
          value={money(pl.total.netProfit)}
          hint={pl.total.margin ? `${pl.total.margin}% of net revenue` : undefined}
          tone="positive"
        />
        <StatCard
          label="Organization profit"
          value={money(pl.organizationProfit)}
          hint={`After ${money(pl.businessExpensesTotal)} business expenses`}
          tone={pl.organizationProfit.startsWith("-") ? "negative" : "positive"}
        />
      </div>
      <SummaryTable<PlRow>
        caption={`Profit and loss by ${dimensionLabel.toLowerCase()}`}
        rows={pl.rows}
        total={pl.total}
        empty="No closed deals in this period."
        columns={[
          {
            key: "label",
            header: dimensionLabel,
            cell: (row) =>
              row.key === "total" ? (
                row.label
              ) : (
                <Link href={drill(row)} className="text-primary hover:underline">
                  {row.label}
                </Link>
              ),
          },
          { key: "deals", header: "Deals", numeric: true, cell: (row) => row.deals },
          {
            key: "value",
            header: "Agreement value",
            numeric: true,
            cell: (row) => formatMoney(row.agreementValue, regional, { compact: true }),
          },
          {
            key: "gross",
            header: "Commission",
            numeric: true,
            cell: (row) => money(row.grossCommission),
          },
          {
            key: "cashback",
            header: "Cashback",
            numeric: true,
            cell: (row) => money(row.cashback),
          },
          {
            key: "revenue",
            header: "Net revenue",
            numeric: true,
            cell: (row) => money(row.netRevenue),
          },
          {
            key: "costs",
            header: "Payouts, incentives & other",
            numeric: true,
            cell: (row) => money(toMoney(sum([row.payouts, row.incentives, row.otherExpenses]))),
          },
          {
            key: "profit",
            header: "Net profit",
            numeric: true,
            cell: (row) => money(row.netProfit),
          },
          {
            key: "margin",
            header: "Margin",
            numeric: true,
            cell: (row) => (row.margin ? `${row.margin}%` : "—"),
          },
        ]}
      />
      <section className="mt-8 max-w-xl" aria-labelledby="overheads">
        <h2 id="overheads" className="mb-3 text-lg font-semibold">
          Business expenses
        </h2>
        <SummaryTable<{ key: string; label: string; amount: string }>
          caption="Business expenses by category"
          empty="No business expenses in this period."
          rows={pl.businessExpenses.map((entry) => ({
            key: entry.category,
            label:
              EXPENSE_CATEGORIES.find((category) => category.value === entry.category)?.label ??
              entry.category,
            amount: entry.amount,
          }))}
          total={{ key: "total", label: "Total", amount: pl.businessExpensesTotal }}
          columns={[
            { key: "label", header: "Category", cell: (row) => row.label },
            { key: "amount", header: "Amount", numeric: true, cell: (row) => money(row.amount) },
          ]}
        />
        <p className="mt-2 text-sm">
          <Link
            href={`/billing/expenses?from=${period.from}&to=${period.to}`}
            className="text-primary hover:underline"
          >
            Open the expense ledger
          </Link>
        </p>
      </section>
    </>
  );
}
