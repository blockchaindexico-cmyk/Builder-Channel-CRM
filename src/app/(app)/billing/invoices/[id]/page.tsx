import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { InvoiceStatusBadge } from "@/modules/billing/components/badges";
import {
  CancelInvoiceButton,
  DiscardDraftButton,
  DownloadPdfButton,
  IssueInvoiceDialog,
  RecordPaymentDialog,
  SendInvoiceDialog,
  VoidPaymentButton,
} from "@/modules/billing/components/invoice-actions";
import { InvoiceDocument } from "@/modules/billing/components/invoice-document";
import { InvoiceForm } from "@/modules/billing/components/invoice-form";
import { OPEN_INVOICE_STATUSES, PAYMENT_MODES } from "@/modules/billing/constants";
import { dec, percentOf, toMoney } from "@/modules/billing/money";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { getInvoice } from "@/modules/billing/server/invoices";
import { resolvePeriod } from "@/modules/billing/server/period";
import { getBillingSettings } from "@/modules/billing/server/settings";
import { listBuilderOptions } from "@/modules/catalog";
import { getRegionalSettings } from "@/modules/organization";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Invoice" };

/** One invoice (M09-07, M09-09): the draft editor, or the issued invoice with its payments. */
export default async function InvoicePage({ params }: PageProps<"/billing/invoices/[id]">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, BILLING_PERMISSIONS.billingView);
  const id = routeId((await params).id);
  const regional = await getRegionalSettings(ctx);
  const { today } = resolvePeriod(regional, {});
  const [invoice, settings] = await Promise.all([
    loadOrNotFound(getInvoice(ctx, id, today)),
    getBillingSettings(ctx.db, ctx),
  ]);
  const canManage = ctx.permissions.has(BILLING_PERMISSIONS.billingManage);
  const money = (value: string) => formatMoney(value, regional);
  const title = invoice.number ?? "Draft invoice";
  const open = (OPEN_INVOICE_STATUSES as readonly string[]).includes(invoice.status);

  if (invoice.status === "DRAFT" && canManage) {
    const builders = await listBuilderOptions(ctx, { includeInactive: true });
    return (
      <>
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              {title} <InvoiceStatusBadge status="DRAFT" />
            </span>
          }
          description={`${invoice.builder.name} · created by ${invoice.createdByName}`}
          breadcrumbs={[{ label: "Invoices", href: "/billing/invoices" }, { label: title }]}
          actions={
            <div className="flex flex-wrap gap-2">
              <DiscardDraftButton invoiceId={invoice.id} />
              <IssueInvoiceDialog
                invoiceId={invoice.id}
                today={today}
                termsDays={settings.paymentTermsDays}
              />
            </div>
          }
        />
        <InvoiceForm
          builders={builders.map((builder) => ({ id: builder.id, label: builder.name }))}
          tax={{
            rate: settings.taxRate,
            split: settings.splitTax,
            splitLabels: settings.splitTaxLabels,
            singleLabel: settings.singleTaxLabel,
          }}
          initial={{
            invoiceId: invoice.id,
            builderId: invoice.builder.id,
            dealIds: invoice.lines.flatMap((line) => (line.dealId ? [line.dealId] : [])),
            manualLines: invoice.lines
              .filter((line) => !line.dealId)
              .map((line) => ({ description: line.description, amount: line.amount })),
            intraState: invoice.intraState,
            notes: invoice.notes ?? "",
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {title} <InvoiceStatusBadge status={invoice.status} overdue={invoice.overdue} />
          </span>
        }
        description={`${invoice.builder.name}${invoice.issuedByName ? ` · issued by ${invoice.issuedByName}` : ""}`}
        breadcrumbs={[{ label: "Invoices", href: "/billing/invoices" }, { label: title }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <DownloadPdfButton invoiceId={invoice.id} />
            {canManage && invoice.status !== "CANCELLED" && invoice.number ? (
              <>
                <SendInvoiceDialog
                  invoiceId={invoice.id}
                  number={invoice.number}
                  defaultTo={invoice.builderEmail}
                  sentTo={invoice.sentTo}
                />
                <CancelInvoiceButton invoiceId={invoice.id} number={invoice.number} />
              </>
            ) : null}
            {canManage && open ? (
              <RecordPaymentDialog
                invoiceId={invoice.id}
                balance={invoice.balance}
                suggestedTds={toMoney(percentOf(invoice.subtotal, settings.tdsRate))}
                today={today}
              />
            ) : null}
          </div>
        }
      />
      {invoice.sentAt ? (
        <p className="mb-4 text-sm text-muted-foreground">
          E-mailed to {invoice.sentTo} on {formatDateTime(invoice.sentAt, regional)}.
        </p>
      ) : null}
      {invoice.status === "CANCELLED" ? (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Cancelled
          {invoice.cancelledAt ? ` on ${formatDateTime(invoice.cancelledAt, regional)}` : ""}:{" "}
          {invoice.cancelReason}
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <InvoiceDocument invoice={invoice} regional={regional} terms={settings.terms} />
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Settlement</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="tabular-nums">{money(invoice.total)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Received</dt>
                  <dd className="tabular-nums">
                    {money(toMoney(dec(invoice.amountSettled).minus(dec(invoice.tdsDeducted))))}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">TDS deducted</dt>
                  <dd className="tabular-nums">{money(invoice.tdsDeducted)}</dd>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <dt>Balance</dt>
                  <dd className="tabular-nums">{money(invoice.balance)}</dd>
                </div>
              </dl>
              {invoice.lines.some((line) => line.dealId) ? (
                <div className="mt-4 text-sm">
                  <p className="mb-1 text-muted-foreground">Deals billed</p>
                  <ul className="space-y-1">
                    {invoice.lines
                      .filter((line) => line.dealId)
                      .map((line) => (
                        <li key={line.id}>
                          <Link
                            href={`/billing/deals/${line.dealId}`}
                            className="text-primary hover:underline"
                          >
                            {line.description.replace(/^Brokerage — /, "")}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Received</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">TDS</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.payments.map((payment) => (
                      <TableRow
                        key={payment.id}
                        className={payment.voidedAt ? "opacity-60" : undefined}
                      >
                        <TableCell>
                          <span className="block whitespace-nowrap">
                            {formatCalendarDate(payment.receivedOn, regional)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {PAYMENT_MODES.find((mode) => mode.value === payment.mode)?.label}
                            {payment.reference ? ` · ${payment.reference}` : ""}
                          </span>
                          {payment.voidedAt ? (
                            <span className="block text-xs">
                              <Badge variant="muted">Voided</Badge> {payment.voidReason}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(payment.amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(payment.tdsDeducted)}
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && !payment.voidedAt ? (
                            <VoidPaymentButton
                              paymentId={payment.id}
                              label={`the payment of ${money(payment.amount)}`}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
