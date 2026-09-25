import { LEAD_PERMISSIONS, type LeadCreatedHook } from "@/modules/leads";
import { isAppError, ValidationError } from "@/platform/errors";
import { resolveDataScope } from "@/platform/rbac/scope";

import { applyOwnerChange, authorizeChange, type LeadForAssignment } from "./core";
import { pickByRules } from "./rules";
import { getAssignmentSettings } from "./settings";

/**
 * Who owns a new lead (M05-06, M05-10), decided inside the transaction that creates it:
 * 1. the owner the creator chose ("Assign to", an import's owner column) — checked like a manual assignment;
 * 2. otherwise the creator, when they only work on their own leads (executives) and the setting is on;
 * 3. otherwise the first matching assignment rule; else the lead waits in the unassigned queue.
 */
export const assignNewLead: LeadCreatedHook = async ({
  tx,
  ctx,
  lead,
  requestedOwnerId,
  importBatchId,
}) => {
  const target: LeadForAssignment = {
    id: lead.id,
    number: lead.number,
    ownerId: null,
    statusKey: lead.statusKey,
  };

  if (requestedOwnerId) {
    try {
      await authorizeChange(tx, ctx, target, requestedOwnerId);
    } catch (error) {
      // Reported on the owner field (a form error, or an import row error) instead of failing the whole request.
      if (isAppError(error)) {
        throw new ValidationError(error.message, { assigneeId: [error.message] });
      }
      throw error;
    }
    await applyOwnerChange(tx, ctx, target, {
      assigneeId: requestedOwnerId,
      method: importBatchId ? "IMPORT" : "MANUAL",
    });
    return;
  }

  const settings = await getAssignmentSettings(tx, ctx);
  const self = ctx.actor.type === "USER" ? ctx.actor.membershipId : null;
  if (requestedOwnerId === undefined && settings.assignCreator && self) {
    const scope = await resolveDataScope(ctx, LEAD_PERMISSIONS.view).catch(() => null);
    if (scope?.scope === "OWN") {
      await applyOwnerChange(tx, ctx, target, { assigneeId: self, method: "CREATOR" });
      return;
    }
  }

  const picked = await pickByRules(tx, ctx, {
    channel: lead.channel,
    sourceId: lead.sourceId,
    campaignId: lead.campaignId,
    projectIds: lead.projectIds,
  });
  if (picked) {
    await applyOwnerChange(tx, ctx, target, {
      assigneeId: picked.memberId,
      method: "RULE",
      ruleId: picked.ruleId,
      ruleName: picked.ruleName,
    });
  }
};
