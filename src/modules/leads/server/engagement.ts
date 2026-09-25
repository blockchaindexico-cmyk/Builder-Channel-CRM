import type { TenantDbOrTx } from "@/platform/db/tenant-scope";

/** Call and follow-up summary kept on the lead for lists and filters; maintained by M07 in its transactions. */
export interface LeadEngagement {
  lastCallAt?: Date | null;
  lastContactedAt?: Date | null;
  /** Unanswered calls since the customer was last reached. */
  callAttempts?: number;
  lastCallOutcomeId?: string | null;
  /** Earliest open follow-up or callback. */
  nextFollowUpAt?: Date | null;
}

export async function setLeadEngagement(
  db: TenantDbOrTx,
  leadId: string,
  data: LeadEngagement,
): Promise<void> {
  await db.lead.update({ where: { id: leadId }, data });
}
