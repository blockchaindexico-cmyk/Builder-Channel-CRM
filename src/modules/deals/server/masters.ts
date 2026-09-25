import type {
  LossReasonScope,
  VisitNextStep,
  VisitOutcomeCategory,
} from "@/generated/prisma/enums";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { DEFAULT_BOOKING_STAGES, DEFAULT_LOSS_REASONS, DEFAULT_VISIT_OUTCOMES } from "../constants";
import { DEAL_PERMISSIONS } from "../permissions";
import {
  bookingStageSchema,
  type LossReasonInput,
  lossReasonSchema,
  type VisitOutcomeInput,
  visitOutcomeSchema,
} from "../schemas";

/** Seeds visit outcomes, loss reasons and booking stages once per organization (idempotent, M08-02). */
export async function seedDealMasters(db: TenantDbOrTx, organizationId: string) {
  await db.visitOutcome.createMany({
    data: DEFAULT_VISIT_OUTCOMES.map((outcome, index) => ({
      organizationId,
      ...outcome,
      sortOrder: (index + 1) * 10,
    })),
    skipDuplicates: true,
  });
  await db.lossReason.createMany({
    data: DEFAULT_LOSS_REASONS.map((reason, index) => ({
      organizationId,
      ...reason,
      sortOrder: (index + 1) * 10,
    })),
    skipDuplicates: true,
  });
  await db.bookingStage.createMany({
    data: DEFAULT_BOOKING_STAGES.map((stage, index) => ({
      organizationId,
      ...stage,
      sortOrder: (index + 1) * 10,
    })),
    skipDuplicates: true,
  });
}

async function assertUniqueLabel(
  find: () => Promise<{ id: string } | null>,
  message: string,
): Promise<void> {
  if (await find()) throw new ValidationError(message, { label: ["Duplicate"] });
}

// --- Visit outcomes --------------------------------------------------------------------------------------------------

export interface VisitOutcomeRow {
  id: string;
  key: string | null;
  label: string;
  category: VisitOutcomeCategory;
  nextStep: VisitNextStep | null;
  isActive: boolean;
  usage: number;
}

export async function listVisitOutcomes(
  ctx: ServiceContext,
  options: { activeOnly?: boolean } = {},
): Promise<VisitOutcomeRow[]> {
  const outcomes = await ctx.db.visitOutcome.findMany({
    where: options.activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { _count: { select: { visits: true } } },
  });
  return outcomes.map((outcome) => ({
    id: outcome.id,
    key: outcome.key,
    label: outcome.label,
    category: outcome.category,
    nextStep: outcome.nextStep,
    isActive: outcome.isActive,
    usage: outcome._count.visits,
  }));
}

export async function saveVisitOutcome(
  ctx: ServiceContext,
  outcomeId: string | null,
  input: VisitOutcomeInput,
): Promise<{ id: string }> {
  ctx.permissions.assert(DEAL_PERMISSIONS.mastersManage);
  const values = parseInput(visitOutcomeSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await assertUniqueLabel(
      () =>
        tx.visitOutcome.findFirst({
          where: {
            label: { equals: values.label, mode: "insensitive" },
            ...(outcomeId ? { id: { not: outcomeId } } : {}),
          },
          select: { id: true },
        }),
      "This outcome exists already.",
    );
    if (outcomeId) {
      const before = await tx.visitOutcome.findFirst({ where: { id: outcomeId } });
      if (!before) throw new NotFoundError("Visit outcome", outcomeId);
      await tx.visitOutcome.update({ where: { id: outcomeId }, data: values });
      await recordAudit(tx, ctx, {
        action: "deals.visit_outcome.update",
        entityType: "VisitOutcome",
        entityId: outcomeId,
        summary: `Updated visit outcome "${values.label}"`,
        before: {
          label: before.label,
          category: before.category,
          nextStep: before.nextStep,
          isActive: before.isActive,
        },
        after: values,
      });
      return { id: outcomeId };
    }
    const last = await tx.visitOutcome.aggregate({ _max: { sortOrder: true } });
    const created = await tx.visitOutcome.create({
      data: {
        organizationId: ctx.organizationId,
        ...values,
        sortOrder: (last._max.sortOrder ?? 0) + 10,
      },
    });
    await recordAudit(tx, ctx, {
      action: "deals.visit_outcome.create",
      entityType: "VisitOutcome",
      entityId: created.id,
      summary: `Added visit outcome "${values.label}"`,
    });
    return { id: created.id };
  });
}

/** Unused outcomes can be deleted; used ones are deactivated instead (visit history keeps them). */
export async function deleteVisitOutcome(ctx: ServiceContext, outcomeId: string) {
  ctx.permissions.assert(DEAL_PERMISSIONS.mastersManage);
  await ctx.db.$transaction(async (tx) => {
    const outcome = await tx.visitOutcome.findFirst({
      where: { id: outcomeId },
      include: { _count: { select: { visits: true } } },
    });
    if (!outcome) throw new NotFoundError("Visit outcome", outcomeId);
    if (outcome._count.visits > 0) {
      throw new ConflictError(`"${outcome.label}" is used by visits. Deactivate it instead.`);
    }
    await tx.visitOutcome.delete({ where: { id: outcomeId } });
    await recordAudit(tx, ctx, {
      action: "deals.visit_outcome.delete",
      entityType: "VisitOutcome",
      entityId: outcomeId,
      summary: `Deleted visit outcome "${outcome.label}"`,
    });
  });
}

// --- Loss reasons ----------------------------------------------------------------------------------------------------

export interface LossReasonRow {
  id: string;
  key: string | null;
  label: string;
  appliesTo: LossReasonScope[];
  isActive: boolean;
  usage: number;
}

/** Loss reasons in display order; `scope` keeps those that apply there (active only). */
export async function listLossReasons(
  ctx: Pick<ServiceContext, "db">,
  options: { activeOnly?: boolean; scope?: LossReasonScope } = {},
): Promise<LossReasonRow[]> {
  const reasons = await ctx.db.lossReason.findMany({
    where: {
      ...(options.activeOnly || options.scope ? { isActive: true } : {}),
      ...(options.scope ? { appliesTo: { has: options.scope } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { _count: { select: { leads: true, bookings: true } } },
  });
  return reasons.map((reason) => ({
    id: reason.id,
    key: reason.key,
    label: reason.label,
    appliesTo: reason.appliesTo,
    isActive: reason.isActive,
    usage: reason._count.leads + reason._count.bookings,
  }));
}

/** An active loss reason usable for `scope`, or a validation error on `field`. */
export async function requireLossReason(
  db: TenantDbOrTx,
  reasonId: unknown,
  scope: LossReasonScope,
  field = "lossReasonId",
  message = "Choose a loss reason.",
): Promise<{ id: string; label: string }> {
  const id = typeof reasonId === "string" ? reasonId : "";
  const reason = /^[0-9a-f-]{36}$/i.test(id)
    ? await db.lossReason.findFirst({
        where: { id, isActive: true, appliesTo: { has: scope } },
        select: { id: true, label: true },
      })
    : null;
  if (!reason) {
    throw new ValidationError(message, { [field]: ["Choose a reason"] });
  }
  return reason;
}

export async function saveLossReason(
  ctx: ServiceContext,
  reasonId: string | null,
  input: LossReasonInput,
): Promise<{ id: string }> {
  ctx.permissions.assert(DEAL_PERMISSIONS.mastersManage);
  const values = parseInput(lossReasonSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await assertUniqueLabel(
      () =>
        tx.lossReason.findFirst({
          where: {
            label: { equals: values.label, mode: "insensitive" },
            ...(reasonId ? { id: { not: reasonId } } : {}),
          },
          select: { id: true },
        }),
      "This reason exists already.",
    );
    if (reasonId) {
      const before = await tx.lossReason.findFirst({ where: { id: reasonId } });
      if (!before) throw new NotFoundError("Loss reason", reasonId);
      await tx.lossReason.update({ where: { id: reasonId }, data: values });
      await recordAudit(tx, ctx, {
        action: "deals.loss_reason.update",
        entityType: "LossReason",
        entityId: reasonId,
        summary: `Updated loss reason "${values.label}"`,
        before: { label: before.label, appliesTo: before.appliesTo, isActive: before.isActive },
        after: values,
      });
      return { id: reasonId };
    }
    const last = await tx.lossReason.aggregate({ _max: { sortOrder: true } });
    const created = await tx.lossReason.create({
      data: {
        organizationId: ctx.organizationId,
        ...values,
        sortOrder: (last._max.sortOrder ?? 0) + 10,
      },
    });
    await recordAudit(tx, ctx, {
      action: "deals.loss_reason.create",
      entityType: "LossReason",
      entityId: created.id,
      summary: `Added loss reason "${values.label}"`,
    });
    return { id: created.id };
  });
}

export async function deleteLossReason(ctx: ServiceContext, reasonId: string) {
  ctx.permissions.assert(DEAL_PERMISSIONS.mastersManage);
  await ctx.db.$transaction(async (tx) => {
    const reason = await tx.lossReason.findFirst({
      where: { id: reasonId },
      include: { _count: { select: { leads: true, bookings: true } } },
    });
    if (!reason) throw new NotFoundError("Loss reason", reasonId);
    if (reason._count.leads + reason._count.bookings > 0) {
      throw new ConflictError(
        `"${reason.label}" is recorded on leads or bookings. Deactivate it instead.`,
      );
    }
    await tx.lossReason.delete({ where: { id: reasonId } });
    await recordAudit(tx, ctx, {
      action: "deals.loss_reason.delete",
      entityType: "LossReason",
      entityId: reasonId,
      summary: `Deleted loss reason "${reason.label}"`,
    });
  });
}

// --- Booking stages --------------------------------------------------------------------------------------------------

export interface BookingStageRow {
  id: string;
  key: string | null;
  label: string;
  isActive: boolean;
  usage: number;
}

/** Booking stages in their order (Q-09). */
export async function listBookingStages(
  ctx: Pick<ServiceContext, "db">,
  options: { activeOnly?: boolean } = {},
): Promise<BookingStageRow[]> {
  const stages = await ctx.db.bookingStage.findMany({
    where: options.activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { _count: { select: { bookings: true } } },
  });
  return stages.map((stage) => ({
    id: stage.id,
    key: stage.key,
    label: stage.label,
    isActive: stage.isActive,
    usage: stage._count.bookings,
  }));
}

export async function saveBookingStage(
  ctx: ServiceContext,
  stageId: string | null,
  input: { label: string; isActive?: boolean },
): Promise<{ id: string }> {
  ctx.permissions.assert(DEAL_PERMISSIONS.mastersManage);
  const values = parseInput(bookingStageSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await assertUniqueLabel(
      () =>
        tx.bookingStage.findFirst({
          where: {
            label: { equals: values.label, mode: "insensitive" },
            ...(stageId ? { id: { not: stageId } } : {}),
          },
          select: { id: true },
        }),
      "This stage exists already.",
    );
    if (stageId) {
      const before = await tx.bookingStage.findFirst({ where: { id: stageId } });
      if (!before) throw new NotFoundError("Booking stage", stageId);
      if (!values.isActive && before.isActive) {
        const active = await tx.bookingStage.count({ where: { isActive: true } });
        if (active <= 1) throw new ConflictError("Keep at least one active booking stage.");
      }
      await tx.bookingStage.update({ where: { id: stageId }, data: values });
      await recordAudit(tx, ctx, {
        action: "deals.booking_stage.update",
        entityType: "BookingStage",
        entityId: stageId,
        summary: `Updated booking stage "${values.label}"`,
        before: { label: before.label, isActive: before.isActive },
        after: values,
      });
      return { id: stageId };
    }
    const last = await tx.bookingStage.aggregate({ _max: { sortOrder: true } });
    const created = await tx.bookingStage.create({
      data: {
        organizationId: ctx.organizationId,
        ...values,
        sortOrder: (last._max.sortOrder ?? 0) + 10,
      },
    });
    await recordAudit(tx, ctx, {
      action: "deals.booking_stage.create",
      entityType: "BookingStage",
      entityId: created.id,
      summary: `Added booking stage "${values.label}"`,
    });
    return { id: created.id };
  });
}

/** Moves a stage one place up or down. */
export async function moveBookingStageOrder(
  ctx: ServiceContext,
  stageId: string,
  direction: "up" | "down",
): Promise<void> {
  ctx.permissions.assert(DEAL_PERMISSIONS.mastersManage);
  await ctx.db.$transaction(async (tx) => {
    const stages = await tx.bookingStage.findMany({
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: { id: true, label: true },
    });
    const index = stages.findIndex((stage) => stage.id === stageId);
    if (index < 0) throw new NotFoundError("Booking stage", stageId);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= stages.length) return;
    const ordered = [...stages];
    [ordered[index], ordered[swapWith]] = [ordered[swapWith]!, ordered[index]!];
    for (const [position, stage] of ordered.entries()) {
      await tx.bookingStage.update({
        where: { id: stage.id },
        data: { sortOrder: (position + 1) * 10 },
      });
    }
    await recordAudit(tx, ctx, {
      action: "deals.booking_stage.reorder",
      entityType: "BookingStage",
      entityId: stageId,
      summary: `Moved booking stage "${stages[index]!.label}" ${direction}`,
    });
  });
}

export async function deleteBookingStage(ctx: ServiceContext, stageId: string) {
  ctx.permissions.assert(DEAL_PERMISSIONS.mastersManage);
  await ctx.db.$transaction(async (tx) => {
    const stage = await tx.bookingStage.findFirst({
      where: { id: stageId },
      include: { _count: { select: { bookings: true } } },
    });
    if (!stage) throw new NotFoundError("Booking stage", stageId);
    if (stage._count.bookings > 0) {
      throw new ConflictError(`"${stage.label}" is used by bookings. Deactivate it instead.`);
    }
    if (stage.isActive && (await tx.bookingStage.count({ where: { isActive: true } })) <= 1) {
      throw new ConflictError("Keep at least one active booking stage.");
    }
    await tx.bookingStage.delete({ where: { id: stageId } });
    await recordAudit(tx, ctx, {
      action: "deals.booking_stage.delete",
      entityType: "BookingStage",
      entityId: stageId,
      summary: `Deleted booking stage "${stage.label}"`,
    });
  });
}
