import { formatCalendarDate, formatMoney } from "@/lib/format";
import type { RegionalSettings } from "@/modules/organization";

import type { InvoiceDetail } from "../server/invoices";

/** The invoice as the builder sees it (the PDF has the same content), from the details captured at issue. */
export function InvoiceDocument({
  invoice,
  regional,
  terms,
}: {
  invoice: InvoiceDetail;
  regional: RegionalSettings;
  terms: string;
}) {
  const money = (value: string) => formatMoney(value, regional);
  const { seller, billTo } = invoice;
  return (
    <article className="rounded-lg border bg-card p-6 text-sm" aria-label="Invoice">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-4">
        <div>
          <p className="text-lg font-semibold">{seller?.name ?? "Your organization"}</p>
          {seller?.address ? <p className="text-muted-foreground">{seller.address}</p> : null}
          {seller?.taxId ? (
            <p>
              {seller.taxLabel}: {seller.taxId}
            </p>
          ) : null}
          {seller?.secondaryId ? (
            <p>
              {seller.secondaryLabel}: {seller.secondaryId}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tracking-wide uppercase">Tax invoice</p>
          <p className="font-mono">{invoice.number ?? "DRAFT"}</p>
          {invoice.issueDate ? (
            <p>Date: {formatCalendarDate(invoice.issueDate, regional)}</p>
          ) : null}
          {invoice.dueDate ? <p>Due: {formatCalendarDate(invoice.dueDate, regional)}</p> : null}
        </div>
      </header>
      <section className="border-b py-4">
        <p className="text-xs text-muted-foreground uppercase">Bill to</p>
        <p className="font-medium">{billTo?.name ?? invoice.builder.name}</p>
        {billTo?.address ? <p className="text-muted-foreground">{billTo.address}</p> : null}
        {billTo?.taxId ? (
          <p>
            {billTo.taxLabel}: {billTo.taxId}
          </p>
        ) : null}
      </section>
      <table className="w-full">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium">#</th>
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 font-medium">SAC</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line, index) => (
            <tr key={line.id} className="border-b align-top">
              <td className="py-2 pr-2">{index + 1}</td>
              <td className="py-2 pr-2">{line.description}</td>
              <td className="py-2 pr-2">{line.serviceCode}</td>
              <td className="py-2 text-right tabular-nums">{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="pt-3 pr-4 text-right text-muted-foreground">
              Taxable value
            </td>
            <td className="pt-3 text-right tabular-nums">{money(invoice.subtotal)}</td>
          </tr>
          {invoice.taxLines.map((line) => (
            <tr key={line.label}>
              <td colSpan={3} className="pr-4 text-right text-muted-foreground">
                {line.label} @ {line.rate}%
              </td>
              <td className="text-right tabular-nums">{money(line.amount)}</td>
            </tr>
          ))}
          <tr className="text-base font-semibold">
            <td colSpan={3} className="pt-2 pr-4 text-right">
              Total
            </td>
            <td className="pt-2 text-right tabular-nums">{money(invoice.total)}</td>
          </tr>
        </tfoot>
      </table>
      {invoice.notes ? <p className="mt-4 whitespace-pre-line">{invoice.notes}</p> : null}
      {seller?.bank?.accountNumber ? (
        <section className="mt-4 border-t pt-4">
          <p className="text-xs text-muted-foreground uppercase">Bank details</p>
          <p>
            {seller.bank.accountName} · {seller.bank.name}
            {seller.bank.branch ? `, ${seller.bank.branch}` : ""}
          </p>
          <p>
            A/c {seller.bank.accountNumber}
            {seller.bank.code ? ` · IFSC ${seller.bank.code}` : ""}
          </p>
        </section>
      ) : null}
      {terms ? <p className="mt-4 text-xs text-muted-foreground">{terms}</p> : null}
    </article>
  );
}
