import type { AssignmentMethod } from "@/generated/prisma/enums";
import { findMembers } from "@/modules/identity";
import {
  findVisibleLead,
  LEAD_PERMISSIONS,
  recordLeadActivity,
  setLeadOwner,
  setLeadStatusByKey,
} from "@/modules/leads";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, ForbiddenError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import { isWithinScope, resolveDataScope, type ResolvedScope } from "@/platform/rbac/scope";
import type { ServiceContext } from "@/platform/tenant/context";

import { ASSIGNMENT_ACTIVITY_TYPES, MIN_REASON_LENGTH } from "../constants";
import { ASSIGNMENT_PERMISSIONS } from "../permissions";

/**
 * Lead ownership changes (M05-02, M05-03): every change closes the previous assignment record, opens a new one,
 * moves the status New ↔ Assigned where needed and writes timeline, audit and event in the same transaction.
 * Concurrency is optimistic: the change only applies if the lead still has the owner the person saw.
 */
export interface LeadForAssignment {
  id: string;
  number: string;
  ownerId: string | null;
  statusKey: string;
}

export interface OwnerChange {
  assigneeId: string | null;
  method: AssignmentMethod;
  reason?: string | null;
  reasonId?: string | null;
  ruleId?: string | null;
  ruleName?: string | null;
}

export type ChangeKind = "ASSIGN" | "REASSIGN" | "UNASSIGN";

/** Active members whose role can see leads — the people who may own leads. Map of membership id → name. */
export async function eligibleOwners(
  db: TenantDbOrTx,
  ids?: readonly string[],
): Promise<Map<string, string>> {
  const members = await findMembers(db, {
    ids,
    activeOnly: true,
    withPermission: LEAD_PERMISSIONS.view,
  });
  return new Map(members.map((member) => [member.membershipId, member.name]));
}

async function memberNames(db: TenantDbOrTx, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = ids.filter((id): id is string => Boolean(id));
  if (wanted.length === 0) return new Map();
  const members = await findMembers(db, { ids: wanted });
  return new Map(members.map((member) => [member.membershipId, member.name]));
}

export async function loadLeadForAssignment(
  db: TenantDbOrTx,
  ctx: ServiceContext,
  leadId: string,
): Promise<LeadForAssignment> {
  const lead = await findVisibleLead(ctx, leadId, {
    db,
    include: { status: { select: { key: true } } },
  });
  return { id: lead.id, number: lead.number, ownerId: lead.ownerId, statusKey: lead.status.key };
}

/** The scope of an assignment permission, or null when the person does not hold it. */
export async function assignmentScope(
  ctx: ServiceContext,
  permission: string,
): Promise<ResolvedScope | null> {
  return resolveDataScope(ctx, permission).catch(() => null);
}

/**
 * Checks that the actor may move `lead` to `assigneeId` (null = back to the queue): `leads.assign` for unassigned
 * leads, `leads.reassign` for owned ones; the current owner and the new one must be inside that permission's scope
 * (TEAM = the actor's reporting tree), and the new owner must be an active member who works on leads.
 */
export async function authorizeChange(
  db: TenantDbOrTx,
  ctx: ServiceContext,
  lead: LeadForAssignment,
  assigneeId: string | null,
): Promise<void> {
  const permission =
    lead.ownerId === null ? ASSIGNMENT_PERMISSIONS.assign : ASSIGNMENT_PERMISSIONS.reassign;
  const scope = await assignmentScope(ctx, permission);
  if (!scope) {
    throw new ForbiddenError(
      lead.ownerId === null
        ? "You are not allowed to assign leads."
        : "You are not allowed to reassign leads.",
      permission,
    );
  }
  if (lead.ownerId !== null && !isWithinScope(scope, lead.ownerId)) {
    throw new ForbiddenError(`${lead.number} belongs to someone outside your team.`, permission);
  }
  if (assigneeId !== null) {
    if (!isWithinScope(scope, assigneeId)) {
      throw new ValidationError(
        scope.scope === "OWN"
          ? "You can only take leads yourself."
          : "You can only assign leads to members of your team.",
        { assigneeId: ["Outside your team"] },
      );
    }
    if (!(await eligibleOwners(db, [assigneeId])).has(assigneeId)) {
      throw new ValidationError("Choose an active member who works on leads.", {
        assigneeId: ["Not an active member who can own leads"],
      });
    }
  }
}

export function requireReason(reason: string | null | undefined): string {
  const value = reason?.trim() ?? "";
  if (value.length < MIN_REASON_LENGTH) {
    throw new ValidationError(
      `Give a reason for the change (at least ${MIN_REASON_LENGTH} characters).`,
      { reason: ["A reason is required"] },
    );
  }
  return value;
}

export async function assertReasonCategory(
  db: TenantDbOrTx,
  reasonId: string | null | undefined,
): Promise<void> {
  if (!reasonId) return;
  const found = await db.reassignmentReason.findFirst({
    where: { id: reasonId, isActive: true },
    select: { id: true },
  });
  if (!found) {
    throw new ValidationError("Choose an active reason.", { reasonId: ["Unknown reason"] });
  }
}

async function moveStatus(
  db: TenantDbOrTx,
  ctx: ServiceContext,
  leadId: string,
  toKey: "ASSIGNED" | "NEW",
) {
  const target = await db.leadStatus.findFirst({
    where: { key: toKey, isActive: true },
    select: { id: true },
  });
  if (target) await setLeadStatusByKey(db, ctx, leadId, toKey);
}

/** Applies one ownership change inside `db` (a transaction). Callers authorize it first. */
export async function applyOwnerChange(
  db: TenantDbOrTx,
  ctx: ServiceContext,
  lead: LeadForAssignment,
  change: OwnerChange,
): Promise<ChangeKind> {
  if (lead.ownerId === change.assigneeId) {
    throw new ValidationError(
      change.assigneeId
        ? `${lead.number} already belongs to this person.`
        : `${lead.number} is not assigned to anyone.`,
      { assigneeId: ["Choose someone else"] },
    );
  }
  const kind: ChangeKind =
    lead.ownerId === null ? "ASSIGN" : change.assigneeId === null ? "UNASSIGN" : "REASSIGN";
  const changed = await setLeadOwner(db, lead.id, {
    ownerId: change.assigneeId,
    expectedOwnerId: lead.ownerId,
  });
  if (!changed) {
    throw new ConflictError(
      `${lead.number} was reassigned by someone else in the meantime. Reload and try again.`,
    );
  }

  const now = new Date();
  await db.leadAssignment.updateMany({
    where: { leadId: lead.id, endedAt: null },
    data: { endedAt: now },
  });
  const names = await memberNames(db, [change.assigneeId, lead.ownerId]);
  const to = change.assigneeId ? (names.get(change.assigneeId) ?? "a member") : null;
  const from = lead.ownerId ? (names.get(lead.ownerId) ?? "a member") : null;
  const reason = change.reason?.trim() || null;
  await db.leadAssignment.create({
    data: {
      organizationId: ctx.organizationId,
      leadId: lead.id,
      kind,
      method: change.method,
      assigneeId: change.assigneeId,
      previousOwnerId: lead.ownerId,
      assignedById: ctx.actor.type === "USER" ? (ctx.actor.membershipId ?? null) : null,
      assignedByName: ctx.actor.name,
      reason,
      reasonId: change.reasonId ?? null,
      ruleId: change.ruleId ?? null,
      assignedAt: now,
    },
  });

  if (change.assigneeId && lead.statusKey === "NEW") await moveStatus(db, ctx, lead.id, "ASSIGNED");
  if (!change.assigneeId && lead.statusKey === "ASSIGNED")
    await moveStatus(db, ctx, lead.id, "NEW");

  const how =
    change.method === "RULE" && change.ruleName
      ? ` by the rule "${change.ruleName}"`
      : change.method === "CREATOR"
        ? " (created by them)"
        : change.method === "DEACTIVATION"
          ? " (owner deactivated)"
          : "";
  const summary =
    kind === "ASSIGN"
      ? `Assigned to ${to}${how}`
      : kind === "REASSIGN"
        ? `Reassigned from ${from} to ${to}${how}`
        : `Returned to the unassigned queue by ${ctx.actor.name}${how}`;
  await recordLeadActivity(db, ctx, {
    leadId: lead.id,
    type:
      kind === "ASSIGN"
        ? ASSIGNMENT_ACTIVITY_TYPES.ASSIGNED
        : kind === "REASSIGN"
          ? ASSIGNMENT_ACTIVITY_TYPES.REASSIGNED
          : ASSIGNMENT_ACTIVITY_TYPES.UNASSIGNED,
    summary,
    payload: {
      assigneeId: change.assigneeId,
      assigneeName: to,
      previousOwnerId: lead.ownerId,
      previousOwnerName: from,
      method: change.method,
      reason,
      ruleId: change.ruleId ?? null,
    },
    // Assigning is not working the lead: "unworked" counts from here.
    touch: false,
  });
  await recordAudit(db, ctx, {
    action: `lead.${kind.toLowerCase()}`,
    entityType: "Lead",
    entityId: lead.id,
    summary: `${lead.number}: ${summary}`,
    changes: { owner: { from, to } },
    metadata: {
      method: change.method,
      reason,
      reasonId: change.reasonId ?? null,
      ruleId: change.ruleId ?? null,
    },
  });
  if (kind === "ASSIGN") {
    await publishEvent(db, ctx, "lead.assigned", {
      leadId: lead.id,
      assigneeId: change.assigneeId!,
      method: change.method,
      ruleId: change.ruleId ?? null,
    });
  } else if (kind === "REASSIGN") {
    await publishEvent(db, ctx, "lead.reassigned", {
      leadId: lead.id,
      assigneeId: change.assigneeId!,
      previousOwnerId: lead.ownerId!,
      method: change.method,
      reason,
    });
  } else {
    await publishEvent(db, ctx, "lead.unassigned", {
      leadId: lead.id,
      previousOwnerId: lead.ownerId!,
      method: change.method,
      reason,
    });
  }
  return kind;
}
