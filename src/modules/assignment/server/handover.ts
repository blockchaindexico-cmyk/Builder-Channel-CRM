import { deactivateMember, findMembers, IDENTITY_PERMISSIONS } from "@/modules/identity";
import { listOpenLeadIdsOfOwner } from "@/modules/leads";
import { ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { MAX_BULK_LEADS } from "../constants";
import { ASSIGNMENT_PERMISSIONS } from "../permissions";
import { type DeactivationHandoverInput, deactivationHandoverSchema } from "../schemas";
import { bulkAssign, type BulkAssignResult, unassignLead } from "./assign";
import { assignmentScope, eligibleOwners } from "./core";

/**
 * "Reassign & deactivate" (M05-09): before someone leaves, their open leads go to one or more colleagues in turn
 * (or back to the unassigned queue), each with the reason recorded; then the account is deactivated (M02). If a
 * lead cannot be moved, the person stays active so nothing is left behind.
 */
export interface HandoverSummary {
  membershipId: string;
  name: string;
  status: string;
  openLeads: number;
  canReassign: boolean;
}

export async function getHandoverSummary(
  ctx: ServiceContext,
  membershipId: string,
): Promise<HandoverSummary | null> {
  if (!ctx.permissions.has(IDENTITY_PERMISSIONS.usersManage)) return null;
  const [member] = await findMembers(ctx.db, { ids: [membershipId] });
  if (!member) return null;
  const leadIds = await listOpenLeadIdsOfOwner(ctx.db, membershipId);
  return {
    membershipId,
    name: member.name,
    status: member.status,
    openLeads: leadIds.length,
    canReassign: Boolean(await assignmentScope(ctx, ASSIGNMENT_PERMISSIONS.reassign)),
  };
}

export interface HandoverResult extends BulkAssignResult {
  unassigned: number;
  deactivated: boolean;
}

export async function handOverAndDeactivate(
  ctx: ServiceContext,
  input: DeactivationHandoverInput,
): Promise<HandoverResult> {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.usersManage);
  const values = parseInput(deactivationHandoverSchema, input);
  if (values.assigneeIds.includes(values.membershipId)) {
    throw new ValidationError("Choose colleagues other than the person leaving.", {
      assigneeIds: ["Includes the person leaving"],
    });
  }
  const eligible = await eligibleOwners(ctx.db, values.assigneeIds);
  if (eligible.size !== new Set(values.assigneeIds).size) {
    throw new ValidationError("Choose active members who work on leads.", {
      assigneeIds: ["Not all can own leads"],
    });
  }

  const leadIds = await listOpenLeadIdsOfOwner(ctx.db, values.membershipId);
  let result: BulkAssignResult = { assigned: 0, skipped: [] };
  let unassigned = 0;
  if (leadIds.length) {
    if (values.assigneeIds.length) {
      for (let start = 0; start < leadIds.length; start += MAX_BULK_LEADS) {
        const chunk = await bulkAssign(
          ctx,
          {
            leadIds: leadIds.slice(start, start + MAX_BULK_LEADS),
            // Continue the turns where the previous chunk stopped.
            assigneeIds: values.assigneeIds.map(
              (_, index) =>
                values.assigneeIds[(index + result.assigned) % values.assigneeIds.length]!,
            ),
            reason: values.reason,
          },
          "DEACTIVATION",
        );
        result = {
          assigned: result.assigned + chunk.assigned,
          skipped: [...result.skipped, ...chunk.skipped],
        };
      }
    } else {
      for (const leadId of leadIds) {
        try {
          await unassignLead(
            ctx,
            { leadId, expectedOwnerId: values.membershipId, reason: values.reason },
            "DEACTIVATION",
          );
          unassigned += 1;
        } catch (error) {
          result.skipped.push({
            leadId,
            number: null,
            reason: error instanceof Error ? error.message : "Could not be moved",
          });
        }
      }
    }
  }
  if (result.skipped.length) return { ...result, unassigned, deactivated: false };
  await deactivateMember(ctx, values.membershipId);
  return { ...result, unassigned, deactivated: true };
}
