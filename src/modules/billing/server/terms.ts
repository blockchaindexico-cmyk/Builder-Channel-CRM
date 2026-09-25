import type { Prisma } from "@/generated/prisma/client";
import { toCalendarDateString } from "@/lib/format";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { NotFoundError, ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { type CommissionCard, type CommissionSlab, validateCommissionCard } from "../commission";
import { BILLING_PERMISSIONS } from "../permissions";
import { type CommissionTermInput, commissionTermSchema } from "../schemas";

/** Commission rate cards of builders and projects (M09-04). */
type TermRecord = Prisma.CommissionTermGetPayload<object>;

export function toCard(record: TermRecord): CommissionCard {
  return {
    id: record.id,
    builderId: record.builderId,
    projectId: record.projectId,
    name: record.name,
    type: record.type,
    percentage: record.percentage?.toString() ?? null,
    flatAmount: record.flatAmount?.toString() ?? null,
    slabBasis: record.slabBasis,
    slabs: (record.slabs ?? []) as unknown as CommissionSlab[],
    validFrom: toCalendarDateString(record.validFrom)!,
    validTo: toCalendarDateString(record.validTo),
    isActive: record.isActive,
  };
}

/** Active cards of a builder (all its projects), for picking the one that applies to a deal. */
export async function loadBuilderCards(
  db: TenantDbOrTx,
  builderId: string,
): Promise<CommissionCard[]> {
  const records = await db.commissionTerm.findMany({ where: { builderId, isActive: true } });
  return records.map(toCard);
}

export interface CommissionTermRow extends CommissionCard {
  builderName: string;
  projectName: string | null;
  notes: string | null;
  usage: number;
}

export async function listCommissionTerms(
  ctx: ServiceContext,
  filters: { builderId?: string | null } = {},
): Promise<CommissionTermRow[]> {
  if (
    !ctx.permissions.hasAny([BILLING_PERMISSIONS.commissionManage, BILLING_PERMISSIONS.financeView])
  ) {
    ctx.permissions.assert(BILLING_PERMISSIONS.commissionManage);
  }
  const records = await ctx.db.commissionTerm.findMany({
    where: filters.builderId ? { builderId: filters.builderId } : {},
    include: {
      builder: { select: { name: true } },
      project: { select: { name: true } },
      _count: { select: { financials: true } },
    },
    orderBy: [{ builder: { name: "asc" } }, { projectId: "asc" }, { validFrom: "desc" }],
  });
  return records.map((record) => ({
    ...toCard(record),
    builderName: record.builder.name,
    projectName: record.project?.name ?? null,
    notes: record.notes,
    usage: record._count.financials,
  }));
}

async function checkTerm(
  tx: TenantDbOrTx,
  termId: string | null,
  values: ReturnType<typeof parse>,
) {
  const errors = validateCommissionCard({
    type: values.type,
    percentage: values.percentage,
    flatAmount: values.flatAmount ?? null,
    slabBasis: values.slabBasis,
    slabs: values.slabs,
    validFrom: values.validFrom,
    validTo: values.validTo,
  });
  if (Object.keys(errors).length) {
    throw new ValidationError(
      Object.values(errors)[0]!,
      Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])),
    );
  }
  if (values.projectId) {
    const project = await tx.project.findFirst({
      where: { id: values.projectId },
      select: { builderId: true },
    });
    if (!project || project.builderId !== values.builderId) {
      throw new ValidationError("Choose a project of this builder.", {
        projectId: ["Not this builder's project"],
      });
    }
  }
  if (values.isActive) {
    // One active card per builder/project at a time.
    const others = await tx.commissionTerm.findMany({
      where: {
        builderId: values.builderId,
        projectId: values.projectId,
        isActive: true,
        ...(termId ? { id: { not: termId } } : {}),
      },
      select: { validFrom: true, validTo: true, name: true },
    });
    const end = values.validTo ?? "9999-12-31";
    const clash = others.find((other) => {
      const from = toCalendarDateString(other.validFrom)!;
      const to = toCalendarDateString(other.validTo) ?? "9999-12-31";
      return from <= end && values.validFrom <= to;
    });
    if (clash) {
      throw new ValidationError("Another active rate card covers some of these dates.", {
        validFrom: ["Overlaps another rate card"],
      });
    }
  }
}

const parse = (input: CommissionTermInput) => parseInput(commissionTermSchema, input);

const dataOf = (values: ReturnType<typeof parse>) => ({
  builderId: values.builderId,
  projectId: values.projectId,
  name: values.name ?? null,
  type: values.type,
  percentage: values.type === "PERCENTAGE" ? values.percentage : null,
  flatAmount: values.type === "FLAT" ? (values.flatAmount ?? null) : null,
  slabBasis: values.type === "SLAB" ? values.slabBasis : null,
  slabs: (values.type === "SLAB" ? values.slabs : []) as Prisma.InputJsonValue,
  validFrom: new Date(`${values.validFrom}T00:00:00.000Z`),
  validTo: values.validTo ? new Date(`${values.validTo}T00:00:00.000Z`) : null,
  notes: values.notes ?? null,
  isActive: values.isActive,
});

export async function saveCommissionTerm(
  ctx: ServiceContext,
  termId: string | null,
  input: CommissionTermInput,
): Promise<{ id: string }> {
  ctx.permissions.assert(BILLING_PERMISSIONS.commissionManage);
  const values = parse(input);
  return ctx.db.$transaction(async (tx) => {
    await checkTerm(tx, termId, values);
    if (termId) {
      const before = await tx.commissionTerm.findFirst({ where: { id: termId } });
      if (!before) throw new NotFoundError("Rate card", termId);
      await tx.commissionTerm.update({ where: { id: termId }, data: dataOf(values) });
      await recordAudit(tx, ctx, {
        action: "billing.commission_term.update",
        entityType: "CommissionTerm",
        entityId: termId,
        summary: "Updated a commission rate card",
        before: { ...toCard(before) },
        after: values,
      });
      return { id: termId };
    }
    const created = await tx.commissionTerm.create({
      data: {
        organizationId: ctx.organizationId,
        ...dataOf(values),
        createdById: ctx.actor.membershipId ?? null,
        createdByName: ctx.actor.name,
      },
    });
    await recordAudit(tx, ctx, {
      action: "billing.commission_term.create",
      entityType: "CommissionTerm",
      entityId: created.id,
      summary: "Added a commission rate card",
      after: values,
    });
    return { id: created.id };
  });
}

/** Cards used by deals are deactivated (their snapshots stay); unused ones can be deleted. */
export async function deleteCommissionTerm(ctx: ServiceContext, termId: string) {
  ctx.permissions.assert(BILLING_PERMISSIONS.commissionManage);
  await ctx.db.$transaction(async (tx) => {
    const term = await tx.commissionTerm.findFirst({
      where: { id: termId },
      include: { _count: { select: { financials: true } } },
    });
    if (!term) throw new NotFoundError("Rate card", termId);
    if (term._count.financials > 0) {
      await tx.commissionTerm.update({ where: { id: termId }, data: { isActive: false } });
    } else {
      await tx.commissionTerm.delete({ where: { id: termId } });
    }
    await recordAudit(tx, ctx, {
      action: term._count.financials
        ? "billing.commission_term.deactivate"
        : "billing.commission_term.delete",
      entityType: "CommissionTerm",
      entityId: termId,
      summary: term._count.financials
        ? "Deactivated a used commission rate card"
        : "Deleted a commission rate card",
    });
  });
}
