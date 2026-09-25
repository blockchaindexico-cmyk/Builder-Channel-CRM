import type { InvoiceStatus, Prisma } from "@/generated/prisma/client";
import { formatMoney, toCalendarDateString } from "@/lib/format";
import type { TableQuery } from "@/lib/table-query";
import { getRegionalSettings } from "@/modules/organization";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import { nextSequenceNumber } from "@/platform/sequences";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput, uuidOrNull } from "@/platform/validation";

import { OPEN_INVOICE_STATUSES } from "../constants";
import { fiscalYearOf } from "../fiscal";
import { dec, sum, toMoney } from "../money";
import { BILLING_PERMISSIONS } from "../permissions";
import {
  cancelInvoiceSchema,
  type InvoiceDraftInput,
  invoiceDraftSchema,
  issueInvoiceSchema,
  type PaymentInput,
  paymentSchema,
  voidPaymentSchema,
} from "../schemas";
import { type BillingSettings } from "../schemas";
import { computeTaxLines, statusAfterPayments, type TaxLine } from "../tax";
import { confirmDealInTx } from "./financials";
import { getBillingSettings } from "./settings";

/**
 * Invoices to builders for closed deals (M09-07, M09-09). Drafts carry no number; issuing numbers the invoice per
 * fiscal year (INV/2026-27/0001), captures seller and buyer details, and confirms the deals on it. Issued invoices are
 * cancelled, never deleted; payments (with TDS) move them to partly paid and paid, and are voided with a reason.
 */

const normalizeState = (state: string | null | undefined) => (state ?? "").trim().toLowerCase();

export interface InvoiceParty {
  name: string;
  address: string;
  taxLabel: string;
  taxId: string;
  secondaryLabel?: string;
  secondaryId?: string;
  state: string;
  email?: string;
  phone?: string;
  bank?: { name: string; accountName: string; accountNumber: string; code: string; branch: string };
}

function sellerOf(settings: BillingSettings, organizationName: string): InvoiceParty {
  return {
    name: settings.legalName || organizationName,
    address: [settings.addressLine, settings.city, settings.state, settings.postalCode]
      .filter(Boolean)
      .join(", "),
    taxLabel: settings.taxRegistrationLabel,
    taxId: settings.taxRegistrationId,
    secondaryLabel: settings.secondaryIdLabel,
    secondaryId: settings.secondaryId,
    state: settings.state,
    email: settings.email,
    phone: settings.phone,
    bank: {
      name: settings.bankName,
      accountName: settings.bankAccountName,
      accountNumber: settings.bankAccountNumber,
      code: settings.bankCode,
      branch: settings.bankBranch,
    },
  };
}

async function billToOf(
  db: TenantDbOrTx,
  builderId: string,
  taxLabel: string,
): Promise<InvoiceParty> {
  const builder = await db.builder.findFirst({ where: { id: builderId } });
  if (!builder) throw new NotFoundError("Builder", builderId);
  return {
    name: builder.legalName || builder.name,
    address: [builder.addressLine, builder.city, builder.state, builder.postalCode]
      .filter(Boolean)
      .join(", "),
    taxLabel,
    taxId: builder.taxId ?? "",
    state: builder.state ?? "",
    email: builder.email ?? "",
  };
}

const taxSetup = (settings: BillingSettings) => ({
  rate: settings.taxRate,
  split: settings.splitTax,
  splitLabels: settings.splitTaxLabels as [string, string],
  singleLabel: settings.singleTaxLabel,
});

function totalsOf(amounts: string[], settings: BillingSettings, intraState: boolean) {
  const subtotal = toMoney(sum(amounts));
  const taxLines = computeTaxLines(subtotal, taxSetup(settings), intraState);
  const taxTotal = toMoney(sum(taxLines.map((line) => line.amount)));
  return { subtotal, taxLines, taxTotal, total: toMoney(dec(subtotal).plus(dec(taxTotal))) };
}

/**
 * Deals of a builder that can be billed: not cancelled, with a commission, on no invoice other than `invoiceId` (the
 * draft being edited) unless that one was cancelled.
 */
export async function listBillableDeals(
  ctx: ServiceContext,
  builderId: string,
  invoiceId: string | null = null,
) {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingView);
  const deals = await ctx.db.dealFinancial.findMany({
    where: {
      builderId,
      status: { not: "CANCELLED" },
      grossCommission: { gt: 0 },
      invoiceLines: {
        none: {
          invoice: { status: { not: "CANCELLED" } },
          ...(invoiceId ? { invoiceId: { not: invoiceId } } : {}),
        },
      },
    },
    include: {
      booking: { select: { number: true, customerName: true, tower: true, unitNumber: true } },
      project: { select: { name: true } },
    },
    orderBy: { recognizedOn: "asc" },
  });
  return deals.map((deal) => ({
    id: deal.id,
    status: deal.status,
    recognizedOn: toCalendarDateString(deal.recognizedOn)!,
    bookingNumber: deal.booking.number,
    customerName: deal.booking.customerName,
    projectName: deal.project.name,
    unit: [deal.booking.tower ? `T-${deal.booking.tower}` : null, deal.booking.unitNumber]
      .filter(Boolean)
      .join(" · "),
    agreementValue: deal.agreementValue.toString(),
    grossCommission: deal.grossCommission.toString(),
  }));
}

/** Line description of a deal: "Brokerage — BK-000045 · Priya Shah · Skyline Riverfront T-B 1203". */
async function dealLines(
  tx: TenantDbOrTx,
  builderId: string,
  dealIds: string[],
  serviceCode: string,
  invoiceId: string | null,
) {
  if (dealIds.length === 0) return [];
  const deals = await tx.dealFinancial.findMany({
    where: { id: { in: dealIds } },
    include: {
      booking: { select: { number: true, customerName: true, tower: true, unitNumber: true } },
      project: { select: { name: true } },
      invoiceLines: {
        where: {
          invoice: { status: { not: "CANCELLED" } },
          ...(invoiceId ? { invoiceId: { not: invoiceId } } : {}),
        },
        select: { invoice: { select: { number: true } } },
      },
    },
  });
  if (deals.length !== new Set(dealIds).size) {
    throw new ValidationError("Some deals were not found.", { dealIds: ["Unknown deal"] });
  }
  return deals.map((deal) => {
    if (deal.builderId !== builderId) {
      throw new ValidationError(`Booking ${deal.booking.number} is not with this builder.`, {
        dealIds: ["Another builder's deal"],
      });
    }
    if (deal.status === "CANCELLED") {
      throw new ConflictError(`Booking ${deal.booking.number} was cancelled.`);
    }
    if (deal.invoiceLines.length) {
      throw new ConflictError(
        `Booking ${deal.booking.number} is already on invoice ${deal.invoiceLines[0]!.invoice.number ?? "(draft)"}.`,
      );
    }
    const unit = [deal.booking.tower ? `T-${deal.booking.tower}` : null, deal.booking.unitNumber]
      .filter(Boolean)
      .join(" ");
    return {
      dealFinancialId: deal.id,
      description: `Brokerage — ${deal.booking.number} · ${deal.booking.customerName} · ${deal.project.name}${unit ? ` ${unit}` : ""}`,
      serviceCode: serviceCode || null,
      amount: deal.grossCommission.toString(),
    };
  });
}

async function writeDraftLines(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  invoiceId: string,
  values: ReturnType<typeof parseDraft>,
  settings: BillingSettings,
) {
  const deals = await dealLines(
    tx,
    values.builderId,
    values.dealIds,
    settings.serviceCode,
    invoiceId,
  );
  const manual = values.manualLines.map((line) => ({
    dealFinancialId: null,
    description: line.description,
    serviceCode: settings.serviceCode || null,
    amount: toMoney(line.amount),
  }));
  const lines = [...deals, ...manual];
  if (lines.length === 0) {
    throw new ValidationError("Add at least one deal or line.", { dealIds: ["Nothing to bill"] });
  }
  await tx.invoiceLine.deleteMany({ where: { invoiceId } });
  await tx.invoiceLine.createMany({
    data: lines.map((line, index) => ({
      organizationId: ctx.organizationId,
      invoiceId,
      ...line,
      sortOrder: index,
    })),
  });
  const totals = totalsOf(
    lines.map((line) => line.amount),
    settings,
    values.intraState,
  );
  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      intraState: values.intraState,
      notes: values.notes ?? null,
      subtotal: totals.subtotal,
      taxLines: totals.taxLines as unknown as Prisma.InputJsonValue,
      taxTotal: totals.taxTotal,
      total: totals.total,
      balance: totals.total,
    },
  });
  return totals;
}

const parseDraft = (input: InvoiceDraftInput) => parseInput(invoiceDraftSchema, input);

/** Whether the builder is in the organization's state (tax split), from their saved addresses. */
export async function suggestIntraState(ctx: ServiceContext, builderId: string): Promise<boolean> {
  const [settings, builder] = await Promise.all([
    getBillingSettings(ctx.db, ctx),
    ctx.db.builder.findFirst({ where: { id: builderId }, select: { state: true } }),
  ]);
  if (!settings.state || !builder?.state) return true;
  return normalizeState(settings.state) === normalizeState(builder.state);
}

export async function createInvoiceDraft(
  ctx: ServiceContext,
  input: InvoiceDraftInput,
): Promise<{ id: string }> {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingManage);
  const values = parseDraft(input);
  return ctx.db.$transaction(async (tx) => {
    const settings = await getBillingSettings(tx, ctx);
    const builder = await tx.builder.findFirst({
      where: { id: values.builderId },
      select: { id: true },
    });
    if (!builder)
      throw new ValidationError("Choose the builder.", { builderId: ["Unknown builder"] });
    const invoice = await tx.invoice.create({
      data: {
        organizationId: ctx.organizationId,
        builderId: values.builderId,
        createdById: ctx.actor.membershipId ?? null,
        createdByName: ctx.actor.name,
      },
    });
    await writeDraftLines(tx, ctx, invoice.id, values, settings);
    await recordAudit(tx, ctx, {
      action: "billing.invoice.create",
      entityType: "Invoice",
      entityId: invoice.id,
      summary: "Created a draft invoice",
    });
    return { id: invoice.id };
  });
}

async function loadInvoice(tx: TenantDbOrTx, invoiceId: string) {
  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId } });
  if (!invoice) throw new NotFoundError("Invoice", invoiceId);
  return invoice;
}

export async function updateInvoiceDraft(
  ctx: ServiceContext,
  invoiceId: string,
  input: InvoiceDraftInput,
) {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingManage);
  const values = parseDraft(input);
  await ctx.db.$transaction(async (tx) => {
    const invoice = await loadInvoice(tx, invoiceId);
    if (invoice.status !== "DRAFT") throw new ConflictError("Only drafts can be changed.");
    if (invoice.builderId !== values.builderId) {
      throw new ValidationError("A draft stays with its builder.", { builderId: ["Fixed"] });
    }
    await writeDraftLines(tx, ctx, invoiceId, values, await getBillingSettings(tx, ctx));
    await recordAudit(tx, ctx, {
      action: "billing.invoice.update",
      entityType: "Invoice",
      entityId: invoiceId,
      summary: "Updated a draft invoice",
    });
  });
}

/** Drafts never got a number, so they can be discarded. */
export async function deleteInvoiceDraft(ctx: ServiceContext, invoiceId: string) {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingManage);
  await ctx.db.$transaction(async (tx) => {
    const invoice = await loadInvoice(tx, invoiceId);
    if (invoice.status !== "DRAFT") {
      throw new ConflictError("Issued invoices are cancelled, never deleted.");
    }
    await tx.invoice.delete({ where: { id: invoiceId } });
    await recordAudit(tx, ctx, {
      action: "billing.invoice.discard",
      entityType: "Invoice",
      entityId: invoiceId,
      summary: "Discarded a draft invoice",
    });
  });
}

/**
 * Issues a draft (M09-07): numbers it in its fiscal year, refreshes deal amounts, captures seller and buyer details,
 * sets the due date from the payment terms and confirms the deals billed.
 */
export async function issueInvoice(
  ctx: ServiceContext,
  input: { invoiceId: string; issueDate: string; dueDate?: string | null },
): Promise<{ number: string }> {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingManage);
  const values = parseInput(issueInvoiceSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const invoice = await loadInvoice(tx, values.invoiceId);
    if (invoice.status !== "DRAFT") throw new ConflictError("This invoice is issued already.");
    const settings = await getBillingSettings(tx, ctx);
    const lines = await tx.invoiceLine.findMany({
      where: { invoiceId: invoice.id },
      include: { dealFinancial: { select: { id: true, status: true, grossCommission: true } } },
      orderBy: { sortOrder: "asc" },
    });
    for (const line of lines) {
      if (line.dealFinancial?.status === "CANCELLED") {
        throw new ConflictError("A deal on this invoice was cancelled. Remove it first.");
      }
      if (line.dealFinancial && !dec(line.amount).equals(dec(line.dealFinancial.grossCommission))) {
        await tx.invoiceLine.update({
          where: { id: line.id },
          data: { amount: line.dealFinancial.grossCommission },
        });
        line.amount = line.dealFinancial.grossCommission;
      }
    }
    if (lines.length === 0) throw new ValidationError("The invoice has no lines.");
    const totals = totalsOf(
      lines.map((line) => line.amount.toString()),
      settings,
      invoice.intraState,
    );
    const fiscal = fiscalYearOf(values.issueDate, settings.fiscalYearStartMonth);
    const number = await nextSequenceNumber(
      tx,
      ctx,
      `invoice:${fiscal.label}`,
      `${settings.invoicePrefix}/${fiscal.label}`,
      { padding: settings.numberPadding, separator: "/" },
    );
    const due =
      values.dueDate ??
      toCalendarDateString(
        new Date(
          Date.parse(`${values.issueDate}T00:00:00Z`) + settings.paymentTermsDays * 86_400_000,
        ),
      )!;
    if (due < values.issueDate) {
      throw new ValidationError("The due date is before the invoice date.", {
        dueDate: ["Too early"],
      });
    }
    const organization = await tx.organization.findFirstOrThrow({ select: { name: true } });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "ISSUED",
        number,
        fiscalYear: fiscal.label,
        issueDate: new Date(`${values.issueDate}T00:00:00.000Z`),
        dueDate: new Date(`${due}T00:00:00.000Z`),
        seller: sellerOf(settings, organization.name) as unknown as Prisma.InputJsonValue,
        billTo: (await billToOf(
          tx,
          invoice.builderId,
          settings.taxRegistrationLabel,
        )) as unknown as Prisma.InputJsonValue,
        subtotal: totals.subtotal,
        taxLines: totals.taxLines as unknown as Prisma.InputJsonValue,
        taxTotal: totals.taxTotal,
        total: totals.total,
        amountSettled: 0,
        tdsDeducted: 0,
        balance: totals.total,
        issuedAt: new Date(),
        issuedByName: ctx.actor.name,
      },
    });
    for (const line of lines) {
      if (line.dealFinancial) {
        await confirmDealInTx(tx, ctx, line.dealFinancial, `Billed on invoice ${number}`);
      }
    }
    await recordAudit(tx, ctx, {
      action: "billing.invoice.issue",
      entityType: "Invoice",
      entityId: invoice.id,
      summary: `Issued invoice ${number} (${totals.total})`,
    });
    await publishEvent(tx, ctx, "invoice.issued", {
      invoiceId: invoice.id,
      number,
      builderId: invoice.builderId,
      total: totals.total,
    });
    return { number };
  });
}

/** Cancels an invoice that has no payments (voiding them first); its deals can be billed again. */
export async function cancelInvoice(
  ctx: ServiceContext,
  input: { invoiceId: string; reason: string },
) {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingManage);
  const values = parseInput(cancelInvoiceSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const invoice = await loadInvoice(tx, values.invoiceId);
    if (invoice.status === "CANCELLED") throw new ConflictError("Already cancelled.");
    const payments = await tx.payment.count({ where: { invoiceId: invoice.id, voidedAt: null } });
    if (payments > 0) {
      throw new ConflictError(
        "Payments are recorded on this invoice. Void them before cancelling it.",
      );
    }
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: values.reason,
        balance: 0,
      },
    });
    await recordAudit(tx, ctx, {
      action: "billing.invoice.cancel",
      entityType: "Invoice",
      entityId: invoice.id,
      summary: `Cancelled invoice ${invoice.number ?? "(draft)"}: ${values.reason}`,
    });
    await publishEvent(tx, ctx, "invoice.cancelled", {
      invoiceId: invoice.id,
      number: invoice.number,
      reason: values.reason,
    });
  });
}

/** Recomputes settled amounts, balance and status from the invoice's valid payments. */
async function settle(tx: TenantDbOrTx, invoiceId: string) {
  const invoice = await loadInvoice(tx, invoiceId);
  const sums = await tx.payment.aggregate({
    where: { invoiceId, voidedAt: null },
    _sum: { amount: true, tdsDeducted: true },
  });
  const tds = toMoney(sums._sum.tdsDeducted);
  const settled = toMoney(dec(sums._sum.amount).plus(dec(tds)));
  const status = statusAfterPayments(invoice.total.toString(), settled);
  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      amountSettled: settled,
      tdsDeducted: tds,
      balance: toMoney(dec(invoice.total).minus(dec(settled))),
      status,
    },
  });
  return { invoice, status, previous: invoice.status as InvoiceStatus };
}

/** Records money received (M09-09): amount plus the TDS the builder deducted may not exceed the balance. */
export async function recordPayment(
  ctx: ServiceContext,
  input: PaymentInput,
): Promise<{ id: string; status: InvoiceStatus }> {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingManage);
  const values = parseInput(paymentSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const invoice = await loadInvoice(tx, values.invoiceId);
    if (!(OPEN_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
      throw new ConflictError(
        invoice.status === "PAID"
          ? "This invoice is paid in full."
          : "Payments go against issued invoices.",
      );
    }
    const tds = toMoney(values.tdsDeducted);
    const settling = dec(values.amount).plus(dec(tds));
    if (!dec(values.amount).greaterThan(0)) {
      throw new ValidationError("Enter the amount received.", { amount: ["Above zero"] });
    }
    if (settling.greaterThan(dec(invoice.balance))) {
      const regional = await getRegionalSettings(ctx);
      throw new ValidationError(
        `That is more than the ${formatMoney(invoice.balance, regional)} still due.`,
        { amount: ["More than the balance"] },
      );
    }
    if (invoice.issueDate && values.receivedOn < toCalendarDateString(invoice.issueDate)!) {
      throw new ValidationError("The payment date is before the invoice date.", {
        receivedOn: ["Too early"],
      });
    }
    const payment = await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        invoiceId: invoice.id,
        receivedOn: new Date(`${values.receivedOn}T00:00:00.000Z`),
        amount: toMoney(values.amount),
        tdsDeducted: tds,
        mode: values.mode,
        reference: values.reference ?? null,
        notes: values.notes ?? null,
        recordedById: ctx.actor.membershipId ?? null,
        recordedByName: ctx.actor.name,
      },
    });
    const { status } = await settle(tx, invoice.id);
    await recordAudit(tx, ctx, {
      action: "billing.payment.record",
      entityType: "Payment",
      entityId: payment.id,
      summary: `Payment of ${toMoney(values.amount)} (TDS ${tds}) on invoice ${invoice.number}`,
    });
    await publishEvent(tx, ctx, "payment.recorded", {
      paymentId: payment.id,
      invoiceId: invoice.id,
      amount: toMoney(values.amount),
      tdsDeducted: tds,
    });
    if (status === "PAID") {
      await publishEvent(tx, ctx, "invoice.paid", {
        invoiceId: invoice.id,
        number: invoice.number,
      });
    }
    return { id: payment.id, status };
  });
}

/** Voids a mistaken payment (kept with its reason); the invoice's balance and status follow. */
export async function voidPayment(
  ctx: ServiceContext,
  input: { paymentId: string; reason: string },
) {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingManage);
  const values = parseInput(voidPaymentSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id: values.paymentId } });
    if (!payment) throw new NotFoundError("Payment", values.paymentId);
    if (payment.voidedAt) throw new ConflictError("This payment is voided already.");
    await tx.payment.update({
      where: { id: payment.id },
      data: { voidedAt: new Date(), voidedByName: ctx.actor.name, voidReason: values.reason },
    });
    const { status } = await settle(tx, payment.invoiceId);
    await recordAudit(tx, ctx, {
      action: "billing.payment.void",
      entityType: "Payment",
      entityId: payment.id,
      summary: `Voided a payment of ${payment.amount.toString()}: ${values.reason}`,
    });
    await publishEvent(tx, ctx, "payment.voided", {
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      reason: values.reason,
    });
    return { invoiceId: payment.invoiceId, status };
  });
}

// --- Read ----------------------------------------------------------------------------------------------------------

export interface InvoiceRow {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  builder: { id: string; name: string };
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  amountSettled: string;
  tdsDeducted: string;
  balance: string;
  overdue: boolean;
  createdAt: string;
}

const invoiceInclude = {
  builder: { select: { id: true, name: true } },
} satisfies Prisma.InvoiceInclude;

function toInvoiceRow(
  record: Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>,
  today: string,
): InvoiceRow {
  const dueDate = toCalendarDateString(record.dueDate);
  return {
    id: record.id,
    number: record.number,
    status: record.status,
    builder: record.builder,
    issueDate: toCalendarDateString(record.issueDate),
    dueDate,
    subtotal: record.subtotal.toString(),
    taxTotal: record.taxTotal.toString(),
    total: record.total.toString(),
    amountSettled: record.amountSettled.toString(),
    tdsDeducted: record.tdsDeducted.toString(),
    balance: record.balance.toString(),
    overdue:
      (OPEN_INVOICE_STATUSES as readonly string[]).includes(record.status) &&
      dueDate !== null &&
      dueDate < today,
    createdAt: record.createdAt.toISOString(),
  };
}

export interface InvoiceFilters {
  status?: string | null;
  builderId?: string | null;
  /** Invoice dates (inclusive). */
  from?: string | null;
  to?: string | null;
  overdue?: boolean;
  today: string;
}

export function invoiceFilterWhere(filters: InvoiceFilters): Prisma.InvoiceWhereInput[] {
  const and: Prisma.InvoiceWhereInput[] = [];
  if (filters.status === "OPEN") and.push({ status: { in: [...OPEN_INVOICE_STATUSES] } });
  else if (
    ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"].includes(filters.status ?? "")
  ) {
    and.push({ status: filters.status as InvoiceStatus });
  }
  const builderId = uuidOrNull(filters.builderId);
  if (builderId) and.push({ builderId });
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (filters.from && iso.test(filters.from)) {
    and.push({ issueDate: { gte: new Date(`${filters.from}T00:00:00.000Z`) } });
  }
  if (filters.to && iso.test(filters.to)) {
    and.push({ issueDate: { lte: new Date(`${filters.to}T00:00:00.000Z`) } });
  }
  if (filters.overdue) {
    and.push({
      status: { in: [...OPEN_INVOICE_STATUSES] },
      dueDate: { lt: new Date(`${filters.today}T00:00:00.000Z`) },
    });
  }
  return and;
}

export const INVOICE_SORTABLE_FIELDS = ["issueDate", "total", "balance", "dueDate"] as const;

export async function listInvoices(
  ctx: ServiceContext,
  query: TableQuery,
  filters: InvoiceFilters,
): Promise<{ rows: InvoiceRow[]; total: number }> {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingView);
  const and = invoiceFilterWhere(filters);
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { builder: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  const where: Prisma.InvoiceWhereInput = { AND: and };
  const direction = query.sort?.direction ?? "desc";
  const field = query.sort?.field;
  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] =
    field === "total" || field === "balance"
      ? [{ [field]: direction }]
      : field === "dueDate"
        ? [{ dueDate: { sort: direction, nulls: "last" } }]
        : [{ issueDate: { sort: direction, nulls: "first" } }, { createdAt: "desc" }];
  const [total, records] = await Promise.all([
    ctx.db.invoice.count({ where }),
    ctx.db.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy,
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return { total, rows: records.map((record) => toInvoiceRow(record, filters.today)) };
}

export interface InvoiceDetail extends InvoiceRow {
  fiscalYear: string | null;
  intraState: boolean;
  seller: InvoiceParty | null;
  billTo: InvoiceParty | null;
  taxLines: TaxLine[];
  notes: string | null;
  lines: {
    id: string;
    description: string;
    serviceCode: string | null;
    amount: string;
    dealId: string | null;
    bookingId: string | null;
  }[];
  payments: {
    id: string;
    receivedOn: string;
    amount: string;
    tdsDeducted: string;
    mode: string;
    reference: string | null;
    notes: string | null;
    recordedByName: string;
    voidedAt: string | null;
    voidReason: string | null;
    voidedByName: string | null;
  }[];
  hasPdf: boolean;
  sentAt: string | null;
  sentTo: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdByName: string;
  issuedByName: string | null;
  builderEmail: string | null;
}

export async function getInvoice(
  ctx: ServiceContext,
  invoiceId: string,
  today: string,
): Promise<InvoiceDetail> {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingView);
  const record = await ctx.db.invoice.findFirst({
    where: { id: invoiceId },
    include: {
      ...invoiceInclude,
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { dealFinancial: { select: { id: true, bookingId: true } } },
      },
      payments: { orderBy: [{ receivedOn: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!record) throw new NotFoundError("Invoice", invoiceId);
  const contact = await ctx.db.builderContact.findFirst({
    where: { builderId: record.builderId, email: { not: null } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { email: true },
  });
  const builder = await ctx.db.builder.findFirst({
    where: { id: record.builderId },
    select: { email: true },
  });
  const party = (value: unknown) =>
    value && typeof value === "object" && "name" in (value as object)
      ? (value as InvoiceParty)
      : null;
  return {
    ...toInvoiceRow(record, today),
    fiscalYear: record.fiscalYear,
    intraState: record.intraState,
    seller: party(record.seller),
    billTo: party(record.billTo),
    taxLines: (record.taxLines ?? []) as unknown as TaxLine[],
    notes: record.notes,
    lines: record.lines.map((line) => ({
      id: line.id,
      description: line.description,
      serviceCode: line.serviceCode,
      amount: line.amount.toString(),
      dealId: line.dealFinancial?.id ?? null,
      bookingId: line.dealFinancial?.bookingId ?? null,
    })),
    payments: record.payments.map((payment) => ({
      id: payment.id,
      receivedOn: toCalendarDateString(payment.receivedOn)!,
      amount: payment.amount.toString(),
      tdsDeducted: payment.tdsDeducted.toString(),
      mode: payment.mode,
      reference: payment.reference,
      notes: payment.notes,
      recordedByName: payment.recordedByName,
      voidedAt: payment.voidedAt?.toISOString() ?? null,
      voidReason: payment.voidReason,
      voidedByName: payment.voidedByName,
    })),
    hasPdf: record.pdfFileId !== null,
    sentAt: record.sentAt?.toISOString() ?? null,
    sentTo: record.sentTo,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancelReason: record.cancelReason,
    createdByName: record.createdByName,
    issuedByName: record.issuedByName,
    builderEmail: contact?.email ?? builder?.email ?? null,
  };
}
