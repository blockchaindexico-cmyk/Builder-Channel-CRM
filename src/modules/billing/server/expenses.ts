import type { BusinessExpenseCategory } from "@/generated/prisma/enums";
import { toCalendarDateString } from "@/lib/format";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { NotFoundError, ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { sum, toMoney } from "../money";
import { BILLING_PERMISSIONS } from "../permissions";
import { type BusinessExpenseInput, businessExpenseSchema } from "../schemas";
import type { Period } from "./reports";

/** Business expenses outside individual deals — marketing, salaries, rent — for the organization P&L (M09-15). */
export interface ExpenseRow {
  id: string;
  spentOn: string;
  category: BusinessExpenseCategory;
  description: string;
  amount: string;
  source: { id: string; name: string } | null;
  campaign: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  paidTo: string | null;
  reference: string | null;
  createdByName: string;
}

const dayStart = (date: string) => new Date(`${date}T00:00:00.000Z`);

export async function listBusinessExpenses(
  ctx: ServiceContext,
  filters: { period: Period; category?: BusinessExpenseCategory | null },
): Promise<{ rows: ExpenseRow[]; total: string }> {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeView);
  const records = await ctx.db.businessExpense.findMany({
    where: {
      deletedAt: null,
      spentOn: { gte: dayStart(filters.period.from), lte: dayStart(filters.period.to) },
      ...(filters.category ? { category: filters.category } : {}),
    },
    include: {
      source: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
    take: 2000,
  });
  return {
    rows: records.map((record) => ({
      id: record.id,
      spentOn: toCalendarDateString(record.spentOn)!,
      category: record.category,
      description: record.description,
      amount: record.amount.toString(),
      source: record.source,
      campaign: record.campaign,
      project: record.project,
      paidTo: record.paidTo,
      reference: record.reference,
      createdByName: record.createdByName,
    })),
    total: toMoney(sum(records.map((record) => record.amount))),
  };
}

async function checkLinks(tx: TenantDbOrTx, values: ReturnType<typeof parse>) {
  if (values.sourceId && !(await tx.leadSource.count({ where: { id: values.sourceId } }))) {
    throw new ValidationError("Choose a lead source.", { sourceId: ["Unknown source"] });
  }
  if (values.campaignId) {
    const campaign = await tx.campaign.findFirst({
      where: { id: values.campaignId },
      select: { sourceId: true },
    });
    if (!campaign)
      throw new ValidationError("Choose a campaign.", { campaignId: ["Unknown campaign"] });
    if (values.sourceId && campaign.sourceId && campaign.sourceId !== values.sourceId) {
      throw new ValidationError("This campaign belongs to another source.", {
        campaignId: ["Not a campaign of this source"],
      });
    }
  }
  if (values.projectId && !(await tx.project.count({ where: { id: values.projectId } }))) {
    throw new ValidationError("Choose a project.", { projectId: ["Unknown project"] });
  }
}

const parse = (input: BusinessExpenseInput) => parseInput(businessExpenseSchema, input);

const dataOf = (values: ReturnType<typeof parse>) => ({
  spentOn: dayStart(values.spentOn),
  category: values.category,
  description: values.description,
  amount: values.amount,
  sourceId: values.sourceId ?? null,
  campaignId: values.campaignId ?? null,
  projectId: values.projectId ?? null,
  paidTo: values.paidTo ?? null,
  reference: values.reference ?? null,
});

export async function saveBusinessExpense(
  ctx: ServiceContext,
  expenseId: string | null,
  input: BusinessExpenseInput,
): Promise<{ id: string }> {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeManage);
  const values = parse(input);
  return ctx.db.$transaction(async (tx) => {
    await checkLinks(tx, values);
    if (expenseId) {
      const before = await tx.businessExpense.findFirst({
        where: { id: expenseId, deletedAt: null },
      });
      if (!before) throw new NotFoundError("Expense", expenseId);
      await tx.businessExpense.update({ where: { id: expenseId }, data: dataOf(values) });
      await recordAudit(tx, ctx, {
        action: "billing.expense.update",
        entityType: "BusinessExpense",
        entityId: expenseId,
        summary: `Updated the expense "${values.description}"`,
        before: {
          spentOn: toCalendarDateString(before.spentOn),
          category: before.category,
          description: before.description,
          amount: before.amount.toString(),
        },
        after: values,
      });
      return { id: expenseId };
    }
    const created = await tx.businessExpense.create({
      data: {
        organizationId: ctx.organizationId,
        ...dataOf(values),
        createdById: ctx.actor.membershipId ?? null,
        createdByName: ctx.actor.name,
      },
    });
    await recordAudit(tx, ctx, {
      action: "billing.expense.create",
      entityType: "BusinessExpense",
      entityId: created.id,
      summary: `Recorded the expense "${values.description}"`,
      after: values,
    });
    return { id: created.id };
  });
}

export async function deleteBusinessExpense(ctx: ServiceContext, expenseId: string) {
  ctx.permissions.assert(BILLING_PERMISSIONS.financeManage);
  await ctx.db.$transaction(async (tx) => {
    const expense = await tx.businessExpense.findFirst({
      where: { id: expenseId, deletedAt: null },
    });
    if (!expense) throw new NotFoundError("Expense", expenseId);
    await tx.businessExpense.update({ where: { id: expenseId }, data: { deletedAt: new Date() } });
    await recordAudit(tx, ctx, {
      action: "billing.expense.delete",
      entityType: "BusinessExpense",
      entityId: expenseId,
      summary: `Deleted the expense "${expense.description}"`,
    });
  });
}
