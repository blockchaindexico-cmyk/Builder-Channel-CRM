import { getRequestContext } from "@/platform/tenant/request-context";

import { getHandoverSummary } from "../server/handover";
import { HandoverWizard } from "./handover-wizard";

/** "Hand over leads & deactivate" on a user's page when they still own open leads (M05-09). */
export async function HandoverAction({ membershipId }: { membershipId: string }) {
  const ctx = await getRequestContext();
  if (membershipId === ctx.actor.membershipId) return null;
  const summary = await getHandoverSummary(ctx, membershipId);
  if (
    !summary ||
    summary.status === "INACTIVE" ||
    !summary.canReassign ||
    summary.openLeads === 0
  ) {
    return null;
  }
  return (
    <HandoverWizard membershipId={membershipId} name={summary.name} openLeads={summary.openLeads} />
  );
}
