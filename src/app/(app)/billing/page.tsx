import { FilePlus2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createLoader, parseAsString } from "nuqs/server";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { EnsureDealsButton } from "@/modules/billing/components/deal-actions";
import { ReportFilters } from "@/modules/billing/components/report-filters";
import { StatCard, SummaryTable } from "@/modules/billing/components/summary-table";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { countBookingsWithoutFinancials } from "@/modules/billing/server/financials";
import { resolvePeriod } from "@/modules/billing/server/period";
import { type BillingSummaryRow, getBillingDashboard } from "@/modules/billing/server/reports";
import { AGEING_BUCKETS } from "@/modules/billing/tax";
import { getRegionalSettings } from "@/modules/organization";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Billing" };

const loadParams = createLoader({ from: parseAsString, to: parseAsString });

/** Billing dashboard (M09-10, M09-11): billed, collected, outstanding and overdue, with ageing. */
export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const ctx = await getRequestContext();
  if (!ctx.permissions.has(BILLING_PERMISSIONS.billingView)) redirect("/billing/deals");
  const params = await loadParams(searchParams);
  const regional = await getRegionalSettings(ctx);
  const { today, period, fiscalYear } = await resolvePeriod(ctx, regional.timezone, params);
  const canFinance = ctx.permissions.has(BILLING_PERMISSIONS.financeManage);
  const [dashboard, missing] = await Promise.all([
    getBillingDashboard(ctx, period, today),
    canFinance ? countBookingsWithoutFinancials(ctx) : Promise.resolve(0),
  ]);
  const money = (value: string) => formatMoney(value, regional);
  const columns = (first: string) => [
    { key: "label", header: first, cell: (row: BillingSummaryRow) => row.label },
    {
      key: "billed",
      header: "Billed",
      numeric: true,
      cell: (row: BillingSummaryRow) => money(row.billed),
    },
    {
      key: "collected",
      header: "Collected",
      numeric: true,
      cell: (row: BillingSummaryRow) => money(row.collected),
    },
    {
      key: "outstanding",
      header: "Outstanding now",
      numeric: true,
      cell: (row: BillingSummaryRow) => money(row.outstanding),
    },
  ];
  const ageingTotal = AGEING_BUCKETS.reduce(
    (total, bucket) => total + Number(dashboard.ageing[bucket]),
    0,
  );
  return (
    <>
      <PageHeader
        title="Billing"
        description={`Invoices to builders and what they have paid — fiscal year ${fiscalYear} unless you pick dates.`}
        actions={
          ctx.permissions.has(BILLING_PERMISSIONS.billingManage) ? (
            <Button asChild>
              <Link href="/billing/invoices/new">
                <FilePlus2 /> New invoice
              </Link>
            </Button>
          ) : null
        }
      />
      <ReportFilters period={period} />
      {missing > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <span>
            {missing === 1 ? "1 closed booking has" : `${missing} closed bookings have`} no deal
            financials yet (closed before billing was set up).
          </span>
          <EnsureDealsButton />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Billed"
          value={money(dashboard.billed)}
          hint="Invoices issued in the period, with tax"
        />
        <StatCard
          label="Collected"
          value={money(dashboard.collected)}
          hint={`Includes ${money(dashboard.tdsDeducted)} TDS deducted by builders`}
          tone="positive"
        />
        <StatCard
          label="Outstanding"
          value={money(dashboard.outstanding)}
          hint="All open invoices, today"
        />
        <StatCard
          label="Overdue"
          value={money(dashboard.overdue)}
          hint={
            <Link
              href="/billing/invoices?status=OPEN&overdue=1"
              className="text-primary hover:underline"
            >
              {dashboard.overdueCount === 1 ? "1 invoice" : `${dashboard.overdueCount} invoices`}{" "}
              past their due date
            </Link>
          }
          tone={dashboard.overdueCount ? "attention" : undefined}
        />
      </div>

      <section className="mt-8" aria-labelledby="ageing-heading">
        <h2 id="ageing-heading" className="mb-3 text-lg font-semibold">
          Receivables ageing
        </h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {AGEING_BUCKETS.map((bucket) => {
            const share = ageingTotal ? (Number(dashboard.ageing[bucket]) / ageingTotal) * 100 : 0;
            return (
              <div key={bucket} className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">{bucket} days</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {money(dashboard.ageing[bucket])}
                </p>
                <div className="mt-2 h-1.5 rounded bg-muted" aria-hidden>
                  <div
                    className={
                      bucket === "90+" ? "h-1.5 rounded bg-destructive" : "h-1.5 rounded bg-primary"
                    }
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Days since the invoice date, of what is still owed.
        </p>
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <section aria-labelledby="by-builder">
          <h2 id="by-builder" className="mb-3 text-lg font-semibold">
            By builder
          </h2>
          <SummaryTable
            caption="Billing by builder"
            columns={columns("Builder")}
            rows={dashboard.byBuilder}
          />
        </section>
        <section aria-labelledby="by-month">
          <h2 id="by-month" className="mb-3 text-lg font-semibold">
            By month
          </h2>
          <SummaryTable
            caption="Billing by month"
            columns={columns("Month").filter((column) => column.key !== "outstanding")}
            rows={dashboard.byMonth}
          />
        </section>
        <section aria-labelledby="by-project" className="xl:col-span-2">
          <h2 id="by-project" className="mb-3 text-lg font-semibold">
            By project
          </h2>
          <SummaryTable
            caption="Billing by project"
            columns={columns("Project").filter(
              (column) => column.key === "label" || column.key === "billed",
            )}
            rows={dashboard.byProject}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Taxable value of the invoice lines, before tax.
          </p>
        </section>
      </div>
    </>
  );
}
