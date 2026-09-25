import { toCalendarDateString } from "@/lib/format";
import type { ServiceContext } from "@/platform/tenant/context";
import { uuidOrNull } from "@/platform/validation";

import { OPEN_INVOICE_STATUSES } from "../constants";
import { dec, sum, toMoney } from "../money";
import { BILLING_PERMISSIONS } from "../permissions";
import { AGEING_BUCKETS, type AgeingBucket, ageingBucket } from "../tax";
import { type DealFilters, dealFilterWhere } from "./financials";

/** Billing and profit reports (M09-10 → M09-14). Periods are calendar dates, inclusive. */
export interface Period {
  from: string;
  to: string;
}

const dayStart = (date: string) => new Date(`${date}T00:00:00.000Z`);
const inPeriod = (period: Period) => ({ gte: dayStart(period.from), lte: dayStart(period.to) });
const monthOf = (date: string) => date.slice(0, 7);

// --- Receivables & billing dashboard (M09-10, M09-11) -------------------------------------------------------------

export interface BillingSummaryRow {
  key: string;
  label: string;
  billed: string;
  collected: string;
  outstanding: string;
}

export interface BillingDashboard {
  billed: string;
  collected: string;
  tdsDeducted: string;
  outstanding: string;
  overdue: string;
  overdueCount: number;
  ageing: Record<AgeingBucket, string>;
  byBuilder: BillingSummaryRow[];
  byProject: BillingSummaryRow[];
  byMonth: BillingSummaryRow[];
}

export async function getBillingDashboard(
  ctx: ServiceContext,
  period: Period,
  today: string,
): Promise<BillingDashboard> {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingView);
  const [issued, open, payments] = await Promise.all([
    ctx.db.invoice.findMany({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] }, issueDate: inPeriod(period) },
      select: {
        issueDate: true,
        total: true,
        builder: { select: { id: true, name: true } },
        lines: {
          select: {
            amount: true,
            dealFinancial: { select: { project: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    ctx.db.invoice.findMany({
      where: { status: { in: [...OPEN_INVOICE_STATUSES] } },
      select: {
        issueDate: true,
        dueDate: true,
        balance: true,
        builder: { select: { id: true, name: true } },
      },
    }),
    ctx.db.payment.findMany({
      where: { voidedAt: null, receivedOn: inPeriod(period) },
      select: {
        receivedOn: true,
        amount: true,
        tdsDeducted: true,
        invoice: { select: { builder: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  const groups = {
    builder: new Map<string, BillingSummaryRow>(),
    project: new Map<string, BillingSummaryRow>(),
    month: new Map<string, BillingSummaryRow>(),
  };
  const row = (map: Map<string, BillingSummaryRow>, key: string, label: string) => {
    let entry = map.get(key);
    if (!entry) {
      entry = { key, label, billed: "0.00", collected: "0.00", outstanding: "0.00" };
      map.set(key, entry);
    }
    return entry;
  };
  const add = (
    entry: BillingSummaryRow,
    field: "billed" | "collected" | "outstanding",
    value: unknown,
  ) => {
    entry[field] = toMoney(dec(entry[field]).plus(dec(value as string)));
  };

  for (const invoice of issued) {
    add(row(groups.builder, invoice.builder.id, invoice.builder.name), "billed", invoice.total);
    add(
      row(
        groups.month,
        monthOf(toCalendarDateString(invoice.issueDate)!),
        monthOf(toCalendarDateString(invoice.issueDate)!),
      ),
      "billed",
      invoice.total,
    );
    // Projects: the lines' share of the subtotal (tax excluded).
    for (const line of invoice.lines) {
      const project = line.dealFinancial?.project;
      add(
        row(groups.project, project?.id ?? "other", project?.name ?? "Other lines"),
        "billed",
        line.amount,
      );
    }
  }
  for (const payment of payments) {
    const settled = dec(payment.amount).plus(dec(payment.tdsDeducted));
    add(
      row(groups.builder, payment.invoice.builder.id, payment.invoice.builder.name),
      "collected",
      settled,
    );
    const month = monthOf(toCalendarDateString(payment.receivedOn)!);
    add(row(groups.month, month, month), "collected", settled);
  }
  const ageing = Object.fromEntries(AGEING_BUCKETS.map((bucket) => [bucket, "0.00"])) as Record<
    AgeingBucket,
    string
  >;
  let overdue = dec(0);
  let overdueCount = 0;
  for (const invoice of open) {
    add(
      row(groups.builder, invoice.builder.id, invoice.builder.name),
      "outstanding",
      invoice.balance,
    );
    const issueDate = toCalendarDateString(invoice.issueDate) ?? today;
    const bucket = ageingBucket(issueDate, today);
    ageing[bucket] = toMoney(dec(ageing[bucket]).plus(dec(invoice.balance)));
    const due = toCalendarDateString(invoice.dueDate);
    if (due && due < today) {
      overdue = overdue.plus(dec(invoice.balance));
      overdueCount += 1;
    }
  }
  const sorted = (map: Map<string, BillingSummaryRow>) =>
    [...map.values()].sort(
      (a, b) => dec(b.billed).comparedTo(dec(a.billed)) || a.label.localeCompare(b.label),
    );
  return {
    billed: toMoney(sum(issued.map((invoice) => invoice.total))),
    collected: toMoney(
      sum(payments.map((payment) => dec(payment.amount).plus(dec(payment.tdsDeducted)))),
    ),
    tdsDeducted: toMoney(sum(payments.map((payment) => payment.tdsDeducted))),
    outstanding: toMoney(sum(open.map((invoice) => invoice.balance))),
    overdue: toMoney(overdue),
    overdueCount,
    ageing,
    byBuilder: sorted(groups.builder),
    byProject: sorted(groups.project),
    byMonth: [...groups.month.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

// --- Collections register (M09-14) ----------------------------------------------------------------------------------

export interface PaymentRegisterRow {
  id: string;
  receivedOn: string;
  invoice: { id: string; number: string | null };
  builderName: string;
  amount: string;
  tdsDeducted: string;
  mode: string;
  reference: string | null;
  recordedByName: string;
  voided: boolean;
  voidReason: string | null;
}

export async function listPayments(
  ctx: ServiceContext,
  filters: { period: Period; builderId?: string | null; includeVoided?: boolean },
): Promise<{ rows: PaymentRegisterRow[]; received: string; tds: string }> {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingView);
  const builderId = uuidOrNull(filters.builderId);
  const records = await ctx.db.payment.findMany({
    where: {
      receivedOn: inPeriod(filters.period),
      ...(filters.includeVoided ? {} : { voidedAt: null }),
      ...(builderId ? { invoice: { builderId } } : {}),
    },
    include: {
      invoice: { select: { id: true, number: true, builder: { select: { name: true } } } },
    },
    orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
    take: 2000,
  });
  const valid = records.filter((record) => !record.voidedAt);
  return {
    rows: records.map((record) => ({
      id: record.id,
      receivedOn: toCalendarDateString(record.receivedOn)!,
      invoice: { id: record.invoice.id, number: record.invoice.number },
      builderName: record.invoice.builder.name,
      amount: record.amount.toString(),
      tdsDeducted: record.tdsDeducted.toString(),
      mode: record.mode,
      reference: record.reference,
      recordedByName: record.recordedByName,
      voided: record.voidedAt !== null,
      voidReason: record.voidReason,
    })),
    received: toMoney(sum(valid.map((record) => record.amount))),
    tds: toMoney(sum(valid.map((record) => record.tdsDeducted))),
  };
}

// --- Profit & loss (M09-12) -----------------------------------------------------------------------------------------

export const PL_DIMENSIONS = [
  { value: "builder", label: "Builder" },
  { value: "project", label: "Project" },
  { value: "executive", label: "Executive" },
  { value: "manager", label: "Manager" },
  { value: "month", label: "Month" },
] as const;
export type PlDimension = (typeof PL_DIMENSIONS)[number]["value"];

export interface PlRow {
  key: string;
  label: string;
  deals: number;
  agreementValue: string;
  grossCommission: string;
  cashback: string;
  netRevenue: string;
  payouts: string;
  incentives: string;
  otherExpenses: string;
  netProfit: string;
  /** Net profit as a share of net revenue, in percent (one decimal). */
  margin: string | null;
}

export interface ProfitAndLoss {
  rows: PlRow[];
  total: PlRow;
  businessExpenses: { category: string; amount: string }[];
  businessExpensesTotal: string;
  /** Net profit of the deals minus business expenses. */
  organizationProfit: string;
}

const emptyRow = (key: string, label: string): PlRow => ({
  key,
  label,
  deals: 0,
  agreementValue: "0.00",
  grossCommission: "0.00",
  cashback: "0.00",
  netRevenue: "0.00",
  payouts: "0.00",
  incentives: "0.00",
  otherExpenses: "0.00",
  netProfit: "0.00",
  margin: null,
});

const MONEY_FIELDS = [
  "agreementValue",
  "grossCommission",
  "cashback",
  "netRevenue",
  "payouts",
  "incentives",
  "otherExpenses",
  "netProfit",
] as const;

function withMargin(row: PlRow): PlRow {
  const revenue = dec(row.netRevenue);
  return {
    ...row,
    margin: revenue.isZero() ? null : dec(row.netProfit).times(100).dividedBy(revenue).toFixed(1),
  };
}

/** P&L of closed deals by builder, project, executive, manager or month, with business expenses (M09-12, M09-15). */
export async function getProfitAndLoss(
  ctx: ServiceContext,
  period: Period,
  dimension: PlDimension,
  filters: Omit<DealFilters, "from" | "to" | "status"> = {},
): Promise<ProfitAndLoss> {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeView);
  const deals = await ctx.db.dealFinancial.findMany({
    where: { AND: dealFilterWhere({ ...filters, from: period.from, to: period.to }) },
    select: {
      recognizedOn: true,
      agreementValue: true,
      grossCommission: true,
      cashback: true,
      netRevenue: true,
      subBrokerPayout: true,
      executiveIncentive: true,
      otherExpenses: true,
      netProfit: true,
      builder: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      executiveId: true,
      executive: { select: { user: { select: { name: true } } } },
      managerId: true,
      manager: { select: { user: { select: { name: true } } } },
    },
  });
  const groups = new Map<string, PlRow>();
  const total = emptyRow("total", "Total");
  for (const deal of deals) {
    const date = toCalendarDateString(deal.recognizedOn)!;
    const [key, label] =
      dimension === "builder"
        ? [deal.builder.id, deal.builder.name]
        : dimension === "project"
          ? [deal.project.id, deal.project.name]
          : dimension === "executive"
            ? [deal.executiveId, deal.executive.user.name]
            : dimension === "manager"
              ? [deal.managerId ?? "none", deal.manager?.user.name ?? "No manager"]
              : [monthOf(date), monthOf(date)];
    let row = groups.get(key);
    if (!row) {
      row = emptyRow(key, label);
      groups.set(key, row);
    }
    const values = {
      agreementValue: deal.agreementValue,
      grossCommission: deal.grossCommission,
      cashback: deal.cashback,
      netRevenue: deal.netRevenue,
      payouts: deal.subBrokerPayout,
      incentives: deal.executiveIncentive,
      otherExpenses: deal.otherExpenses,
      netProfit: deal.netProfit,
    };
    for (const target of [row, total]) {
      target.deals += 1;
      for (const field of MONEY_FIELDS)
        target[field] = toMoney(dec(target[field]).plus(dec(values[field])));
    }
  }
  const expenses = await ctx.db.businessExpense.groupBy({
    by: ["category"],
    where: { deletedAt: null, spentOn: inPeriod(period) },
    _sum: { amount: true },
  });
  const expensesTotal = toMoney(sum(expenses.map((entry) => entry._sum.amount)));
  const rows = [...groups.values()].map(withMargin);
  rows.sort((a, b) =>
    dimension === "month"
      ? a.key.localeCompare(b.key)
      : dec(b.netProfit).comparedTo(dec(a.netProfit)),
  );
  return {
    rows,
    total: withMargin(total),
    businessExpenses: expenses
      .map((entry) => ({ category: entry.category, amount: toMoney(entry._sum.amount) }))
      .sort((a, b) => dec(b.amount).comparedTo(dec(a.amount))),
    businessExpensesTotal: expensesTotal,
    organizationProfit: toMoney(dec(total.netProfit).minus(dec(expensesTotal))),
  };
}

// --- Lost opportunities (M09-13) ------------------------------------------------------------------------------------

export interface LostRow {
  key: string;
  label: string;
  count: number;
  /** Sum of the customers' budgets (upper bound, else lower bound) — an estimate. */
  estimatedValue: string;
}

export interface LostOpportunities {
  lost: {
    count: number;
    estimatedValue: string;
    byReason: LostRow[];
    byExecutive: LostRow[];
    byProject: LostRow[];
    byBuilder: LostRow[];
  };
  notInterested: { count: number; estimatedValue: string; byReason: LostRow[] };
  cancelledBookings: { count: number; value: string; byReason: LostRow[]; byBuilder: LostRow[] };
}

function tally(rows: Map<string, LostRow>, key: string, label: string, value: unknown) {
  let row = rows.get(key);
  if (!row) {
    row = { key, label, count: 0, estimatedValue: "0.00" };
    rows.set(key, row);
  }
  row.count += 1;
  row.estimatedValue = toMoney(dec(row.estimatedValue).plus(dec(value as string)));
}

const ranked = (rows: Map<string, LostRow>) =>
  [...rows.values()].sort(
    (a, b) => b.count - a.count || dec(b.estimatedValue).comparedTo(dec(a.estimatedValue)),
  );

/**
 * Lost and not-interested leads (closed in the period) and cancelled bookings, by reason, executive, project and
 * builder, with estimated values (M09-13).
 */
export async function getLostOpportunities(
  ctx: ServiceContext,
  period: Period,
): Promise<LostOpportunities> {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeView);
  const range = {
    gte: dayStart(period.from),
    lt: new Date(dayStart(period.to).getTime() + 86_400_000),
  };
  const [leads, bookings] = await Promise.all([
    ctx.db.lead.findMany({
      where: { deletedAt: null, lostAt: range, status: { category: "LOST" } },
      select: {
        budgetMin: true,
        budgetMax: true,
        status: { select: { key: true } },
        lossReason: { select: { id: true, label: true } },
        owner: { select: { id: true, user: { select: { name: true } } } },
        interests: {
          orderBy: [{ level: "asc" }, { createdAt: "asc" }],
          take: 1,
          select: {
            project: {
              select: { id: true, name: true, builder: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }),
    ctx.db.booking.findMany({
      where: { status: "CANCELLED", cancelledAt: range },
      select: {
        agreementValue: true,
        cancelReason: { select: { id: true, label: true } },
        builder: { select: { id: true, name: true } },
      },
    }),
  ]);
  const lost = {
    byReason: new Map(),
    byExecutive: new Map(),
    byProject: new Map(),
    byBuilder: new Map(),
  };
  const notInterested = new Map<string, LostRow>();
  let lostCount = 0;
  let lostValue = dec(0);
  let niCount = 0;
  let niValue = dec(0);
  for (const lead of leads) {
    const value = lead.budgetMax ?? lead.budgetMin ?? 0;
    const reason = lead.lossReason ?? { id: "none", label: "No reason recorded" };
    if (lead.status.key === "NOT_INTERESTED") {
      niCount += 1;
      niValue = niValue.plus(dec(value));
      tally(notInterested, reason.id, reason.label, value);
      continue;
    }
    lostCount += 1;
    lostValue = lostValue.plus(dec(value));
    tally(lost.byReason, reason.id, reason.label, value);
    tally(lost.byExecutive, lead.owner?.id ?? "none", lead.owner?.user.name ?? "Unassigned", value);
    const project = lead.interests[0]?.project;
    tally(lost.byProject, project?.id ?? "none", project?.name ?? "No project", value);
    tally(
      lost.byBuilder,
      project?.builder.id ?? "none",
      project?.builder.name ?? "No builder",
      value,
    );
  }
  const cancelledByReason = new Map<string, LostRow>();
  const cancelledByBuilder = new Map<string, LostRow>();
  for (const booking of bookings) {
    const value = booking.agreementValue ?? 0;
    tally(
      cancelledByReason,
      booking.cancelReason?.id ?? "none",
      booking.cancelReason?.label ?? "No reason",
      value,
    );
    tally(cancelledByBuilder, booking.builder.id, booking.builder.name, value);
  }
  return {
    lost: {
      count: lostCount,
      estimatedValue: toMoney(lostValue),
      byReason: ranked(lost.byReason),
      byExecutive: ranked(lost.byExecutive),
      byProject: ranked(lost.byProject),
      byBuilder: ranked(lost.byBuilder),
    },
    notInterested: {
      count: niCount,
      estimatedValue: toMoney(niValue),
      byReason: ranked(notInterested),
    },
    cancelledBookings: {
      count: bookings.length,
      value: toMoney(sum(bookings.map((booking) => booking.agreementValue))),
      byReason: ranked(cancelledByReason),
      byBuilder: ranked(cancelledByBuilder),
    },
  };
}

// --- Cost per lead (M09-15) -----------------------------------------------------------------------------------------

export interface CostPerLeadRow {
  key: string;
  label: string;
  spend: string;
  leads: number;
  bookings: number;
  costPerLead: string | null;
  costPerBooking: string | null;
}

/** Marketing spend by lead source against the leads and bookings of that source in the period (M09-15). */
export async function getCostPerLead(
  ctx: ServiceContext,
  period: Period,
): Promise<CostPerLeadRow[]> {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeView);
  const created = {
    gte: dayStart(period.from),
    lt: new Date(dayStart(period.to).getTime() + 86_400_000),
  };
  const [spend, leads, bookings, sources] = await Promise.all([
    ctx.db.businessExpense.groupBy({
      by: ["sourceId"],
      where: { deletedAt: null, category: "MARKETING", spentOn: inPeriod(period) },
      _sum: { amount: true },
    }),
    ctx.db.lead.groupBy({
      by: ["sourceId"],
      where: { deletedAt: null, createdAt: created },
      _count: true,
    }),
    ctx.db.booking.findMany({
      where: { status: { not: "CANCELLED" }, bookingDate: inPeriod(period) },
      select: { lead: { select: { sourceId: true } } },
    }),
    ctx.db.leadSource.findMany({ select: { id: true, name: true } }),
  ]);
  const names = new Map(sources.map((source) => [source.id, source.name]));
  const rows = new Map<string, CostPerLeadRow>();
  const row = (sourceId: string | null) => {
    const key = sourceId ?? "none";
    let entry = rows.get(key);
    if (!entry) {
      entry = {
        key,
        label: sourceId ? (names.get(sourceId) ?? "Unknown source") : "No source",
        spend: "0.00",
        leads: 0,
        bookings: 0,
        costPerLead: null,
        costPerBooking: null,
      };
      rows.set(key, entry);
    }
    return entry;
  };
  for (const entry of spend) row(entry.sourceId).spend = toMoney(entry._sum.amount);
  for (const entry of leads) row(entry.sourceId).leads = entry._count;
  for (const booking of bookings) row(booking.lead.sourceId).bookings += 1;
  return [...rows.values()]
    .map((entry) => {
      const amount = dec(entry.spend);
      return {
        ...entry,
        costPerLead:
          entry.leads && !amount.isZero() ? toMoney(amount.dividedBy(entry.leads)) : null,
        costPerBooking:
          entry.bookings && !amount.isZero() ? toMoney(amount.dividedBy(entry.bookings)) : null,
      };
    })
    .sort((a, b) => dec(b.spend).comparedTo(dec(a.spend)) || b.leads - a.leads);
}
