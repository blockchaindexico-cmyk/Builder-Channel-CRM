import { setLeadStatusByKey } from "@/modules/leads";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import type { ServiceContext } from "@/platform/tenant/context";

/** How far along the funnel a status is (M08 status automation). */
const FUNNEL_RANK: Record<string, number> = { VISIT: 1, REVISIT: 2, BOOKING: 3, CLOSED_WON: 4 };

function rankOf(status: { key: string; category: string }): number {
  if (FUNNEL_RANK[status.key] !== undefined) return FUNNEL_RANK[status.key]!;
  if (status.category === "BOOKING") return FUNNEL_RANK.BOOKING!;
  if (status.category === "WON") return FUNNEL_RANK.CLOSED_WON!;
  return 0;
}

export interface LeadStatusSnapshot {
  key: string;
  label: string;
  category: string;
  isTerminal: boolean;
}

export async function leadStatusOf(db: TenantDbOrTx, leadId: string): Promise<LeadStatusSnapshot> {
  const lead = await db.lead.findFirstOrThrow({
    where: { id: leadId },
    select: { status: { select: { key: true, label: true, category: true, isTerminal: true } } },
  });
  return lead.status;
}

/**
 * Moves the lead forward to Visit, Revisit, Booking or Closed/Won as its visits and bookings progress (M08 business
 * rules) — never backwards (a booked lead stays booked when a revisit is planned) and never out of a closed status.
 * Returns the change, or null when the status stays.
 */
export async function advanceLeadStatus(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  leadId: string,
  key: "VISIT" | "REVISIT" | "BOOKING" | "CLOSED_WON",
  reason: string,
) {
  const current = await leadStatusOf(tx, leadId);
  if (current.isTerminal && key !== "CLOSED_WON") return null;
  if (current.category === "WON" || current.category === "INVALID") return null;
  if (!current.isTerminal && rankOf(current) >= FUNNEL_RANK[key]!) return null;
  return setLeadStatusByKey(tx, ctx, leadId, key, reason, { workflow: true });
}
