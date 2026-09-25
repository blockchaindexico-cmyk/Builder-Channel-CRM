import { getServerRegistry } from "@/modules/registry.server";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { LEAD_ACTIVITY_TYPES, SYSTEM_DRIVEN_STATUS_KEYS } from "../constants";
import type { LeadStatusInfo } from "../extensions";
import { LEAD_PERMISSIONS } from "../permissions";
import { type ChangeStatusInput, changeStatusSchema, type StatusDetails } from "../schemas";
import { findVisibleLead } from "./scope";
import { recordLeadActivity } from "./timeline";

interface StatusChange {
  statusId: string;
  reason?: string | null;
  /** Answers of other modules' status fields, e.g. `{ lossReasonId }` (M08). */
  details?: StatusDetails | null;
}

const statusInfo = (status: {
  key: string;
  label: string;
  category: string;
  isTerminal: boolean;
}): LeadStatusInfo => ({
  key: status.key,
  label: status.label,
  category: status.category,
  isTerminal: status.isTerminal,
});

/**
 * Applies a status change inside `tx` (M04-08): validates the transition, writes `LeadStatusHistory`, a timeline
 * entry and an audit entry, and publishes `lead.status_changed`.
 * - Terminal → non-terminal is a reopen and needs `leads.reopen`.
 * - Workflow statuses (New, Assigned, Visit, Revisit, Booking, Closed/Won) need `leads.status_override` unless
 *   `workflow` is set by the module that owns that workflow.
 * - Statuses marked "requires reason" need a reason.
 * - Other modules' `lead.status.changing` hooks run before anything is saved and may refuse the change (M08: a loss
 *   reason for Lost / Not Interested).
 * - Milestones: `closedAt` while closed as won, `lostAt` while lost or not interested (cleared on reopen, with the
 *   loss reason).
 */
export async function applyStatusChange(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  lead: { id: string; number: string; statusId: string; ownerId: string | null },
  change: StatusChange,
  options: { workflow?: boolean } = {},
) {
  const current = await tx.leadStatus.findFirstOrThrow({ where: { id: lead.statusId } });
  const target = await tx.leadStatus.findFirst({ where: { id: change.statusId } });
  if (!target || !target.isActive) {
    throw new ValidationError("Choose an active status.", {
      statusId: ["Unknown or inactive status"],
    });
  }
  if (target.id === current.id) {
    throw new ValidationError(`The lead is already "${target.label}".`, {
      statusId: ["Choose a different status"],
    });
  }
  const reopened = current.isTerminal && !target.isTerminal;
  if (reopened && !ctx.permissions.has(LEAD_PERMISSIONS.reopen)) {
    throw new ForbiddenError(
      `Only people allowed to reopen leads can move a lead out of "${current.label}".`,
      LEAD_PERMISSIONS.reopen,
    );
  }
  if (
    !options.workflow &&
    SYSTEM_DRIVEN_STATUS_KEYS.includes(target.key) &&
    !ctx.permissions.has(LEAD_PERMISSIONS.statusOverride)
  ) {
    throw new ForbiddenError(
      `"${target.label}" is set automatically by its workflow.`,
      LEAD_PERMISSIONS.statusOverride,
    );
  }
  const reason = change.reason?.trim() || null;
  if (target.requiresReason && !reason) {
    throw new ValidationError(`Give a reason for "${target.label}".`, {
      reason: ["A reason is required"],
    });
  }

  const notes: string[] = [];
  let extraPayload: Record<string, unknown> = {};
  for (const hook of getServerRegistry().extensions("lead.status.changing")) {
    const result = await hook({
      tx,
      ctx,
      lead: { id: lead.id, number: lead.number, ownerId: lead.ownerId },
      from: statusInfo(current),
      to: statusInfo(target),
      reason,
      details: change.details ?? {},
      workflow: Boolean(options.workflow),
    });
    if (result?.note) notes.push(result.note);
    if (result?.payload) extraPayload = { ...extraPayload, ...result.payload };
  }
  const note = notes.length ? ` · ${notes.join(" · ")}` : "";

  const now = new Date();
  await tx.lead.update({
    where: { id: lead.id },
    data: {
      statusId: target.id,
      statusChangedAt: now,
      closedAt: target.category === "WON" ? now : null,
      lostAt: target.category === "LOST" ? now : null,
      ...(target.category === "LOST" ? {} : { lossReasonId: null }),
    },
  });
  await tx.leadStatusHistory.create({
    data: {
      organizationId: ctx.organizationId,
      leadId: lead.id,
      fromStatusId: current.id,
      toStatusId: target.id,
      reason,
      changedById: ctx.actor.id,
      changedByName: ctx.actor.name,
      changedAt: now,
    },
  });
  await recordLeadActivity(tx, ctx, {
    leadId: lead.id,
    type: LEAD_ACTIVITY_TYPES.STATUS_CHANGED,
    summary: `${reopened ? "Reopened" : "Changed status"}: ${current.label} → ${target.label}${note}`,
    payload: {
      ...extraPayload,
      from: { key: current.key, label: current.label, color: current.color },
      to: { key: target.key, label: target.label, color: target.color },
      reason,
      reopened,
    },
    occurredAt: now,
  });
  await recordAudit(tx, ctx, {
    action: reopened ? "lead.reopen" : "lead.status_change",
    entityType: "Lead",
    entityId: lead.id,
    summary: `${lead.number}: ${current.label} → ${target.label}${reason ? ` (${reason})` : ""}${note}`,
    changes: { status: { from: current.label, to: target.label } },
    metadata: reason || notes.length ? { reason, notes } : undefined,
  });
  await publishEvent(tx, ctx, "lead.status_changed", {
    leadId: lead.id,
    fromStatusKey: current.key,
    toStatusKey: target.key,
    reason,
    reopened,
  });
  return { from: current, to: target, reopened };
}

/** Status change by a person from the lead page or a bulk action (M04-08). */
export async function changeLeadStatus(
  ctx: ServiceContext,
  leadId: string,
  input: ChangeStatusInput,
) {
  const values = parseInput(changeStatusSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, leadId, {
      permission: LEAD_PERMISSIONS.changeStatus,
      db: tx,
    });
    const result = await applyStatusChange(tx, ctx, lead, values);
    return { from: result.from.label, to: result.to.label, reopened: result.reopened };
  });
}

/**
 * Status change driven by another module's workflow (M05 assignment, M07 calls, M08 visits/bookings): addresses
 * the status by its system key and skips the manual-override rule. Call it inside that module's transaction.
 * With `workflow: false` the change counts as the person's own choice (e.g. picked in M07's call dialog), so the
 * manual rules apply: workflow statuses need `leads.status_override`.
 */
export async function setLeadStatusByKey(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  leadId: string,
  key: string,
  reason?: string | null,
  options: { workflow?: boolean; details?: StatusDetails | null } = {},
) {
  const lead = await tx.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { id: true, number: true, statusId: true, ownerId: true },
  });
  const status = await tx.leadStatus.findFirst({ where: { key }, select: { id: true } });
  if (!lead) throw new NotFoundError("Lead", leadId);
  if (!status) throw new NotFoundError("Lead status", key);
  if (lead.statusId === status.id) return null;
  return applyStatusChange(
    tx,
    ctx,
    lead,
    { statusId: status.id, reason, details: options.details },
    { workflow: options.workflow ?? true },
  );
}

/** Bulk status change (M04-15): each lead is checked individually; failures are reported, not fatal. */
export async function bulkChangeLeadStatus(
  ctx: ServiceContext,
  leadIds: string[],
  input: ChangeStatusInput,
): Promise<{
  changed: number;
  skipped: { leadId: string; number: string | null; reason: string }[];
}> {
  const values = parseInput(changeStatusSchema, input);
  let changed = 0;
  const skipped: { leadId: string; number: string | null; reason: string }[] = [];
  for (const leadId of [...new Set(leadIds)].slice(0, 500)) {
    try {
      await ctx.db.$transaction(async (tx) => {
        const lead = await findVisibleLead(ctx, leadId, {
          permission: LEAD_PERMISSIONS.changeStatus,
          db: tx,
        });
        try {
          await applyStatusChange(tx, ctx, lead, values);
        } catch (error) {
          (error as { leadNumber?: string }).leadNumber = lead.number;
          throw error;
        }
      });
      changed += 1;
    } catch (error) {
      skipped.push({
        leadId,
        number: (error as { leadNumber?: string }).leadNumber ?? null,
        reason: (error as Error).message,
      });
    }
  }
  return { changed, skipped };
}

/** Status history of a lead, newest first. */
export async function listStatusHistory(ctx: ServiceContext, leadId: string) {
  await findVisibleLead(ctx, leadId);
  const rows = await ctx.db.leadStatusHistory.findMany({
    where: { leadId },
    orderBy: { changedAt: "desc" },
  });
  const statusIds = [
    ...new Set(rows.flatMap((row) => [row.fromStatusId, row.toStatusId]).filter(Boolean)),
  ] as string[];
  const statuses = await ctx.db.leadStatus.findMany({
    where: { id: { in: statusIds } },
    select: { id: true, label: true, color: true },
  });
  const byId = new Map(statuses.map((status) => [status.id, status]));
  return rows.map((row) => ({
    id: row.id,
    from: row.fromStatusId ? (byId.get(row.fromStatusId) ?? null) : null,
    to: byId.get(row.toStatusId) ?? null,
    reason: row.reason,
    changedByName: row.changedByName,
    changedAt: row.changedAt.toISOString(),
  }));
}
