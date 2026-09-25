import type { FollowUp, Prisma } from "@/generated/prisma/client";
import type { FollowUpStatus, FollowUpType } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/format";
import { plural } from "@/lib/utils";
import { findMembers } from "@/modules/identity";
import {
  findVisibleLead,
  listLeadSummaries,
  recordLeadActivity,
  setLeadEngagement,
} from "@/modules/leads";
import { notify } from "@/modules/notifications";
import { getRegionalSettings, type RegionalSettings } from "@/modules/organization";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx, TenantTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import type { Logger } from "@/platform/logger";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { ACTIVITY_TYPES, FOLLOW_UP_STATUSES, OPEN_FOLLOW_UP_STATUSES } from "../constants";
import { ACTIVITY_PERMISSIONS } from "../permissions";
import {
  type CancelFollowUpInput,
  cancelFollowUpSchema,
  type CompleteFollowUpInput,
  completeFollowUpSchema,
  type RescheduleFollowUpInput,
  rescheduleFollowUpSchema,
  type ScheduleFollowUpInput,
  scheduleFollowUpSchema,
} from "../schemas";
import { cancelFollowUpReminder, scheduleFollowUpReminder } from "./reminders";
import { getActivitySettings } from "./settings";

/**
 * Follow-ups and callbacks (M07-10 → M07-12, M07-17). Every change writes the lead timeline, an audit entry and an
 * event in the same transaction and keeps the lead's `nextFollowUpAt` current. Nothing is deleted: completed, missed,
 * cancelled and rescheduled items stay in the history, and rescheduling links the new item to the old one.
 */
const OPEN = [...OPEN_FOLLOW_UP_STATUSES] as FollowUpStatus[];

export interface FollowUpLead {
  id: string;
  number: string;
  name: string;
  ownerId: string | null;
}

export const followUpTypeLabel = (type: FollowUpType) =>
  type === "CALLBACK" ? "Callback" : "Follow-up";

const statusLabel = (status: FollowUpStatus) =>
  FOLLOW_UP_STATUSES.find((entry) => entry.value === status)?.label.toLowerCase() ?? status;

/** Keeps `lead.nextFollowUpAt` = the earliest open follow-up or callback. */
export async function refreshNextFollowUp(tx: TenantDbOrTx, leadId: string): Promise<void> {
  const next = await tx.followUp.findFirst({
    where: { leadId, status: { in: OPEN } },
    orderBy: { dueAt: "asc" },
    select: { dueAt: true },
  });
  await setLeadEngagement(tx, leadId, { nextFollowUpAt: next?.dueAt ?? null });
}

async function purposeLabelOf(tx: TenantDbOrTx, purposeId: string | null, activeOnly: boolean) {
  if (!purposeId) return null;
  const purpose = await tx.followUpPurpose.findFirst({
    where: { id: purposeId, ...(activeOnly ? { isActive: true } : {}) },
    select: { label: true },
  });
  if (!purpose) {
    throw new ValidationError("Choose an active purpose.", { purposeId: ["Unknown purpose"] });
  }
  return purpose.label;
}

/**
 * Creates a follow-up or callback inside `tx` for the lead's owner (or the person scheduling it while the lead has
 * no owner), with its reminder. Used by the lead page, the call dialog, completion ("next follow-up") and reschedule.
 */
export async function scheduleFollowUpInTx(
  tx: TenantTx,
  ctx: ServiceContext,
  lead: FollowUpLead,
  values: { type: FollowUpType; dueAt: Date; purposeId: string | null; notes: string | null },
  options: {
    sourceCallId?: string | null;
    rescheduledFromId?: string | null;
    assignedToId?: string | null;
    regional?: RegionalSettings;
    now?: Date;
  } = {},
): Promise<FollowUp> {
  const now = options.now ?? new Date();
  if (values.dueAt.getTime() < now.getTime() - 60_000) {
    throw new ValidationError("Choose a time in the future.", { dueAt: ["This time has passed"] });
  }
  // A rescheduled item keeps its purpose even if the purpose was deactivated meanwhile.
  const purposeLabel = await purposeLabelOf(tx, values.purposeId, !options.rescheduledFromId);
  const assignedToId =
    options.assignedToId !== undefined
      ? options.assignedToId
      : (lead.ownerId ?? ctx.actor.membershipId ?? null);
  const followUp = await tx.followUp.create({
    data: {
      organizationId: ctx.organizationId,
      leadId: lead.id,
      type: values.type,
      dueAt: values.dueAt,
      purposeId: values.purposeId,
      notes: values.notes,
      assignedToId,
      createdById: ctx.actor.membershipId ?? null,
      createdByName: ctx.actor.name,
      sourceCallId: options.sourceCallId ?? null,
      rescheduledFromId: options.rescheduledFromId ?? null,
    },
  });
  const regional = options.regional ?? (await getRegionalSettings(ctx));
  await scheduleFollowUpReminder(tx, ctx, followUp, lead, purposeLabel, regional, now);
  const when = formatDateTime(values.dueAt, regional);
  const label = followUpTypeLabel(values.type);
  if (!options.rescheduledFromId) {
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: ACTIVITY_TYPES.FOLLOW_UP_SCHEDULED,
      summary: `${label} scheduled for ${when}${purposeLabel ? ` · ${purposeLabel}` : ""}`,
      payload: {
        followUpId: followUp.id,
        type: values.type,
        dueAt: values.dueAt.toISOString(),
        purpose: purposeLabel,
        notes: values.notes,
      },
    });
    await recordAudit(tx, ctx, {
      action: "activities.followup.schedule",
      entityType: "FollowUp",
      entityId: followUp.id,
      summary: `${lead.number}: ${label.toLowerCase()} scheduled for ${when}`,
    });
    await publishEvent(tx, ctx, "followup.scheduled", {
      followUpId: followUp.id,
      leadId: lead.id,
      type: values.type,
      assignedToId,
      dueAt: values.dueAt.toISOString(),
    });
  }
  if (assignedToId && assignedToId !== ctx.actor.membershipId) {
    await notify(
      ctx,
      {
        type: "followup.assigned",
        recipientIds: [assignedToId],
        title: `${label} for ${lead.number} · ${lead.name} on ${when}`,
        body: [purposeLabel, values.notes].filter(Boolean).join("\n") || null,
        link: `/leads/${lead.id}`,
        entity: { type: "FollowUp", id: followUp.id },
        actorName: ctx.actor.name,
        idempotencyKey: `followup.assigned:${followUp.id}`,
      },
      { tx },
    );
  }
  await refreshNextFollowUp(tx, lead.id);
  return followUp;
}

/** Schedule from the lead page (M07-10). */
export async function scheduleFollowUp(
  ctx: ServiceContext,
  input: ScheduleFollowUpInput,
): Promise<{ id: string }> {
  const values = parseInput(scheduleFollowUpSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, values.leadId, {
      permission: ACTIVITY_PERMISSIONS.followUpsManage,
      db: tx,
    });
    const followUp = await scheduleFollowUpInTx(tx, ctx, lead, values);
    return { id: followUp.id };
  });
}

/** Loads an open follow-up whose lead the actor may manage follow-ups for. */
async function loadOpenFollowUp(tx: TenantTx, ctx: ServiceContext, followUpId: string) {
  const followUp = await tx.followUp.findFirst({
    where: { id: followUpId },
    include: { purpose: { select: { label: true } } },
  });
  if (!followUp) throw new NotFoundError("Follow-up", followUpId);
  const lead = await findVisibleLead(ctx, followUp.leadId, {
    permission: ACTIVITY_PERMISSIONS.followUpsManage,
    db: tx,
  });
  if (!OPEN.includes(followUp.status)) {
    throw new ConflictError(
      `This ${followUpTypeLabel(followUp.type).toLowerCase()} is already ${statusLabel(followUp.status)}.`,
    );
  }
  return { followUp, lead };
}

/** Marks a follow-up done inside `tx` (from its own dialog or from a call that took care of it). */
export async function completeFollowUpInTx(
  tx: TenantTx,
  ctx: ServiceContext,
  followUp: FollowUp,
  lead: FollowUpLead,
  options: { notes: string | null; callId?: string | null; now?: Date },
): Promise<void> {
  const now = options.now ?? new Date();
  const { count } = await tx.followUp.updateMany({
    where: { id: followUp.id, status: { in: OPEN } },
    data: {
      status: "COMPLETED",
      completedAt: now,
      completedById: ctx.actor.membershipId ?? null,
      completedByName: ctx.actor.name,
      completionNotes: options.notes,
      completedCallId: options.callId ?? null,
    },
  });
  if (count === 0) throw new ConflictError("This follow-up was closed meanwhile.");
  await cancelFollowUpReminder(tx, ctx, followUp.id);
  const label = followUpTypeLabel(followUp.type);
  const late = followUp.status === "MISSED" || followUp.dueAt < now;
  await recordLeadActivity(tx, ctx, {
    leadId: lead.id,
    type: ACTIVITY_TYPES.FOLLOW_UP_COMPLETED,
    summary: `${label} done${late ? " (late)" : ""}${options.notes ? `: ${options.notes}` : ""}`,
    payload: {
      followUpId: followUp.id,
      type: followUp.type,
      dueAt: followUp.dueAt.toISOString(),
      late,
      callId: options.callId ?? null,
      notes: options.notes,
    },
    occurredAt: now,
  });
  await recordAudit(tx, ctx, {
    action: "activities.followup.complete",
    entityType: "FollowUp",
    entityId: followUp.id,
    summary: `${lead.number}: ${label.toLowerCase()} done${late ? " (late)" : ""}`,
  });
  await publishEvent(tx, ctx, "followup.completed", {
    followUpId: followUp.id,
    leadId: lead.id,
    assignedToId: followUp.assignedToId,
  });
}

/** Complete, optionally scheduling the next one in the same step (M07-11). */
export async function completeFollowUp(
  ctx: ServiceContext,
  input: CompleteFollowUpInput,
): Promise<{ nextId: string | null }> {
  const values = parseInput(completeFollowUpSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const { followUp, lead } = await loadOpenFollowUp(tx, ctx, values.followUpId);
    await completeFollowUpInTx(tx, ctx, followUp, lead, { notes: values.notes });
    let nextId: string | null = null;
    if (values.next) nextId = (await scheduleFollowUpInTx(tx, ctx, lead, values.next)).id;
    else await refreshNextFollowUp(tx, lead.id);
    return { nextId };
  });
}

/** Moves a follow-up to a new time; the old item stays as "rescheduled" and the new one points back to it. */
export async function rescheduleFollowUp(
  ctx: ServiceContext,
  input: RescheduleFollowUpInput,
): Promise<{ id: string }> {
  const values = parseInput(rescheduleFollowUpSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const { followUp, lead } = await loadOpenFollowUp(tx, ctx, values.followUpId);
    const { count } = await tx.followUp.updateMany({
      where: { id: followUp.id, status: { in: OPEN } },
      data: { status: "RESCHEDULED" },
    });
    if (count === 0) throw new ConflictError("This follow-up was closed meanwhile.");
    await cancelFollowUpReminder(tx, ctx, followUp.id);
    const regional = await getRegionalSettings(ctx);
    const next = await scheduleFollowUpInTx(
      tx,
      ctx,
      lead,
      {
        type: followUp.type,
        dueAt: values.dueAt,
        purposeId: followUp.purposeId,
        notes: values.notes ?? followUp.notes,
      },
      { rescheduledFromId: followUp.id, assignedToId: followUp.assignedToId, regional },
    );
    const label = followUpTypeLabel(followUp.type);
    const summary = `${label} moved from ${formatDateTime(followUp.dueAt, regional)} to ${formatDateTime(values.dueAt, regional)}`;
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: ACTIVITY_TYPES.FOLLOW_UP_RESCHEDULED,
      summary: `${summary}${values.notes ? `: ${values.notes}` : ""}`,
      payload: {
        followUpId: next.id,
        previousId: followUp.id,
        type: followUp.type,
        from: followUp.dueAt.toISOString(),
        to: values.dueAt.toISOString(),
        notes: values.notes,
      },
    });
    await recordAudit(tx, ctx, {
      action: "activities.followup.reschedule",
      entityType: "FollowUp",
      entityId: next.id,
      summary: `${lead.number}: ${summary.toLowerCase()}`,
      metadata: { previousId: followUp.id },
    });
    await publishEvent(tx, ctx, "followup.rescheduled", {
      followUpId: followUp.id,
      newFollowUpId: next.id,
      leadId: lead.id,
      dueAt: values.dueAt.toISOString(),
    });
    return { id: next.id };
  });
}

export async function cancelFollowUp(
  ctx: ServiceContext,
  input: CancelFollowUpInput,
): Promise<void> {
  const values = parseInput(cancelFollowUpSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const { followUp, lead } = await loadOpenFollowUp(tx, ctx, values.followUpId);
    const now = new Date();
    await tx.followUp.update({
      where: { id: followUp.id },
      data: { status: "CANCELLED", cancelledAt: now, cancelReason: values.reason },
    });
    await cancelFollowUpReminder(tx, ctx, followUp.id);
    const label = followUpTypeLabel(followUp.type);
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: ACTIVITY_TYPES.FOLLOW_UP_CANCELLED,
      summary: `${label} cancelled: ${values.reason}`,
      payload: { followUpId: followUp.id, type: followUp.type, reason: values.reason },
      occurredAt: now,
    });
    await recordAudit(tx, ctx, {
      action: "activities.followup.cancel",
      entityType: "FollowUp",
      entityId: followUp.id,
      summary: `${lead.number}: ${label.toLowerCase()} cancelled (${values.reason})`,
    });
    await publishEvent(tx, ctx, "followup.cancelled", {
      followUpId: followUp.id,
      leadId: lead.id,
      reason: values.reason,
    });
    await refreshNextFollowUp(tx, lead.id);
  });
}

// --- Missed detection (M07-12) -------------------------------------------------------------------------------------

/**
 * Follow-ups still scheduled after their time plus the grace period become MISSED (they stay open until done, moved
 * or cancelled); the assignee is notified once. Idempotent: each item is claimed with a conditional update.
 */
export async function detectMissedFollowUps(
  ctx: ServiceContext,
  now: Date,
  logger?: Logger,
): Promise<number> {
  const settings = await getActivitySettings(ctx.db, ctx);
  const cutoff = new Date(now.getTime() - settings.missedGraceMinutes * 60_000);
  const due = await ctx.db.followUp.findMany({
    where: { status: "SCHEDULED", dueAt: { lt: cutoff } },
    orderBy: { dueAt: "asc" },
    take: 500,
    include: { lead: { select: { id: true, number: true, name: true, deletedAt: true } } },
  });
  if (due.length === 0) return 0;
  const regional = await getRegionalSettings(ctx);
  let missed = 0;
  for (const followUp of due) {
    const claimed = await ctx.db.$transaction(async (tx) => {
      const { count } = await tx.followUp.updateMany({
        where: { id: followUp.id, status: "SCHEDULED" },
        data: { status: "MISSED", missedAt: now },
      });
      if (count === 0 || followUp.lead.deletedAt) return count > 0;
      const label = followUpTypeLabel(followUp.type);
      const when = formatDateTime(followUp.dueAt, regional);
      await recordLeadActivity(tx, ctx, {
        leadId: followUp.leadId,
        type: ACTIVITY_TYPES.FOLLOW_UP_MISSED,
        summary: `${label} due ${when} was missed`,
        payload: {
          followUpId: followUp.id,
          type: followUp.type,
          dueAt: followUp.dueAt.toISOString(),
        },
        occurredAt: now,
        // Missing a follow-up is not work done on the lead.
        touch: false,
      });
      await publishEvent(tx, ctx, "followup.missed", {
        followUpId: followUp.id,
        leadId: followUp.leadId,
        assignedToId: followUp.assignedToId,
      });
      if (followUp.assignedToId) {
        await notify(
          ctx,
          {
            type: "followup.missed",
            recipientIds: [followUp.assignedToId],
            title: `Missed ${label.toLowerCase()}: ${followUp.lead.number} · ${followUp.lead.name}`,
            body: `It was due ${when}. Do it now or move it to a new time.`,
            link: `/leads/${followUp.leadId}`,
            entity: { type: "FollowUp", id: followUp.id },
            priority: "HIGH",
            idempotencyKey: `followup.missed:${followUp.id}`,
          },
          { tx },
        );
      }
      return true;
    });
    if (claimed) missed += 1;
  }
  if (missed > 0) logger?.info({ organizationId: ctx.organizationId, missed }, "follow-ups missed");
  return missed;
}

// --- Reassignment (M07-17) -----------------------------------------------------------------------------------------

/**
 * Open follow-ups and callbacks follow the lead to its new owner (setting, on by default) and their reminders are
 * re-targeted; while the lead is unassigned they wait without an assignee. `ctx` acts as the person who moved the
 * lead, so the timeline shows who caused the transfer.
 */
export async function transferOpenFollowUps(
  ctx: ServiceContext,
  leadId: string,
  toMembershipId: string | null,
): Promise<number> {
  const settings = await getActivitySettings(ctx.db, ctx);
  if (!settings.transferOnReassign) return 0;
  const regional = await getRegionalSettings(ctx);
  return ctx.db.$transaction(async (tx) => {
    const [lead] = await listLeadSummaries(tx, [leadId]);
    // A later change of owner wins: only transfer to whoever owns the lead now.
    if (!lead || lead.ownerId !== toMembershipId) return 0;
    const open = await tx.followUp.findMany({
      where: {
        leadId,
        status: { in: OPEN },
        ...(toMembershipId
          ? { OR: [{ assignedToId: null }, { assignedToId: { not: toMembershipId } }] }
          : { assignedToId: { not: null } }),
      },
      include: { purpose: { select: { label: true } } },
    });
    if (open.length === 0) return 0;
    await tx.followUp.updateMany({
      where: { id: { in: open.map((followUp) => followUp.id) } },
      data: { assignedToId: toMembershipId },
    });
    for (const followUp of open) {
      await scheduleFollowUpReminder(
        tx,
        ctx,
        { ...followUp, assignedToId: toMembershipId },
        lead,
        followUp.purpose?.label ?? null,
        regional,
      );
    }
    const [member] = toMembershipId ? await findMembers(tx, { ids: [toMembershipId] }) : [];
    const what = plural(open.length, "open follow-up");
    await recordLeadActivity(tx, ctx, {
      leadId,
      type: ACTIVITY_TYPES.FOLLOW_UP_TRANSFERRED,
      summary: member
        ? `${what} moved to ${member.name} with the lead`
        : `${what} wait for the lead's next owner`,
      payload: { followUpIds: open.map((followUp) => followUp.id), to: toMembershipId },
      touch: false,
    });
    return open.length;
  });
}

// --- Lists ---------------------------------------------------------------------------------------------------------

export interface FollowUpRow {
  id: string;
  type: FollowUpType;
  status: FollowUpStatus;
  dueAt: string;
  purpose: string | null;
  notes: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  createdByName: string;
  createdAt: string;
  completedAt: string | null;
  completedByName: string | null;
  completionNotes: string | null;
  missedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  rescheduledFromId: string | null;
  lead: { id: string; number: string; name: string; mobile: string | null };
}

const rowInclude = {
  purpose: { select: { label: true } },
  assignedTo: { select: { user: { select: { name: true } } } },
  lead: { select: { id: true, number: true, name: true, mobile: true } },
} satisfies Prisma.FollowUpInclude;

type FollowUpRecord = Prisma.FollowUpGetPayload<{ include: typeof rowInclude }>;

function toRow(record: FollowUpRecord): FollowUpRow {
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    dueAt: record.dueAt.toISOString(),
    purpose: record.purpose?.label ?? null,
    notes: record.notes,
    assignedToId: record.assignedToId,
    assignedToName: record.assignedTo?.user.name ?? null,
    createdByName: record.createdByName,
    createdAt: record.createdAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    completedByName: record.completedByName,
    completionNotes: record.completionNotes,
    missedAt: record.missedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancelReason: record.cancelReason,
    rescheduledFromId: record.rescheduledFromId,
    lead: record.lead,
  };
}

/** All follow-ups of a lead: open ones first (soonest first), then the history (newest first). */
export async function listLeadFollowUps(
  ctx: ServiceContext,
  leadId: string,
): Promise<FollowUpRow[]> {
  ctx.permissions.assert(ACTIVITY_PERMISSIONS.followUpsView);
  await findVisibleLead(ctx, leadId);
  const records = await ctx.db.followUp.findMany({
    where: { leadId },
    include: rowInclude,
    orderBy: [{ dueAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const rows = records.map(toRow);
  const open = rows
    .filter((row) => OPEN.includes(row.status))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return [...open, ...rows.filter((row) => !OPEN.includes(row.status))];
}

/** Open follow-ups assigned to one person within `[from, to)` (or all when omitted), soonest first. */
export async function listOpenFollowUpsFor(
  db: TenantDbOrTx,
  assigneeIds: readonly string[] | null,
  options: { from?: Date; to?: Date; take?: number } = {},
): Promise<FollowUpRow[]> {
  const records = await db.followUp.findMany({
    where: {
      status: { in: OPEN },
      ...(assigneeIds ? { assignedToId: { in: [...assigneeIds] } } : {}),
      ...(options.from || options.to
        ? {
            dueAt: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lt: options.to } : {}),
            },
          }
        : {}),
      lead: { deletedAt: null },
    },
    include: rowInclude,
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: options.take ?? 500,
  });
  return records.map(toRow);
}

export { rowInclude as followUpRowInclude, toRow as toFollowUpRow };
