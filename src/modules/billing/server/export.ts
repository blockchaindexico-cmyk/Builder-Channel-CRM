import { TZDate } from "@date-fns/tz";
import { format as formatDate } from "date-fns";

import type { TableQuery } from "@/lib/table-query";
import { plural } from "@/lib/utils";
import { getRegionalSettings } from "@/modules/organization";
import { recordAudit } from "@/platform/audit";
import { ValidationError } from "@/platform/errors";
import {
  CSV_TYPE,
  writeCsv,
  writeXlsx,
  XLSX_TYPE,
  type XlsxColumn,
} from "@/platform/export/spreadsheet";
import type { ServiceContext } from "@/platform/tenant/context";

import {
  DEAL_FINANCIAL_STATUSES,
  EXPENSE_CATEGORIES,
  INVOICE_STATUSES,
  PAYMENT_MODES,
} from "../constants";
import { listBusinessExpenses } from "./expenses";
import { type DealFilters, listDealFinancials } from "./financials";
import { type InvoiceFilters, listInvoices } from "./invoices";
import {
  getProfitAndLoss,
  listPayments,
  type Period,
  PL_DIMENSIONS,
  type PlDimension,
} from "./reports";

/** CSV/XLSX downloads of the billing registers and the P&L (M09-14). Generated on request, never stored. */
export const BILLING_REGISTERS = [
  "deals",
  "invoices",
  "payments",
  "expenses",
  "profit-loss",
] as const;
export type BillingRegister = (typeof BILLING_REGISTERS)[number];

export interface RegisterExportInput {
  register: string;
  format: string;
  from?: string | null;
  to?: string | null;
  status?: string | null;
  builderId?: string | null;
  projectId?: string | null;
  executiveId?: string | null;
  managerId?: string | null;
  category?: string | null;
  dimension?: string | null;
}

type Cell = string | number | null;
const MONEY = "#,##0.00";
const money = (header: string): XlsxColumn => ({ header, numFmt: MONEY, width: 16 });
const text = (header: string, width?: number): XlsxColumn => ({ header, width });
const label = (list: { value: string; label: string }[], value: string) =>
  list.find((item) => item.value === value)?.label ?? value;
const EVERYTHING: TableQuery = {
  page: 1,
  pageSize: 10_000,
  skip: 0,
  take: 10_000,
  sort: null,
  q: "",
};
const iso = /^\d{4}-\d{2}-\d{2}$/;

export async function exportBillingRegister(ctx: ServiceContext, input: RegisterExportInput) {
  const register = BILLING_REGISTERS.find((value) => value === input.register);
  if (!register) throw new ValidationError("Unknown register.");
  const fileType = input.format === "xlsx" ? "xlsx" : "csv";
  const regional = await getRegionalSettings(ctx);
  const today = formatDate(new TZDate(new Date(), regional.timezone), "yyyy-MM-dd");
  const from = input.from && iso.test(input.from) ? input.from : null;
  const to = input.to && iso.test(input.to) ? input.to : null;
  const period: Period = { from: from ?? "2000-01-01", to: to ?? today };
  const num = (value: string) => (fileType === "xlsx" ? Number(value) : value);

  let columns: XlsxColumn[];
  let rows: Cell[][];
  let sheet: string;
  if (register === "deals") {
    const filters: DealFilters = { ...input, from, to };
    const { rows: deals } = await listDealFinancials(ctx, EVERYTHING, filters);
    sheet = "Deals";
    columns = [
      text("Recognised on", 14),
      text("Booking"),
      text("Customer", 24),
      text("Lead"),
      text("Builder", 24),
      text("Project", 24),
      text("Unit"),
      text("Executive", 20),
      text("Manager", 20),
      money("Agreement value"),
      text("Commission basis", 28),
      money("Gross commission"),
      money("GST"),
      money("TDS"),
      money("Cashback"),
      money("Sub-broker payout"),
      text("Sub-broker"),
      money("Executive incentive"),
      money("Other expenses"),
      money("Net revenue"),
      money("Net profit"),
      text("Status"),
      text("Invoice"),
    ];
    rows = deals.map((deal) => [
      deal.recognizedOn,
      deal.booking.number,
      deal.booking.customerName,
      deal.lead.number,
      deal.builder.name,
      deal.project.name,
      deal.booking.unit,
      deal.executiveName,
      deal.managerName,
      num(deal.agreementValue),
      deal.commissionBasis,
      num(deal.grossCommission),
      num(deal.taxAmount),
      num(deal.tdsAmount),
      num(deal.cashback),
      num(deal.subBrokerPayout),
      deal.subBrokerName,
      num(deal.executiveIncentive),
      num(deal.otherExpenses),
      num(deal.netRevenue),
      num(deal.netProfit),
      label(DEAL_FINANCIAL_STATUSES, deal.status),
      deal.invoice?.number ?? (deal.invoice ? "Draft" : ""),
    ]);
  } else if (register === "invoices") {
    const filters: InvoiceFilters = { ...input, from, to, today };
    const { rows: invoices } = await listInvoices(ctx, EVERYTHING, filters);
    sheet = "Invoices";
    columns = [
      text("Invoice"),
      text("Status"),
      text("Builder", 28),
      text("Issued on", 12),
      text("Due on", 12),
      money("Taxable value"),
      money("Tax"),
      money("Total"),
      money("Received"),
      money("TDS deducted"),
      money("Balance"),
      text("Overdue"),
    ];
    rows = invoices.map((invoice) => [
      invoice.number ?? "Draft",
      label(INVOICE_STATUSES, invoice.status),
      invoice.builder.name,
      invoice.issueDate,
      invoice.dueDate,
      num(invoice.subtotal),
      num(invoice.taxTotal),
      num(invoice.total),
      num(invoice.amountSettled),
      num(invoice.tdsDeducted),
      num(invoice.balance),
      invoice.overdue ? "Yes" : "",
    ]);
  } else if (register === "payments") {
    const { rows: payments } = await listPayments(ctx, { period, builderId: input.builderId });
    sheet = "Collections";
    columns = [
      text("Received on", 12),
      text("Invoice"),
      text("Builder", 28),
      money("Amount"),
      money("TDS deducted"),
      text("Mode"),
      text("Reference", 20),
      text("Recorded by", 20),
    ];
    rows = payments.map((payment) => [
      payment.receivedOn,
      payment.invoice.number,
      payment.builderName,
      num(payment.amount),
      num(payment.tdsDeducted),
      label(PAYMENT_MODES, payment.mode),
      payment.reference,
      payment.recordedByName,
    ]);
  } else if (register === "expenses") {
    const category =
      EXPENSE_CATEGORIES.find((item) => item.value === input.category)?.value ?? null;
    const { rows: expenses } = await listBusinessExpenses(ctx, { period, category });
    sheet = "Expenses";
    columns = [
      text("Spent on", 12),
      text("Category"),
      text("Description", 36),
      money("Amount"),
      text("Source"),
      text("Campaign"),
      text("Project"),
      text("Paid to", 20),
      text("Reference"),
    ];
    rows = expenses.map((expense) => [
      expense.spentOn,
      label(EXPENSE_CATEGORIES, expense.category),
      expense.description,
      num(expense.amount),
      expense.source?.name ?? "",
      expense.campaign?.name ?? "",
      expense.project?.name ?? "",
      expense.paidTo,
      expense.reference,
    ]);
  } else {
    const dimension: PlDimension =
      PL_DIMENSIONS.find((item) => item.value === input.dimension)?.value ?? "builder";
    const pl = await getProfitAndLoss(ctx, period, dimension, {
      builderId: input.builderId,
      projectId: input.projectId,
      executiveId: input.executiveId,
      managerId: input.managerId,
    });
    sheet = "Profit & loss";
    columns = [
      text(label([...PL_DIMENSIONS], dimension), 28),
      { header: "Deals", width: 8 },
      money("Agreement value"),
      money("Gross commission"),
      money("Cashback"),
      money("Net revenue"),
      money("Sub-broker payouts"),
      money("Incentives"),
      money("Other expenses"),
      money("Net profit"),
      text("Margin %"),
    ];
    rows = [...pl.rows, pl.total].map((row) => [
      row.label,
      row.deals,
      num(row.agreementValue),
      num(row.grossCommission),
      num(row.cashback),
      num(row.netRevenue),
      num(row.payouts),
      num(row.incentives),
      num(row.otherExpenses),
      num(row.netProfit),
      row.margin ?? "",
    ]);
    rows.push([], ["Business expenses"]);
    for (const expense of pl.businessExpenses) {
      rows.push([
        label(EXPENSE_CATEGORIES, expense.category),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        num(expense.amount),
      ]);
    }
    rows.push([
      "Organisation profit",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      num(pl.organizationProfit),
    ]);
  }

  const stamp = formatDate(new TZDate(new Date(), regional.timezone), "yyyy-MM-dd-HHmm");
  const fileName = `${register}-${stamp}.${fileType}`;
  const body =
    fileType === "csv"
      ? writeCsv(
          columns.map((column) => column.header),
          rows,
        )
      : await writeXlsx(sheet, columns, rows);
  await recordAudit(ctx.db, ctx, {
    action: "billing.export",
    entityType: "Billing",
    summary: `Exported the ${register.replace("-", " & ")} register (${plural(rows.length, "row")}, ${fileType.toUpperCase()})`,
    metadata: { register, format: fileType, from: period.from, to: period.to },
  });
  return {
    fileName,
    contentType: fileType === "csv" ? CSV_TYPE : XLSX_TYPE,
    body,
    count: rows.length,
  };
}
