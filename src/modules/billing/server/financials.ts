import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import type { DealFinancial, Prisma } from "@/generated/prisma/client";
import type { DealFinancialChangeType, DealFinancialStatus } from "@/generated/prisma/enums";
import { formatMoney, toCalendarDateString } from "@/lib/format";
import type { TableQuery } from "@/lib/table-query";
import { getRegionalSettings, type RegionalSettings } from "@/modules/organization";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx, TenantTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput, uuidOrNull } from "@/platform/validation";

import { computeCommission, pickCommissionCard } from "../commission";
import { fiscalYearOf } from "../fiscal";
import { dec, percentOf, round2, sum, toMoney } from "../money";
import { BILLING_PERMISSIONS } from "../permissions";
import {
  type DealFinancialUpdateInput,
  dealFinancialUpdateSchema,
  unlockDealSchema,
} from "../schemas";
import { getBillingSettings } from "./settings";
import { loadBuilderCards } from "./terms";

/**
 * Deal financials (M09-05, M09-06). A closed booking gets one: its commission from the rate card valid on the
 * booking (or closing) date is snapshotted, recalculated while it is a draft and the booking changes, and locked once
 * confirmed — unlocking needs a reason. Every change is kept in `deal_financial_changes` and the audit log.
 */

type Change = Record<string, { from: string | null; to: string | null }>;

const bookingSelect = {
  id: true,
  number: true,
  status: true,
  leadId: true,
  projectId: true,
  builderId: true,
  executiveId: true,
  managerId: true,
  agreementValue: true,
  bookingDate: true,
  closedAt: true,
} satisfies Prisma.BookingSelect;

type BookingSnapshot = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

const localDate = (instant: Date, timezone: string) =>
  format(new TZDate(instant, timezone), "yyyy-MM-dd");

/** Net revenue and net profit from the parts (M09-06). */
export function dealTotals(parts: {
  grossCommission: string;
  cashback: string;
  subBrokerPayout: string;
  executiveIncentive: string;
  otherExpenses: string;
}) {
  const netRevenue = round2(dec(parts.grossCommission).minus(dec(parts.cashback)));
  const costs = sum([parts.subBrokerPayout, parts.executiveIncentive, parts.otherExpenses]);
  return {
    netRevenue: netRevenue.toFixed(2),
    netProfit: round2(netRevenue.minus(costs)).toFixed(2),
  };
}

async function writeChange(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  dealFinancialId: string,
  type: DealFinancialChangeType,
  changes: Change = {},
  reason: string | null = null,
) {
  await tx.dealFinancialChange.create({
    data: {
      organizationId: ctx.organizationId,
      dealFinancialId,
      type,
      changes: changes as Prisma.InputJsonValue,
      reason,
      actorId: ctx.actor.membershipId ?? null,
      actorName: ctx.actor.name,
    },
  });
}

/** Works out the commission of a booking from the rate cards. */
async function commissionFor(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  booking: BookingSnapshot,
  recognizedOn: string,
  regional: RegionalSettings,
  excludeId?: string,
) {
  const settings = await getBillingSettings(tx, ctx);
  const date =
    settings.commissionDate === "CLOSING_DATE"
      ? recognizedOn
      : toCalendarDateString(booking.bookingDate)!;
  const cards = await loadBuilderCards(tx, booking.builderId);
  const card = pickCommissionCard(cards, {
    builderId: booking.builderId,
    projectId: booking.projectId,
    date,
  });
  let volumePosition: number | undefined;
  if (card?.type === "SLAB" && card.slabBasis === "VOLUME") {
    const year = fiscalYearOf(recognizedOn, regional.fiscalYearStartMonth);
    const earlier = await tx.dealFinancial.count({
      where: {
        builderId: booking.builderId,
        ...(card.projectId ? { projectId: card.projectId } : {}),
        status: { not: "CANCELLED" },
        recognizedOn: {
          gte: new Date(`${year.start}T00:00:00.000Z`),
          lte: new Date(`${recognizedOn}T00:00:00.000Z`),
        },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    volumePosition = earlier + 1;
  }
  const result = computeCommission(
    card,
    { agreementValue: booking.agreementValue?.toString() ?? null, volumePosition },
    (value) => formatMoney(value, regional),
  );
  return { card, result, settings };
}

/**
 * Creates the financials of a closed booking (the `booking.closed` handler, and the backfill). Returns null when the
 * booking is not closed or already has them.
 */
export async function createDealFinancialForBooking(
  ctx: ServiceContext,
  bookingId: string,
): Promise<DealFinancial | null> {
  const regional = await getRegionalSettings(ctx);
  return ctx.db.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({ where: { id: bookingId }, select: bookingSelect });
    if (!booking || booking.status !== "CLOSED_WON") return null;
    const existing = await tx.dealFinancial.findFirst({ where: { bookingId } });
    if (existing) return null;
    const recognizedOn = localDate(booking.closedAt ?? new Date(), regional.timezone);
    const { card, result, settings } = await commissionFor(
      tx,
      ctx,
      booking,
      recognizedOn,
      regional,
    );
    const totals = dealTotals({
      grossCommission: result.gross,
      cashback: "0",
      subBrokerPayout: "0",
      executiveIncentive: "0",
      otherExpenses: "0",
    });
    const deal = await tx.dealFinancial.create({
      data: {
        organizationId: ctx.organizationId,
        bookingId,
        builderId: booking.builderId,
        projectId: booking.projectId,
        executiveId: booking.executiveId,
        managerId: booking.managerId,
        recognizedOn: new Date(`${recognizedOn}T00:00:00.000Z`),
        agreementValue: toMoney(booking.agreementValue),
        commissionTermId: card?.id ?? null,
        commissionBasis: result.basis,
        commissionRate: result.rate,
        grossCommission: result.gross,
        taxRate: settings.taxRate,
        taxAmount: toMoney(percentOf(result.gross, settings.taxRate)),
        tdsRate: settings.tdsRate,
        tdsAmount: toMoney(percentOf(result.gross, settings.tdsRate)),
        ...totals,
      },
    });
    await writeChange(tx, ctx, deal.id, "CREATED", {
      grossCommission: { from: null, to: formatMoney(result.gross, regional) },
    });
    await recordAudit(tx, ctx, {
      action: "billing.deal.create",
      entityType: "DealFinancial",
      entityId: deal.id,
      summary: `Deal financials for booking ${booking.number}: ${result.basis}`,
    });
    await publishEvent(tx, ctx, "deal_financial.created", {
      dealFinancialId: deal.id,
      bookingId,
      grossCommission: result.gross,
    });
    return deal;
  });
}

/** Keeps attribution in step with the booking and, for drafts, recalculates the commission (`booking.updated`). */
export async function syncDealFinancial(ctx: ServiceContext, bookingId: string): Promise<boolean> {
  const regional = await getRegionalSettings(ctx);
  return ctx.db.$transaction(async (tx) => {
    const deal = await tx.dealFinancial.findFirst({ where: { bookingId } });
    const booking = await tx.booking.findFirst({ where: { id: bookingId }, select: bookingSelect });
    if (!deal || !booking) return false;
    await tx.dealFinancial.update({
      where: { id: deal.id },
      data: {
        builderId: booking.builderId,
        projectId: booking.projectId,
        executiveId: booking.executiveId,
        managerId: booking.managerId,
      },
    });
    if (deal.status !== "DRAFT") return false;
    return recalculateInTx(tx, ctx, deal, booking, regional, "RECALCULATED");
  });
}

async function recalculateInTx(
  tx: TenantTx,
  ctx: ServiceContext,
  deal: DealFinancial,
  booking: BookingSnapshot,
  regional: RegionalSettings,
  type: DealFinancialChangeType,
): Promise<boolean> {
  const recognizedOn = toCalendarDateString(deal.recognizedOn)!;
  const agreementValue = toMoney(booking.agreementValue);
  const { card, result } = await commissionFor(tx, ctx, booking, recognizedOn, regional, deal.id);
  const gross = deal.commissionOverridden ? deal.grossCommission.toString() : result.gross;
  const changes: Change = {};
  if (dec(deal.agreementValue).comparedTo(dec(agreementValue)) !== 0) {
    changes.agreementValue = {
      from: formatMoney(deal.agreementValue, regional),
      to: formatMoney(agreementValue, regional),
    };
  }
  if (dec(deal.grossCommission).comparedTo(dec(gross)) !== 0) {
    changes.grossCommission = {
      from: formatMoney(deal.grossCommission, regional),
      to: formatMoney(gross, regional),
    };
  }
  if (!deal.commissionOverridden && deal.commissionBasis !== result.basis) {
    changes.commissionBasis = { from: deal.commissionBasis, to: result.basis };
  }
  if (Object.keys(changes).length === 0) return false;
  const totals = dealTotals({
    grossCommission: gross,
    cashback: deal.cashback.toString(),
    subBrokerPayout: deal.subBrokerPayout.toString(),
    executiveIncentive: deal.executiveIncentive.toString(),
    otherExpenses: deal.otherExpenses.toString(),
  });
  await tx.dealFinancial.update({
    where: { id: deal.id },
    data: {
      agreementValue,
      ...(deal.commissionOverridden
        ? {}
        : {
            commissionTermId: card?.id ?? null,
            commissionBasis: result.basis,
            commissionRate: result.rate,
            grossCommission: result.gross,
          }),
      taxAmount: toMoney(percentOf(gross, deal.taxRate)),
      tdsAmount: toMoney(percentOf(gross, deal.tdsRate)),
      ...totals,
    },
  });
  await writeChange(tx, ctx, deal.id, type, changes);
  await recordAudit(tx, ctx, {
    action: "billing.deal.recalculate",
    entityType: "DealFinancial",
    entityId: deal.id,
    summary: `Recalculated deal financials of booking ${booking.number}`,
    changes,
  });
  return true;
}

/** The booking was cancelled after closing: its financials no longer count (`booking.cancelled`). */
export async function cancelDealFinancial(
  ctx: ServiceContext,
  bookingId: string,
): Promise<boolean> {
  return ctx.db.$transaction(async (tx) => {
    const deal = await tx.dealFinancial.findFirst({ where: { bookingId } });
    if (!deal || deal.status === "CANCELLED") return false;
    await tx.dealFinancial.update({ where: { id: deal.id }, data: { status: "CANCELLED" } });
    await writeChange(tx, ctx, deal.id, "CANCELLED", {}, "The booking was cancelled");
    await recordAudit(tx, ctx, {
      action: "billing.deal.cancel",
      entityType: "DealFinancial",
      entityId: deal.id,
      summary: "Deal financials cancelled with their booking",
    });
    return true;
  });
}

/** Financials for closed bookings that have none yet (e.g. closed before billing was set up). */
export async function ensureDealFinancials(ctx: ServiceContext): Promise<number> {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeManage);
  const missing = await ctx.db.booking.findMany({
    where: { status: "CLOSED_WON", financial: null },
    select: { id: true },
    take: 500,
  });
  let created = 0;
  for (const booking of missing) {
    if (await createDealFinancialForBooking(ctx, booking.id)) created += 1;
  }
  return created;
}

export async function countBookingsWithoutFinancials(ctx: ServiceContext): Promise<number> {
  return ctx.db.booking.count({ where: { status: "CLOSED_WON", financial: null } });
}

async function loadDeal(tx: TenantDbOrTx, dealId: string) {
  const deal = await tx.dealFinancial.findFirst({ where: { id: dealId } });
  if (!deal) throw new NotFoundError("Deal", dealId);
  return deal;
}

const assertDraft = (deal: { status: DealFinancialStatus }) => {
  if (deal.status === "CONFIRMED") {
    throw new ConflictError("These financials are confirmed. Unlock them first (with a reason).");
  }
  if (deal.status === "CANCELLED")
    throw new ConflictError("The booking of this deal was cancelled.");
};

/** Manual recalculation from the current rate cards (drafts only). */
export async function recalculateDealFinancial(ctx: ServiceContext, dealId: string) {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeManage);
  const regional = await getRegionalSettings(ctx);
  return ctx.db.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId);
    assertDraft(deal);
    const booking = await tx.booking.findFirstOrThrow({
      where: { id: deal.bookingId },
      select: bookingSelect,
    });
    return recalculateInTx(tx, ctx, deal, booking, regional, "RECALCULATED");
  });
}

/** Edits the costs, rates and (with a reason) the commission of a draft (M09-06). */
export async function updateDealFinancial(ctx: ServiceContext, input: DealFinancialUpdateInput) {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeManage);
  const values = parseInput(dealFinancialUpdateSchema, input);
  const regional = await getRegionalSettings(ctx);
  return ctx.db.$transaction(async (tx) => {
    const deal = await loadDeal(tx, values.dealId);
    assertDraft(deal);
    const money = (value: string | null | undefined) => formatMoney(value ?? "0", regional);
    const changes: Change = {};
    const track = (
      field: string,
      before: string,
      after: string,
      show: (value: string) => string = money,
    ) => {
      if (dec(before).comparedTo(dec(after)) !== 0)
        changes[field] = { from: show(before), to: show(after) };
    };
    const overridden = values.grossCommission !== null && values.grossCommission !== undefined;
    if (overridden && !values.overrideReason) {
      throw new ValidationError("Say why the commission differs from the rate card.", {
        overrideReason: ["Give a reason"],
      });
    }
    let gross = deal.grossCommission.toString();
    const data: Prisma.DealFinancialUncheckedUpdateInput = {};
    if (overridden) {
      gross = toMoney(values.grossCommission);
      track("grossCommission", deal.grossCommission.toString(), gross);
      data.grossCommission = gross;
      data.commissionOverridden = true;
      data.commissionBasis = `Entered by hand: ${values.overrideReason}`;
      data.commissionRate = dec(deal.agreementValue).greaterThan(0)
        ? dec(gross).times(100).dividedBy(dec(deal.agreementValue)).toDecimalPlaces(3).toString()
        : null;
    } else if (deal.commissionOverridden) {
      // Back to the rate card.
      data.commissionOverridden = false;
    }
    const pct = (value: string) => `${dec(value).toString()}%`;
    track("taxRate", deal.taxRate.toString(), values.taxRate, pct);
    track("tdsRate", deal.tdsRate.toString(), values.tdsRate, pct);
    const cashback = toMoney(values.cashback);
    const payout = toMoney(values.subBrokerPayout);
    const incentive = toMoney(values.executiveIncentive);
    const other = toMoney(sum(values.expenses.map((expense) => expense.amount)));
    track("cashback", deal.cashback.toString(), cashback);
    track("subBrokerPayout", deal.subBrokerPayout.toString(), payout);
    track("executiveIncentive", deal.executiveIncentive.toString(), incentive);
    track("otherExpenses", deal.otherExpenses.toString(), other);
    const totals = dealTotals({
      grossCommission: gross,
      cashback,
      subBrokerPayout: payout,
      executiveIncentive: incentive,
      otherExpenses: other,
    });
    await tx.dealFinancial.update({
      where: { id: deal.id },
      data: {
        ...data,
        taxRate: values.taxRate,
        taxAmount: toMoney(percentOf(gross, values.taxRate)),
        tdsRate: values.tdsRate,
        tdsAmount: toMoney(percentOf(gross, values.tdsRate)),
        cashback,
        subBrokerPayout: payout,
        subBrokerName: values.subBrokerName ?? null,
        executiveIncentive: incentive,
        otherExpenses: other,
        notes: values.notes ?? null,
        ...totals,
      },
    });
    await tx.dealExpense.deleteMany({ where: { dealFinancialId: deal.id } });
    if (values.expenses.length) {
      await tx.dealExpense.createMany({
        data: values.expenses.map((expense) => ({
          organizationId: ctx.organizationId,
          dealFinancialId: deal.id,
          label: expense.label,
          amount: toMoney(expense.amount),
        })),
      });
    }
    await writeChange(tx, ctx, deal.id, "UPDATED", changes, values.overrideReason ?? null);
    await recordAudit(tx, ctx, {
      action: "billing.deal.update",
      entityType: "DealFinancial",
      entityId: deal.id,
      summary: "Updated deal financials",
      changes,
    });
    if (!overridden && deal.commissionOverridden) {
      const booking = await tx.booking.findFirstOrThrow({
        where: { id: deal.bookingId },
        select: bookingSelect,
      });
      const fresh = await loadDeal(tx, deal.id);
      await recalculateInTx(tx, ctx, fresh, booking, regional, "RECALCULATED");
    }
    return { changed: Object.keys(changes) };
  });
}

/** Confirms and locks a deal's financials (inside `tx` — also used when an invoice for it is issued). */
export async function confirmDealInTx(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  deal: { id: string; status: DealFinancialStatus },
  reason: string | null = null,
) {
  if (deal.status !== "DRAFT") return false;
  await tx.dealFinancial.update({
    where: { id: deal.id },
    data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedByName: ctx.actor.name },
  });
  await writeChange(tx, ctx, deal.id, "CONFIRMED", {}, reason);
  await recordAudit(tx, ctx, {
    action: "billing.deal.confirm",
    entityType: "DealFinancial",
    entityId: deal.id,
    summary: `Confirmed deal financials${reason ? ` (${reason})` : ""}`,
  });
  await publishEvent(tx, ctx, "deal_financial.confirmed", { dealFinancialId: deal.id });
  return true;
}

export async function confirmDealFinancial(ctx: ServiceContext, dealId: string) {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeManage);
  await ctx.db.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId);
    if (deal.status !== "DRAFT") {
      throw new ConflictError(
        deal.status === "CONFIRMED" ? "Already confirmed." : "The booking was cancelled.",
      );
    }
    await confirmDealInTx(tx, ctx, deal);
  });
}

/** Unlocks confirmed financials for a correction (needs a reason; not while an invoice is issued for it). */
export async function unlockDealFinancial(
  ctx: ServiceContext,
  input: { dealId: string; reason: string },
) {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeManage);
  const values = parseInput(unlockDealSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const deal = await loadDeal(tx, values.dealId);
    if (deal.status !== "CONFIRMED")
      throw new ConflictError("Only confirmed financials can be unlocked.");
    const invoiced = await tx.invoiceLine.findFirst({
      where: { dealFinancialId: deal.id, invoice: { status: { not: "CANCELLED" } } },
      select: { invoice: { select: { number: true, status: true } } },
    });
    if (invoiced && invoiced.invoice.status !== "DRAFT") {
      throw new ConflictError(
        `This deal is billed on invoice ${invoiced.invoice.number}. Cancel the invoice before changing it.`,
      );
    }
    await tx.dealFinancial.update({
      where: { id: deal.id },
      data: { status: "DRAFT", confirmedAt: null, confirmedByName: null },
    });
    await writeChange(tx, ctx, deal.id, "UNLOCKED", {}, values.reason);
    await recordAudit(tx, ctx, {
      action: "billing.deal.unlock",
      entityType: "DealFinancial",
      entityId: deal.id,
      summary: `Unlocked deal financials: ${values.reason}`,
    });
  });
}

// --- Read ----------------------------------------------------------------------------------------------------------

const dealInclude = {
  booking: {
    select: {
      id: true,
      number: true,
      customerName: true,
      unitNumber: true,
      tower: true,
      lead: { select: { id: true, number: true, name: true } },
    },
  },
  builder: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  executive: { select: { user: { select: { name: true } } } },
  manager: { select: { user: { select: { name: true } } } },
  invoiceLines: {
    where: { invoice: { status: { not: "CANCELLED" } } },
    select: { invoice: { select: { id: true, number: true, status: true } } },
  },
} satisfies Prisma.DealFinancialInclude;

type DealRecord = Prisma.DealFinancialGetPayload<{ include: typeof dealInclude }>;

export interface DealRow {
  id: string;
  status: DealFinancialStatus;
  recognizedOn: string;
  booking: { id: string; number: string; customerName: string; unit: string | null };
  lead: { id: string; number: string; name: string };
  builder: { id: string; name: string };
  project: { id: string; name: string };
  executiveName: string;
  managerName: string | null;
  agreementValue: string;
  commissionBasis: string;
  commissionRate: string | null;
  commissionOverridden: boolean;
  grossCommission: string;
  taxRate: string;
  taxAmount: string;
  tdsRate: string;
  tdsAmount: string;
  cashback: string;
  subBrokerPayout: string;
  subBrokerName: string | null;
  executiveIncentive: string;
  otherExpenses: string;
  netRevenue: string;
  netProfit: string;
  notes: string | null;
  confirmedAt: string | null;
  confirmedByName: string | null;
  invoice: { id: string; number: string | null; status: string } | null;
}

function toDealRow(record: DealRecord): DealRow {
  const invoice = record.invoiceLines[0]?.invoice ?? null;
  return {
    id: record.id,
    status: record.status,
    recognizedOn: toCalendarDateString(record.recognizedOn)!,
    booking: {
      id: record.booking.id,
      number: record.booking.number,
      customerName: record.booking.customerName,
      unit:
        [record.booking.tower ? `T-${record.booking.tower}` : null, record.booking.unitNumber]
          .filter(Boolean)
          .join(" · ") || null,
    },
    lead: record.booking.lead,
    builder: record.builder,
    project: record.project,
    executiveName: record.executive.user.name,
    managerName: record.manager?.user.name ?? null,
    agreementValue: record.agreementValue.toString(),
    commissionBasis: record.commissionBasis,
    commissionRate: record.commissionRate?.toString() ?? null,
    commissionOverridden: record.commissionOverridden,
    grossCommission: record.grossCommission.toString(),
    taxRate: record.taxRate.toString(),
    taxAmount: record.taxAmount.toString(),
    tdsRate: record.tdsRate.toString(),
    tdsAmount: record.tdsAmount.toString(),
    cashback: record.cashback.toString(),
    subBrokerPayout: record.subBrokerPayout.toString(),
    subBrokerName: record.subBrokerName,
    executiveIncentive: record.executiveIncentive.toString(),
    otherExpenses: record.otherExpenses.toString(),
    netRevenue: record.netRevenue.toString(),
    netProfit: record.netProfit.toString(),
    notes: record.notes,
    confirmedAt: record.confirmedAt?.toISOString() ?? null,
    confirmedByName: record.confirmedByName,
    invoice: invoice ? { id: invoice.id, number: invoice.number, status: invoice.status } : null,
  };
}

export interface DealFilters {
  status?: string | null;
  builderId?: string | null;
  projectId?: string | null;
  executiveId?: string | null;
  managerId?: string | null;
  /** Recognition dates (inclusive). */
  from?: string | null;
  to?: string | null;
  invoiced?: "yes" | "no" | null;
}

export function dealFilterWhere(filters: DealFilters): Prisma.DealFinancialWhereInput[] {
  const and: Prisma.DealFinancialWhereInput[] = [];
  if (
    filters.status === "DRAFT" ||
    filters.status === "CONFIRMED" ||
    filters.status === "CANCELLED"
  ) {
    and.push({ status: filters.status });
  } else {
    and.push({ status: { not: "CANCELLED" } });
  }
  for (const [field, value] of [
    ["builderId", filters.builderId],
    ["projectId", filters.projectId],
    ["executiveId", filters.executiveId],
    ["managerId", filters.managerId],
  ] as const) {
    const id = uuidOrNull(value);
    if (id) and.push({ [field]: id });
  }
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (filters.from && iso.test(filters.from)) {
    and.push({ recognizedOn: { gte: new Date(`${filters.from}T00:00:00.000Z`) } });
  }
  if (filters.to && iso.test(filters.to)) {
    and.push({ recognizedOn: { lte: new Date(`${filters.to}T00:00:00.000Z`) } });
  }
  const billed = { invoiceLines: { some: { invoice: { status: { not: "CANCELLED" as const } } } } };
  if (filters.invoiced === "yes") and.push(billed);
  if (filters.invoiced === "no") and.push({ NOT: billed });
  return and;
}

export async function listDealFinancials(
  ctx: ServiceContext,
  query: TableQuery,
  filters: DealFilters,
): Promise<{
  rows: DealRow[];
  total: number;
  totals: {
    agreementValue: string;
    grossCommission: string;
    netRevenue: string;
    netProfit: string;
  };
}> {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeView);
  const and = dealFilterWhere(filters);
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { booking: { number: { contains: q, mode: "insensitive" } } },
        { booking: { customerName: { contains: q, mode: "insensitive" } } },
        { booking: { lead: { number: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  const where: Prisma.DealFinancialWhereInput = { AND: and };
  const direction = query.sort?.direction ?? "desc";
  const orderBy: Prisma.DealFinancialOrderByWithRelationInput[] =
    query.sort?.field === "netProfit"
      ? [{ netProfit: direction }]
      : query.sort?.field === "grossCommission"
        ? [{ grossCommission: direction }]
        : [{ recognizedOn: direction }, { createdAt: direction }];
  const [total, records, sums] = await Promise.all([
    ctx.db.dealFinancial.count({ where }),
    ctx.db.dealFinancial.findMany({
      where,
      include: dealInclude,
      orderBy,
      skip: query.skip,
      take: query.take,
    }),
    ctx.db.dealFinancial.aggregate({
      where,
      _sum: { agreementValue: true, grossCommission: true, netRevenue: true, netProfit: true },
    }),
  ]);
  return {
    total,
    rows: records.map(toDealRow),
    totals: {
      agreementValue: toMoney(sums._sum.agreementValue),
      grossCommission: toMoney(sums._sum.grossCommission),
      netRevenue: toMoney(sums._sum.netRevenue),
      netProfit: toMoney(sums._sum.netProfit),
    },
  };
}

export const DEAL_SORTABLE_FIELDS = ["recognizedOn", "grossCommission", "netProfit"] as const;

export interface DealDetail extends DealRow {
  expenses: { id: string; label: string; amount: string }[];
  history: {
    id: string;
    type: DealFinancialChangeType;
    changes: { field: string; from: string | null; to: string | null }[];
    reason: string | null;
    actorName: string;
    occurredAt: string;
  }[];
}

export async function getDealFinancial(ctx: ServiceContext, dealId: string): Promise<DealDetail> {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeView);
  const record = await ctx.db.dealFinancial.findFirst({
    where: { id: dealId },
    include: dealInclude,
  });
  if (!record) throw new NotFoundError("Deal", dealId);
  const [expenses, history] = await Promise.all([
    ctx.db.dealExpense.findMany({
      where: { dealFinancialId: dealId },
      orderBy: { createdAt: "asc" },
    }),
    ctx.db.dealFinancialChange.findMany({
      where: { dealFinancialId: dealId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    }),
  ]);
  return {
    ...toDealRow(record),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      label: expense.label,
      amount: expense.amount.toString(),
    })),
    history: history.map((entry) => ({
      id: entry.id,
      type: entry.type,
      changes: Object.entries(
        (entry.changes ?? {}) as Record<string, { from: string | null; to: string | null }>,
      ).map(([field, change]) => ({ field, ...change })),
      reason: entry.reason,
      actorName: entry.actorName,
      occurredAt: entry.occurredAt.toISOString(),
    })),
  };
}

/** The financials of a booking, for its page (null without the permission or when there are none). */
export async function getDealForBooking(
  ctx: ServiceContext,
  bookingId: string,
): Promise<DealRow | null> {
  if (!ctx.permissions.has(BILLING_PERMISSIONS.financeView)) return null;
  const record = await ctx.db.dealFinancial.findFirst({
    where: { bookingId },
    include: dealInclude,
  });
  return record ? toDealRow(record) : null;
}
