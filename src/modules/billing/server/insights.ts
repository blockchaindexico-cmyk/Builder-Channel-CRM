import { TZDate } from "@date-fns/tz";
import { format, startOfMonth } from "date-fns";

import { formatMoney } from "@/lib/format";
import { plural } from "@/lib/utils";
import { findMembers } from "@/modules/identity";
import type { AlertCandidate, AlertRule, DigestSection } from "@/modules/notifications";
import { getRegionalSettings } from "@/modules/organization";

import { OPEN_INVOICE_STATUSES } from "../constants";
import { dec, sum } from "../money";
import { BILLING_PERMISSIONS } from "../permissions";

const OPEN = [...OPEN_INVOICE_STATUSES];

/** Once a day, people who follow billing hear about invoices past their due date (M09-10). */
export const overdueInvoicesRule: AlertRule = {
  key: "billing-overdue-invoices",
  label: "Overdue invoices",
  async evaluate(ctx, now) {
    const regional = await getRegionalSettings(ctx);
    const today = format(new TZDate(now, regional.timezone), "yyyy-MM-dd");
    const overdue = await ctx.db.invoice.findMany({
      where: { status: { in: OPEN }, dueDate: { lt: new Date(`${today}T00:00:00.000Z`) } },
      select: { balance: true },
    });
    if (overdue.length === 0) return [];
    const recipients = await findMembers(ctx.db, {
      activeOnly: true,
      withPermission: BILLING_PERMISSIONS.billingView,
    });
    const amount = formatMoney(sum(overdue.map((invoice) => invoice.balance)).toString(), regional);
    return recipients.map((member): AlertCandidate => ({
      recipientId: member.membershipId,
      type: "billing.invoices_overdue",
      dedupeKey: `${member.membershipId}:${today}`,
      title: `${plural(overdue.length, "invoice")} overdue — ${amount} to collect`,
      body: "Follow up with the builders, or record the payments you have received.",
      link: "/billing/invoices?status=OPEN&overdue=1",
    }));
  },
};

/** Daily summary block (M06-12): billing this month and what is still owed. */
export const billingDigestSection: DigestSection = {
  key: "billing",
  order: 40,
  async build(ctx, now) {
    if (!ctx.permissions.has(BILLING_PERMISSIONS.billingView)) return null;
    const regional = await getRegionalSettings(ctx);
    const today = format(new TZDate(now, regional.timezone), "yyyy-MM-dd");
    const monthStart = new Date(
      `${format(startOfMonth(new TZDate(now, regional.timezone)), "yyyy-MM-dd")}T00:00:00.000Z`,
    );
    const [billed, collected, open] = await Promise.all([
      ctx.db.invoice.aggregate({
        where: { status: { notIn: ["DRAFT", "CANCELLED"] }, issueDate: { gte: monthStart } },
        _sum: { total: true },
      }),
      ctx.db.payment.aggregate({
        where: { voidedAt: null, receivedOn: { gte: monthStart } },
        _sum: { amount: true, tdsDeducted: true },
      }),
      ctx.db.invoice.findMany({
        where: { status: { in: OPEN } },
        select: { balance: true, dueDate: true },
      }),
    ]);
    const overdue = open.filter(
      (invoice) => invoice.dueDate && invoice.dueDate < new Date(`${today}T00:00:00.000Z`),
    );
    const money = (value: unknown) => {
      const amount = dec(value as string);
      return { value: amount.toNumber(), display: formatMoney(amount.toString(), regional) };
    };
    return {
      title: "Billing & collections",
      lines: [
        { label: "Billed this month", ...money(billed._sum.total ?? 0), link: "/billing" },
        {
          label: "Collected this month",
          ...money(dec(collected._sum.amount ?? 0).plus(dec(collected._sum.tdsDeducted ?? 0))),
        },
        {
          label: "Outstanding",
          ...money(sum(open.map((invoice) => invoice.balance))),
          link: "/billing/invoices?status=OPEN",
        },
        {
          label: "Overdue invoices",
          value: overdue.length,
          link: "/billing/invoices?status=OPEN&overdue=1",
          attention: true,
        },
      ],
    };
  },
};
