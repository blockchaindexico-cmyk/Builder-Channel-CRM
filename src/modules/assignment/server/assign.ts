import type { AssignmentKind, AssignmentMethod } from "@/generated/prisma/enums";
import { countOpenLeadsByOwner, findVisibleLead } from "@/modules/leads";
import { ConflictError, isAppError } from "@/platform/errors";
import { isWithinScope } from "@/platform/rbac/scope";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { ASSIGNMENT_PERMISSIONS } from "../permissions";
import {
  type AssignLeadInput,
  assignLeadSchema,
  type BulkAssignInput,
  bulkAssignSchema,
  type UnassignLeadInput,
  unassignLeadSchema,
} from "../schemas";
import {
  applyOwnerChange,
  assertReasonCategory,
  assignmentScope,
  authorizeChange,
  type ChangeKind,
  eligibleOwners,
  loadLeadForAssignment,
  requireReason,
} from "./core";

function assertExpectedOwner(
  lead: { number: string; ownerId: string | null },
  expected: string | null,
) {
  if (lead.ownerId !== expected) {
    throw new ConflictError(
      `${lead.number} was reassigned by someone else in the meantime. Reload and try again.`,
    );
  }
}

/** Assign an unassigned lead, or reassign an owned one with a reason (M05-02, M05-03). */
export async function assignLead(
  ctx: ServiceContext,
  input: AssignLeadInput,
): Promise<{ kind: ChangeKind }> {
  const values = parseInput(assignLeadSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const lead = await loadLeadForAssignment(tx, ctx, values.leadId);
    assertExpectedOwner(lead, values.expectedOwnerId);
    await authorizeChange(tx, ctx, lead, values.assigneeId);
    const reason = lead.ownerId === null ? values.reason : requireReason(values.reason);
    await assertReasonCategory(tx, values.reasonId);
    const kind = await applyOwnerChange(tx, ctx, lead, {
      assigneeId: values.assigneeId,
      method: "MANUAL",
      reason,
      reasonId: values.reasonId,
    });
    return { kind };
  });
}

/** Puts an owned lead back into the unassigned queue (reason required). */
export async function unassignLead(
  ctx: ServiceContext,
  input: UnassignLeadInput,
  method: AssignmentMethod = "MANUAL",
): Promise<void> {
  const values = parseInput(unassignLeadSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const lead = await loadLeadForAssignment(tx, ctx, values.leadId);
    assertExpectedOwner(lead, values.expectedOwnerId);
    await authorizeChange(tx, ctx, lead, null);
    const reason = requireReason(values.reason);
    await assertReasonCategory(tx, values.reasonId);
    await applyOwnerChange(tx, ctx, lead, {
      assigneeId: null,
      method,
      reason,
      reasonId: values.reasonId,
    });
  });
}

export interface BulkAssignResult {
  assigned: number;
  skipped: { leadId: string; number: string | null; reason: string }[];
}

/**
 * Bulk assignment (M05-05): one member gets every selected lead, several members get them in turn (oldest lead
 * first). Each lead is checked and changed on its own; leads that cannot be changed are reported, not fatal.
 * Leads that belong to someone need the batch's reason.
 */
export async function bulkAssign(
  ctx: ServiceContext,
  input: BulkAssignInput,
  method: AssignmentMethod = "BULK",
): Promise<BulkAssignResult> {
  const values = parseInput(bulkAssignSchema, input);
  const skipped: BulkAssignResult["skipped"] = [];
  let assigned = 0;
  for (const id of new Set(values.leadIds)) {
    const assigneeId = values.assigneeIds[assigned % values.assigneeIds.length]!;
    let number: string | null = null;
    try {
      await ctx.db.$transaction(async (tx) => {
        const lead = await loadLeadForAssignment(tx, ctx, id);
        number = lead.number;
        await authorizeChange(tx, ctx, lead, assigneeId);
        const reason = lead.ownerId === null ? values.reason : requireReason(values.reason);
        await assertReasonCategory(tx, values.reasonId);
        await applyOwnerChange(tx, ctx, lead, {
          assigneeId,
          method,
          reason,
          reasonId: values.reasonId,
        });
      });
      assigned += 1;
    } catch (error) {
      if (!isAppError(error)) throw error;
      skipped.push({ leadId: id, number, reason: error.message });
    }
  }
  return { assigned, skipped };
}

export interface AssignableMember {
  membershipId: string;
  name: string;
  openLeads: number;
  isMe: boolean;
}

/**
 * Members the actor may give leads to (their scope of `leads.assign` or `leads.reassign`), with their current
 * number of open leads so the load can be balanced. Empty when the actor may not assign at all.
 */
export async function listAssignableMembers(
  ctx: ServiceContext,
  permission: string = ASSIGNMENT_PERMISSIONS.assign,
): Promise<AssignableMember[]> {
  const scope = await assignmentScope(ctx, permission);
  if (!scope) return [];
  const eligible = await eligibleOwners(ctx.db);
  const ids = [...eligible.keys()].filter((id) => isWithinScope(scope, id));
  if (ids.length === 0) return [];
  const open = await countOpenLeadsByOwner(ctx.db, ids);
  return ids.map((id) => ({
    membershipId: id,
    name: eligible.get(id)!,
    openLeads: open.get(id) ?? 0,
    isMe: id === ctx.actor.membershipId,
  }));
}

export interface AssignmentHistoryRow {
  id: string;
  kind: AssignmentKind;
  method: AssignmentMethod;
  assigneeName: string | null;
  previousOwnerName: string | null;
  assignedByName: string;
  reason: string | null;
  reasonLabel: string | null;
  ruleName: string | null;
  assignedAt: string;
  endedAt: string | null;
}

/** Every ownership change of a lead, newest first (M05-04). */
export async function listAssignmentHistory(
  ctx: ServiceContext,
  leadId: string,
): Promise<AssignmentHistoryRow[]> {
  await findVisibleLead(ctx, leadId);
  const rows = await ctx.db.leadAssignment.findMany({
    where: { leadId },
    orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
    include: {
      assignee: { select: { user: { select: { name: true } } } },
      previousOwner: { select: { user: { select: { name: true } } } },
      reasonCategory: { select: { label: true } },
      rule: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    method: row.method,
    assigneeName: row.assignee?.user.name ?? null,
    previousOwnerName: row.previousOwner?.user.name ?? null,
    assignedByName: row.assignedByName,
    reason: row.reason,
    reasonLabel: row.reasonCategory?.label ?? null,
    ruleName: row.rule?.name ?? null,
    assignedAt: row.assignedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  }));
}
