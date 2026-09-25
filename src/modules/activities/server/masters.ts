import type { CallOutcomeCategory, FollowUpType } from "@/generated/prisma/enums";
import { listLeadStatuses } from "@/modules/leads";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { DEFAULT_CALL_OUTCOMES, DEFAULT_FOLLOW_UP_PURPOSES } from "../constants";
import { ACTIVITY_PERMISSIONS } from "../permissions";
import { type CallOutcomeInput, callOutcomeSchema, followUpPurposeSchema } from "../schemas";

/** Seeds the default call outcomes and follow-up purposes once per organization (idempotent, M07-02). */
export async function seedActivityMasters(db: TenantDbOrTx, organizationId: string) {
  await db.callOutcome.createMany({
    data: DEFAULT_CALL_OUTCOMES.map((outcome, index) => ({
      organizationId,
      ...outcome,
      sortOrder: (index + 1) * 10,
    })),
    skipDuplicates: true,
  });
  await db.followUpPurpose.createMany({
    data: DEFAULT_FOLLOW_UP_PURPOSES.map((label, index) => ({
      organizationId,
      label,
      sortOrder: (index + 1) * 10,
    })),
    skipDuplicates: true,
  });
}

export interface CallOutcomeRow {
  id: string;
  key: string | null;
  label: string;
  category: CallOutcomeCategory;
  connected: boolean;
  suggestedStatusKey: string | null;
  requiresNextAction: boolean;
  nextActionType: FollowUpType | null;
  isActive: boolean;
  usage: number;
}

/** Call outcomes in display order; `activeOnly` for the call dialog. Readable by everyone who logs calls. */
export async function listCallOutcomes(
  ctx: ServiceContext,
  options: { activeOnly?: boolean } = {},
): Promise<CallOutcomeRow[]> {
  const outcomes = await ctx.db.callOutcome.findMany({
    where: options.activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { _count: { select: { calls: true } } },
  });
  return outcomes.map((outcome) => ({
    id: outcome.id,
    key: outcome.key,
    label: outcome.label,
    category: outcome.category,
    connected: outcome.connected,
    suggestedStatusKey: outcome.suggestedStatusKey,
    requiresNextAction: outcome.requiresNextAction,
    nextActionType: outcome.nextActionType,
    isActive: outcome.isActive,
    usage: outcome._count.calls,
  }));
}

async function assertStatusKey(ctx: ServiceContext, key: string | null) {
  if (!key) return;
  const statuses = await listLeadStatuses(ctx, { activeOnly: true });
  if (!statuses.some((status) => status.key === key)) {
    throw new ValidationError("Choose an active lead status.", {
      suggestedStatusKey: ["Unknown status"],
    });
  }
}

export async function saveCallOutcome(
  ctx: ServiceContext,
  outcomeId: string | null,
  input: CallOutcomeInput,
): Promise<{ id: string }> {
  ctx.permissions.assert(ACTIVITY_PERMISSIONS.mastersManage);
  const values = parseInput(callOutcomeSchema, input);
  await assertStatusKey(ctx, values.suggestedStatusKey);
  return ctx.db.$transaction(async (tx) => {
    const clash = await tx.callOutcome.findFirst({
      where: {
        label: { equals: values.label, mode: "insensitive" },
        ...(outcomeId ? { id: { not: outcomeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ValidationError("This outcome exists already.", { label: ["Duplicate"] });
    if (outcomeId) {
      const before = await tx.callOutcome.findFirst({ where: { id: outcomeId } });
      if (!before) throw new NotFoundError("Call outcome", outcomeId);
      await tx.callOutcome.update({ where: { id: outcomeId }, data: values });
      await recordAudit(tx, ctx, {
        action: "activities.outcome.update",
        entityType: "CallOutcome",
        entityId: outcomeId,
        summary: `Updated call outcome "${values.label}"`,
        before: {
          label: before.label,
          category: before.category,
          connected: before.connected,
          suggestedStatusKey: before.suggestedStatusKey,
          requiresNextAction: before.requiresNextAction,
          isActive: before.isActive,
        },
        after: values,
      });
      return { id: outcomeId };
    }
    const last = await tx.callOutcome.aggregate({ _max: { sortOrder: true } });
    const created = await tx.callOutcome.create({
      data: {
        organizationId: ctx.organizationId,
        ...values,
        sortOrder: (last._max.sortOrder ?? 0) + 10,
      },
    });
    await recordAudit(tx, ctx, {
      action: "activities.outcome.create",
      entityType: "CallOutcome",
      entityId: created.id,
      summary: `Added call outcome "${values.label}"`,
    });
    return { id: created.id };
  });
}

/** Unused outcomes can be deleted; used ones are deactivated instead (call history keeps them). */
export async function deleteCallOutcome(ctx: ServiceContext, outcomeId: string) {
  ctx.permissions.assert(ACTIVITY_PERMISSIONS.mastersManage);
  await ctx.db.$transaction(async (tx) => {
    const outcome = await tx.callOutcome.findFirst({
      where: { id: outcomeId },
      include: { _count: { select: { calls: true } } },
    });
    if (!outcome) throw new NotFoundError("Call outcome", outcomeId);
    if (outcome._count.calls > 0) {
      throw new ConflictError(`"${outcome.label}" is used by logged calls. Deactivate it instead.`);
    }
    await tx.callOutcome.delete({ where: { id: outcomeId } });
    await recordAudit(tx, ctx, {
      action: "activities.outcome.delete",
      entityType: "CallOutcome",
      entityId: outcomeId,
      summary: `Deleted call outcome "${outcome.label}"`,
    });
  });
}

export interface FollowUpPurposeRow {
  id: string;
  label: string;
  isActive: boolean;
  usage: number;
}

export async function listFollowUpPurposes(
  ctx: ServiceContext,
  options: { activeOnly?: boolean } = {},
): Promise<FollowUpPurposeRow[]> {
  const purposes = await ctx.db.followUpPurpose.findMany({
    where: options.activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { _count: { select: { followUps: true } } },
  });
  return purposes.map((purpose) => ({
    id: purpose.id,
    label: purpose.label,
    isActive: purpose.isActive,
    usage: purpose._count.followUps,
  }));
}

export async function saveFollowUpPurpose(
  ctx: ServiceContext,
  purposeId: string | null,
  input: { label: string; isActive?: boolean },
): Promise<{ id: string }> {
  ctx.permissions.assert(ACTIVITY_PERMISSIONS.mastersManage);
  const values = parseInput(followUpPurposeSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const clash = await tx.followUpPurpose.findFirst({
      where: {
        label: { equals: values.label, mode: "insensitive" },
        ...(purposeId ? { id: { not: purposeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ValidationError("This purpose exists already.", { label: ["Duplicate"] });
    if (purposeId) {
      const before = await tx.followUpPurpose.findFirst({ where: { id: purposeId } });
      if (!before) throw new NotFoundError("Follow-up purpose", purposeId);
      await tx.followUpPurpose.update({ where: { id: purposeId }, data: values });
      await recordAudit(tx, ctx, {
        action: "activities.purpose.update",
        entityType: "FollowUpPurpose",
        entityId: purposeId,
        summary: `Updated follow-up purpose "${values.label}"`,
        before: { label: before.label, isActive: before.isActive },
        after: values,
      });
      return { id: purposeId };
    }
    const last = await tx.followUpPurpose.aggregate({ _max: { sortOrder: true } });
    const created = await tx.followUpPurpose.create({
      data: {
        organizationId: ctx.organizationId,
        ...values,
        sortOrder: (last._max.sortOrder ?? 0) + 10,
      },
    });
    await recordAudit(tx, ctx, {
      action: "activities.purpose.create",
      entityType: "FollowUpPurpose",
      entityId: created.id,
      summary: `Added follow-up purpose "${values.label}"`,
    });
    return { id: created.id };
  });
}

export async function deleteFollowUpPurpose(ctx: ServiceContext, purposeId: string) {
  ctx.permissions.assert(ACTIVITY_PERMISSIONS.mastersManage);
  await ctx.db.$transaction(async (tx) => {
    const purpose = await tx.followUpPurpose.findFirst({
      where: { id: purposeId },
      include: { _count: { select: { followUps: true } } },
    });
    if (!purpose) throw new NotFoundError("Follow-up purpose", purposeId);
    if (purpose._count.followUps > 0) {
      throw new ConflictError(`"${purpose.label}" is used by follow-ups. Deactivate it instead.`);
    }
    await tx.followUpPurpose.delete({ where: { id: purposeId } });
    await recordAudit(tx, ctx, {
      action: "activities.purpose.delete",
      entityType: "FollowUpPurpose",
      entityId: purposeId,
      summary: `Deleted follow-up purpose "${purpose.label}"`,
    });
  });
}
