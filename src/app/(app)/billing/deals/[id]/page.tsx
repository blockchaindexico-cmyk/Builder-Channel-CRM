import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { DealStatusBadge } from "@/modules/billing/components/badges";
import { DealStatusActions } from "@/modules/billing/components/deal-actions";
import { DealEditor } from "@/modules/billing/components/deal-editor";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { getDealFinancial } from "@/modules/billing/server/financials";
import { getRegionalSettings } from "@/modules/organization";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Deal financials" };

const FIELD_LABELS: Record<string, string> = {
  agreementValue: "Agreement value",
  grossCommission: "Commission",
  commissionBasis: "Basis",
  taxRate: "GST rate",
  tdsRate: "TDS rate",
  cashback: "Cashback",
  subBrokerPayout: "Sub-broker payout",
  executiveIncentive: "Incentive",
  otherExpenses: "Other expenses",
};

const CHANGE_LABELS = {
  CREATED: "Created from the closed booking",
  RECALCULATED: "Recalculated",
  UPDATED: "Edited",
  CONFIRMED: "Confirmed",
  UNLOCKED: "Unlocked",
  CANCELLED: "Cancelled",
} as const;

/** One deal's financials (M09-06): figures, editor while draft, confirm/unlock and history. */
export default async function DealPage({ params }: PageProps<"/billing/deals/[id]">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, BILLING_PERMISSIONS.financeView);
  const id = routeId((await params).id);
  const [deal, regional] = await Promise.all([
    loadOrNotFound(getDealFinancial(ctx, id)),
    getRegionalSettings(ctx),
  ]);
  const money = (value: string) => formatMoney(value, regional);
  const canManage = ctx.permissions.has(BILLING_PERMISSIONS.financeManage);
  const billed = Boolean(deal.invoice && deal.invoice.status !== "DRAFT");
  const rows: [string, React.ReactNode][] = [
    ["Agreement value", money(deal.agreementValue)],
    [
      "Gross commission",
      <span key="gross">
        {money(deal.grossCommission)}
        <span className="block text-xs text-muted-foreground">{deal.commissionBasis}</span>
      </span>,
    ],
    [`GST (${Number(deal.taxRate)}%)`, money(deal.taxAmount)],
    [`TDS (${Number(deal.tdsRate)}%)`, money(deal.tdsAmount)],
    ["Cashback", money(deal.cashback)],
    ["Net revenue", <strong key="rev">{money(deal.netRevenue)}</strong>],
    [
      `Sub-broker payout${deal.subBrokerName ? ` (${deal.subBrokerName})` : ""}`,
      money(deal.subBrokerPayout),
    ],
    ["Executive incentive", money(deal.executiveIncentive)],
    ["Other expenses", money(deal.otherExpenses)],
    ["Net profit", <strong key="profit">{money(deal.netProfit)}</strong>],
  ];
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {deal.booking.number} · {deal.booking.customerName}
            <DealStatusBadge status={deal.status} />
          </span>
        }
        description={`${deal.project.name} (${deal.builder.name}) · closed ${formatCalendarDate(deal.recognizedOn, regional)} · ${deal.executiveName}${deal.managerName ? ` / ${deal.managerName}` : ""}`}
        breadcrumbs={[
          { label: "Deal financials", href: "/billing/deals" },
          { label: deal.booking.number },
        ]}
        actions={
          canManage ? (
            <DealStatusActions dealId={deal.id} status={deal.status} billed={billed} />
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Figures</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y text-sm">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link
                  href={`/bookings/${deal.booking.id}`}
                  className="text-primary hover:underline"
                >
                  Open the booking
                </Link>
                <Link href={`/leads/${deal.lead.id}`} className="text-primary hover:underline">
                  Lead {deal.lead.number}
                </Link>
                {deal.invoice ? (
                  <Link
                    href={`/billing/invoices/${deal.invoice.id}`}
                    className="text-primary hover:underline"
                  >
                    Invoice {deal.invoice.number ?? "(draft)"}
                  </Link>
                ) : null}
              </div>
              {deal.status === "CONFIRMED" && deal.confirmedAt ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Confirmed by {deal.confirmedByName} on{" "}
                  {formatDateTime(deal.confirmedAt, regional)}.
                </p>
              ) : null}
              {deal.notes ? <p className="mt-3 text-sm whitespace-pre-line">{deal.notes}</p> : null}
            </CardContent>
          </Card>
          {deal.status !== "DRAFT" && deal.expenses.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Other expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {deal.expenses.map((expense) => (
                    <li key={expense.id} className="flex justify-between py-2">
                      <span>{expense.label}</span>
                      <span className="tabular-nums">{money(expense.amount)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
          {canManage && deal.status === "DRAFT" ? <DealEditor deal={deal} /> : null}
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 text-sm">
                {deal.history.map((entry) => (
                  <li key={entry.id} className="border-l-2 pl-3">
                    <p className="font-medium">{CHANGE_LABELS[entry.type]}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.actorName} · {formatDateTime(entry.occurredAt, regional)}
                    </p>
                    {entry.changes.length ? (
                      <ul className="mt-1 text-muted-foreground">
                        {entry.changes.map((change) => (
                          <li key={change.field}>
                            {FIELD_LABELS[change.field] ?? change.field}: {change.from ?? "—"} →{" "}
                            {change.to ?? "—"}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {entry.reason ? <p className="mt-1">“{entry.reason}”</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
