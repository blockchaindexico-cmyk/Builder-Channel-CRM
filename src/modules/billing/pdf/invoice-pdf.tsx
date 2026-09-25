import "server-only";

import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatCalendarDate } from "@/lib/format";
import type { RegionalSettings } from "@/modules/organization";

import type { InvoiceDetail } from "../server/invoices";
import { amountInWords } from "../words";

/**
 * The invoice PDF (M09-08). The standard PDF fonts have no rupee sign, so amounts carry the currency code
 * ("INR 2,95,000.00"); the total is also written in words for rupee invoices.
 */
const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#111827", lineHeight: 1.35 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingBottom: 10,
    marginBottom: 10,
  },
  seller: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    lineHeight: 1.2,
    marginBottom: 4,
  },
  muted: { color: "#6b7280" },
  label: { fontSize: 7.5, color: "#6b7280", textTransform: "uppercase", marginBottom: 2 },
  section: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 8,
    marginBottom: 8,
  },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#9ca3af",
    paddingVertical: 4,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 5,
  },
  cellNo: { width: 20 },
  cellDescription: { flex: 1, paddingRight: 8 },
  cellCode: { width: 50 },
  cellAmount: { width: 95, textAlign: "right" },
  totals: { marginTop: 8, marginLeft: "auto", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#111827",
    marginTop: 4,
    paddingTop: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  words: { marginTop: 8, fontFamily: "Helvetica-Oblique" },
  footer: { marginTop: 16, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 8 },
  watermark: {
    position: "absolute",
    top: 330,
    left: 90,
    fontSize: 72,
    color: "#dc2626",
    opacity: 0.15,
    transform: "rotate(-30deg)",
    fontFamily: "Helvetica-Bold",
  },
});

function moneyFormatter(regional: Pick<RegionalSettings, "currency" | "locale">) {
  const number = new Intl.NumberFormat(regional.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (value: string) => `${regional.currency} ${number.format(Number(value))}`;
}

export function InvoicePdf({
  invoice,
  regional,
  terms,
}: {
  invoice: InvoiceDetail;
  regional: RegionalSettings;
  terms: string;
}) {
  const money = moneyFormatter(regional);
  const { seller, billTo } = invoice;
  const watermark =
    invoice.status === "CANCELLED" ? "CANCELLED" : invoice.status === "DRAFT" ? "DRAFT" : null;
  return (
    <Document title={`Invoice ${invoice.number ?? "draft"}`} author={seller?.name ?? undefined}>
      <Page size="A4" style={styles.page}>
        {watermark ? (
          <Text style={styles.watermark} fixed>
            {watermark}
          </Text>
        ) : null}
        <View style={[styles.row, styles.header]}>
          <View style={{ maxWidth: 300 }}>
            <Text style={styles.seller}>{seller?.name ?? invoice.builder.name}</Text>
            {seller?.address ? <Text style={styles.muted}>{seller.address}</Text> : null}
            {seller?.taxId ? <Text>{`${seller.taxLabel}: ${seller.taxId}`}</Text> : null}
            {seller?.secondaryId ? (
              <Text>{`${seller.secondaryLabel}: ${seller.secondaryId}`}</Text>
            ) : null}
            {seller?.email || seller?.phone ? (
              <Text style={styles.muted}>
                {[seller.email, seller.phone].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.title}>TAX INVOICE</Text>
            <Text style={{ textAlign: "right" }}>{invoice.number ?? "Draft"}</Text>
            {invoice.issueDate ? (
              <Text
                style={{ textAlign: "right" }}
              >{`Date: ${formatCalendarDate(invoice.issueDate, regional)}`}</Text>
            ) : null}
            {invoice.dueDate ? (
              <Text
                style={{ textAlign: "right" }}
              >{`Due: ${formatCalendarDate(invoice.dueDate, regional)}`}</Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.row, styles.section]}>
          <View style={{ maxWidth: 300 }}>
            <Text style={styles.label}>Bill to</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {billTo?.name ?? invoice.builder.name}
            </Text>
            {billTo?.address ? <Text style={styles.muted}>{billTo.address}</Text> : null}
            {billTo?.taxId ? <Text>{`${billTo.taxLabel}: ${billTo.taxId}`}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.label}>Place of supply</Text>
            <Text>{billTo?.state || seller?.state || "—"}</Text>
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={styles.cellNo}>#</Text>
          <Text style={styles.cellDescription}>Description</Text>
          <Text style={styles.cellCode}>SAC</Text>
          <Text style={styles.cellAmount}>Amount</Text>
        </View>
        {invoice.lines.map((line, index) => (
          <View key={line.id} style={styles.tableRow} wrap={false}>
            <Text style={styles.cellNo}>{index + 1}</Text>
            <Text style={styles.cellDescription}>{line.description}</Text>
            <Text style={styles.cellCode}>{line.serviceCode ?? ""}</Text>
            <Text style={styles.cellAmount}>{money(line.amount)}</Text>
          </View>
        ))}

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Taxable value</Text>
            <Text>{money(invoice.subtotal)}</Text>
          </View>
          {invoice.taxLines.map((line) => (
            <View key={line.label} style={styles.totalRow}>
              <Text style={styles.muted}>{`${line.label} @ ${line.rate}%`}</Text>
              <Text>{money(line.amount)}</Text>
            </View>
          ))}
          <View style={styles.grandTotal}>
            <Text>Total</Text>
            <Text>{money(invoice.total)}</Text>
          </View>
        </View>
        {regional.currency === "INR" ? (
          <Text style={styles.words}>{amountInWords(invoice.total)}</Text>
        ) : null}
        {invoice.notes ? <Text style={{ marginTop: 10 }}>{invoice.notes}</Text> : null}

        <View style={styles.footer} wrap={false}>
          {seller?.bank?.accountNumber ? (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.label}>Bank details</Text>
              <Text>{`${seller.bank.accountName} · ${seller.bank.name}${seller.bank.branch ? `, ${seller.bank.branch}` : ""}`}</Text>
              <Text>{`A/c ${seller.bank.accountNumber}${seller.bank.code ? ` · IFSC ${seller.bank.code}` : ""}`}</Text>
            </View>
          ) : null}
          {terms ? <Text style={styles.muted}>{terms}</Text> : null}
          <Text style={[styles.muted, { marginTop: 18, textAlign: "right" }]}>
            {`For ${seller?.name ?? ""}`}
          </Text>
          <Text style={[styles.muted, { marginTop: 24, textAlign: "right" }]}>
            Authorised signatory
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(props: {
  invoice: InvoiceDetail;
  regional: RegionalSettings;
  terms: string;
}): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<InvoicePdf {...props} />);
  return new Uint8Array(buffer);
}
