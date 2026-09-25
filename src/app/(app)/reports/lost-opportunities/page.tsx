import type { Metadata } from "next";
import { createLoader, parseAsString } from "nuqs/server";

import { PageHeader } from "@/components/shared/page-header";
import { formatMoney } from "@/lib/format";
import { ReportFilters } from "@/modules/billing/components/report-filters";
import { StatCard, SummaryTable } from "@/modules/billing/components/summary-table";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { resolvePeriod } from "@/modules/billing/server/period";
import { getLostOpportunities, type LostRow } from "@/modules/billing/server/reports";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Lost opportunities" };

const loadParams = createLoader({ from: parseAsString, to: parseAsString });

/** Lost opportunities (M09-13): lost and not-interested leads and cancelled bookings, by reason and who/where. */
export default async function LostOpportunitiesPage({
  searchParams,
}: PageProps<"/reports/lost-opportunities">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, BILLING_PERMISSIONS.financeView);
  const params = await loadParams(searchParams);
  const regional = await getRegionalSettings(ctx);
  const { period } = await resolvePeriod(ctx, regional.timezone, params);
  const report = await getLostOpportunities(ctx, period);
  const money = (value: string) => formatMoney(value, regional, { compact: true });
  const table = (title: string, first: string, rows: LostRow[], valueLabel = "Estimated value") => (
    <section aria-label={title}>
      <h3 className="mb-2 font-medium">{title}</h3>
      <SummaryTable<LostRow>
        caption={title}
        rows={rows}
        empty="None in this period."
        columns={[
          { key: "label", header: first, cell: (row) => row.label },
          { key: "count", header: "Count", numeric: true, cell: (row) => row.count },
          {
            key: "value",
            header: valueLabel,
            numeric: true,
            cell: (row) => money(row.estimatedValue),
          },
        ]}
      />
    </section>
  );
  return (
    <>
      <PageHeader
        title="Lost opportunities"
        description="Why business was lost. Lead values are estimated from the customer's budget (upper end)."
      />
      <ReportFilters period={period} />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Leads lost"
          value={report.lost.count}
          hint={`About ${money(report.lost.estimatedValue)} of budget`}
          tone={report.lost.count ? "negative" : undefined}
        />
        <StatCard
          label="Not interested"
          value={report.notInterested.count}
          hint={`About ${money(report.notInterested.estimatedValue)} of budget`}
        />
        <StatCard
          label="Bookings cancelled"
          value={report.cancelledBookings.count}
          hint={`${money(report.cancelledBookings.value)} of agreement value`}
          tone={report.cancelledBookings.count ? "negative" : undefined}
        />
      </div>
      <h2 className="mb-3 text-lg font-semibold">Lost leads</h2>
      <div className="grid gap-6 xl:grid-cols-2">
        {table("By reason", "Reason", report.lost.byReason)}
        {table("By executive", "Executive", report.lost.byExecutive)}
        {table("By project", "Project (first interest)", report.lost.byProject)}
        {table("By builder", "Builder", report.lost.byBuilder)}
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Not interested</h2>
          {table("Not interested by reason", "Reason", report.notInterested.byReason)}
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Cancelled bookings</h2>
          <div className="space-y-6">
            {table(
              "Cancellations by reason",
              "Reason",
              report.cancelledBookings.byReason,
              "Agreement value",
            )}
            {table(
              "Cancellations by builder",
              "Builder",
              report.cancelledBookings.byBuilder,
              "Agreement value",
            )}
          </div>
        </div>
      </div>
    </>
  );
}
