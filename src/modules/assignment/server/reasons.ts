import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { DEFAULT_REASSIGNMENT_REASONS } from "../constants";
import { ASSIGNMENT_PERMISSIONS } from "../permissions";
import { reassignmentReasonSchema } from "../schemas";

/** Seeds the default reason categories once per organization (idempotent). */
export async function seedAssignmentMasters(db: TenantDbOrTx, organizationId: string) {
  await db.reassignmentReason.createMany({
    data: DEFAULT_REASSIGNMENT_REASONS.map((label, index) => ({
      organizationId,
      label,
      sortOrder: (index + 1) * 10,
    })),
    skipDuplicates: true,
  });
}

export interface ReasonRow {
  id: string;
  label: string;
  isActive: boolean;
  usage: number;
}

/** Reason categories; `activeOnly` for pickers. */
export async function listReassignmentReasons(
  ctx: ServiceContext,
  options: { activeOnly?: boolean } = {},
): Promise<ReasonRow[]> {
  const reasons = await ctx.db.reassignmentReason.findMany({
    where: options.activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { _count: { select: { assignments: true } } },
  });
  return reasons.map((reason) => ({
    id: reason.id,
    label: reason.label,
    isActive: reason.isActive,
    usage: reason._count.assignments,
  }));
}

export async function saveReassignmentReason(
  ctx: ServiceContext,
  reasonId: string | null,
  input: { label: string; isActive?: boolean },
): Promise<{ id: string }> {
  ctx.permissions.assert(ASSIGNMENT_PERMISSIONS.rulesManage);
  const values = parseInput(reassignmentReasonSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const clash = await tx.reassignmentReason.findFirst({
      where: {
        label: { equals: values.label, mode: "insensitive" },
        ...(reasonId ? { id: { not: reasonId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ValidationError("This reason exists already.", { label: ["Duplicate"] });
    if (reasonId) {
      const before = await tx.reassignmentReason.findFirst({ where: { id: reasonId } });
      if (!before) throw new NotFoundError("Reason", reasonId);
      await tx.reassignmentReason.update({ where: { id: reasonId }, data: values });
      await recordAudit(tx, ctx, {
        action: "assignment.reason.update",
        entityType: "ReassignmentReason",
        entityId: reasonId,
        summary: `Updated reassignment reason "${values.label}"`,
        before: { label: before.label, isActive: before.isActive },
        after: values,
      });
      return { id: reasonId };
    }
    const last = await tx.reassignmentReason.aggregate({ _max: { sortOrder: true } });
    const created = await tx.reassignmentReason.create({
      data: {
        organizationId: ctx.organizationId,
        ...values,
        sortOrder: (last._max.sortOrder ?? 0) + 10,
      },
    });
    await recordAudit(tx, ctx, {
      action: "assignment.reason.create",
      entityType: "ReassignmentReason",
      entityId: created.id,
      summary: `Added reassignment reason "${values.label}"`,
    });
    return { id: created.id };
  });
}

/** Unused reasons can be deleted; used ones are deactivated instead (history keeps them). */
export async function deleteReassignmentReason(ctx: ServiceContext, reasonId: string) {
  ctx.permissions.assert(ASSIGNMENT_PERMISSIONS.rulesManage);
  await ctx.db.$transaction(async (tx) => {
    const reason = await tx.reassignmentReason.findFirst({
      where: { id: reasonId },
      include: { _count: { select: { assignments: true } } },
    });
    if (!reason) throw new NotFoundError("Reason", reasonId);
    if (reason._count.assignments > 0) {
      throw new ConflictError(
        `"${reason.label}" is used in the assignment history. Deactivate it instead.`,
      );
    }
    await tx.reassignmentReason.delete({ where: { id: reasonId } });
    await recordAudit(tx, ctx, {
      action: "assignment.reason.delete",
      entityType: "ReassignmentReason",
      entityId: reasonId,
      summary: `Deleted reassignment reason "${reason.label}"`,
    });
  });
}
