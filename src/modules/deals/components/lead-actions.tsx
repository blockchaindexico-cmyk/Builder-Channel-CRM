import "server-only";

import type { LeadActionTarget } from "@/modules/leads";
import { isLeadInScope } from "@/modules/leads";
import { getRequestContext } from "@/platform/tenant/request-context";

import { DEAL_PERMISSIONS } from "../permissions";
import { LeadDealButtons } from "./lead-deal-buttons";

/** Visit, booking and closing actions in the lead page header, for people allowed to on this lead. */
export async function LeadDealActions({ lead }: { lead: LeadActionTarget }) {
  if (lead.isTerminal && lead.statusCategory !== "WON") return null;
  const ctx = await getRequestContext();
  const [canVisit, canBook, canMarkLost] = await Promise.all([
    isLeadInScope(ctx, lead, DEAL_PERMISSIONS.visitsManage),
    isLeadInScope(ctx, lead, DEAL_PERMISSIONS.bookingsManage),
    isLeadInScope(ctx, lead, DEAL_PERMISSIONS.markLost),
  ]);
  const open = !lead.isTerminal;
  return (
    <LeadDealButtons
      lead={{ id: lead.id, number: lead.number, name: lead.name }}
      canVisit={canVisit && open}
      canBook={canBook && lead.statusCategory !== "LOST" && lead.statusCategory !== "INVALID"}
      canMarkLost={canMarkLost && open && lead.statusCategory !== "BOOKING"}
      bookFirst={["VISIT", "REVISIT"].includes(lead.statusKey)}
    />
  );
}
