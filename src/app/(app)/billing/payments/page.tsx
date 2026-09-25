import type { Metadata } from "next";
import Link from "next/link";
import { createLoader, parseAsString } from "nuqs/server";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { ReportFilters } from "@/modules/billing/components/report-filters";
import { StatCard, SummaryTable } from "@/modules/billing/components/summary-table";
import { PAYMENT_MODES } from "@/modules/billing/constants";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { resolvePeriod } from "@/modules/billing/server/period";
import { listPayments, type PaymentRegisterRow } from "@/modules/billing/server/reports";
import { listBuilderOptions } from "@/modules/catalog";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Collections" };

const loadParams = createLoader({ from: parseAsString, to: parseAsString, builder: parseAsString });

/** Collections register (M09-14): money received in the period, with TDS; voided payments shown struck. */
export default async function PaymentsPage({ searchParams }: PageProps<"/billing/payments">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, BILLING_PERMISSIONS.billingView);
  const params = await loadParams(searchParams);
  const regional = await getRegionalSettings(ctx);
  const { period } = await resolvePeriod(ctx, regional.timezone, params);
  const [register, builders] = await Promise.all([
    listPayments(ctx, { period, builderId: params.builder, includeVoided: true }),
    listBuilderOptions(ctx, { includeInactive: true }).catch(() => []),
  ]);
  const money = (value: string) => formatMoney(value, regional);
  const rows = register.rows.map((row) => ({ ...row, key: row.id }));
  return (
    <>
      <PageHeader
        title="Collections"
        description="Payments received from builders against invoices."
      />
      <ReportFilters
        period={period}
        builders={builders.map((builder) => ({ value: builder.id, label: builder.name }))}
        exportRegister="payments"
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Received" value={money(register.received)} tone="positive" />
        <StatCard
          label="TDS deducted"
          value={money(register.tds)}
          hint="Claim it against your tax"
        />
      </div>
      <SummaryTable<PaymentRegisterRow & { key: string }>
        caption="Payments received"
        empty="No payments in this period."
        rows={rows}
        columns={[
          {
            key: "date",
            header: "Received on",
            cell: (row) => (
              <span className={row.voided ? "line-through" : undefined}>
                {formatCalendarDate(row.receivedOn, regional)}
              </span>
            ),
          },
          {
            key: "invoice",
            header: "Invoice",
            cell: (row) => (
              <Link
                href={`/billing/invoices/${row.invoice.id}`}
                className="text-primary hover:underline"
              >
                {row.invoice.number}
              </Link>
            ),
          },
          { key: "builder", header: "Builder", cell: (row) => row.builderName },
          {
            key: "mode",
            header: "Mode",
            cell: (row) => (
              <span>
                {PAYMENT_MODES.find((mode) => mode.value === row.mode)?.label}
                {row.reference ? (
                  <span className="block text-xs text-muted-foreground">{row.reference}</span>
                ) : null}
              </span>
            ),
          },
          { key: "amount", header: "Amount", numeric: true, cell: (row) => money(row.amount) },
          { key: "tds", header: "TDS", numeric: true, cell: (row) => money(row.tdsDeducted) },
          {
            key: "by",
            header: "Recorded by",
            cell: (row) => (
              <span>
                {row.recordedByName}
                {row.voided ? (
                  <span className="block text-xs">
                    <Badge variant="muted">Voided</Badge> {row.voidReason}
                  </span>
                ) : null}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
