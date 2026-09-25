import type { LeadStatusChangingHook } from "@/modules/leads";
import {
  findVisibleLead,
  isLeadInScope,
  setLeadMilestones,
  setLeadStatusByKey,
} from "@/modules/leads";
import type { TenantTx } from "@/platform/db/tenant-scope";
import { ConflictError, ForbiddenError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { LOSS_STATUS_SCOPE } from "../constants";
import { DEAL_PERMISSIONS } from "../permissions";
import { type MarkLostInput, markLostSchema } from "../schemas";
import { requireLossReason } from "./masters";
import { cancelOpenVisitsOfLead } from "./visits";

/**
 * Closing a lead (M08-11), whichever way its status changes — the status dialog, a bulk change, the call dialog or
 * the Mark Lost dialog (`lead.status.changing` hook):
 * - Lost / Not Interested need `leads.mark_lost` for the lead and a loss reason for that status, kept on the lead
 *   (`lossReasonId`, cleared on reopen) and in the timeline; `lead.lost` / `lead.not_interested` are published.
 * - A lead with an open booking is not closed as lost or invalid: the booking is cancelled instead, which closes
 *   the lead with the cancellation reason.
 * - Upcoming visits of a lead closed as lost, not interested or invalid are cancelled.
 */
export const closeLeadHook: LeadStatusChangingHook = async ({
  tx,
  ctx,
  lead,
  to,
  details,
  workflow,
}) => {
  if (to.category !== "LOST" && to.category !== "INVALID") return;
  const open = await tx.booking.findFirst({
    where: { leadId: lead.id, status: "ACTIVE" },
    select: { number: true },
  });
  if (open) {
    throw new ConflictError(
      `${lead.number} has an open booking (${open.number}). Cancel the booking instead — that closes the lead.`,
    );
  }
  let result: Awaited<ReturnType<LeadStatusChangingHook>> = undefined;
  if (to.category === "LOST") {
    if (!workflow && !(await isLeadInScope(ctx, lead, DEAL_PERMISSIONS.markLost))) {
      throw new ForbiddenError(
        `Only people allowed to mark leads lost can move a lead to "${to.label}".`,
        DEAL_PERMISSIONS.markLost,
      );
    }
    // Cancelling a booking closes the lead with the cancellation reason.
    const scope =
      workflow && details.lossScope === "BOOKING_CANCELLED"
        ? "BOOKING_CANCELLED"
        : (LOSS_STATUS_SCOPE[to.key] ?? "LOST");
    const reason = await requireLossReason(tx, details.lossReasonId, scope);
    await setLeadMilestones(tx, lead.id, { lossReasonId: reason.id });
    await publishEvent(tx, ctx, to.key === "NOT_INTERESTED" ? "lead.not_interested" : "lead.lost", {
      leadId: lead.id,
      lossReasonId: reason.id,
      statusKey: to.key,
    });
    result = {
      note: `Loss reason: ${reason.label}`,
      payload: { lossReason: { id: reason.id, label: reason.label } },
    };
  }
  await cancelOpenVisitsOfLead(tx as TenantTx, ctx, lead.id, `Lead closed as "${to.label}"`);
  return result;
};

/** "Mark lost / not interested" (M08-11): the status, a loss reason for it and a note, in one step. */
export async function markLeadLost(
  ctx: ServiceContext,
  input: MarkLostInput,
): Promise<{ status: string }> {
  const values = parseInput(markLostSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, values.leadId, {
      permission: DEAL_PERMISSIONS.markLost,
      db: tx,
    });
    const changed = await setLeadStatusByKey(tx, ctx, lead.id, values.statusKey, values.notes, {
      workflow: false,
      details: { lossReasonId: values.lossReasonId },
    });
    if (!changed) throw new ConflictError(`${lead.number} is closed that way already.`);
    return { status: changed.to.label };
  });
}
