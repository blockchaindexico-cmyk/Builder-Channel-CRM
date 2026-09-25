import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import type { ServiceContext } from "@/platform/tenant/context";

/**
 * Conversion milestones kept on the lead for lists and reports, maintained by M08 in its transactions (the status
 * change itself keeps `closedAt` and `lostAt`).
 */
export interface LeadMilestones {
  /** First completed site visit. */
  firstVisitAt?: Date | null;
  /** First booking. */
  bookedAt?: Date | null;
  /** Why the lead is lost or not interested (cleared when it is reopened). */
  lossReasonId?: string | null;
}

export async function setLeadMilestones(
  db: TenantDbOrTx,
  leadId: string,
  data: LeadMilestones,
): Promise<void> {
  await db.lead.update({ where: { id: leadId }, data });
}

/**
 * Adds a project to the lead's interests when it is not there yet (M08: a visit or booking of a project the lead had
 * not listed). Returns true when it was added.
 */
export async function ensureLeadInterest(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
  leadId: string,
  projectId: string,
): Promise<boolean> {
  const existing = await db.leadProjectInterest.findFirst({
    where: { leadId, projectId },
    select: { projectId: true },
  });
  if (existing) return false;
  await db.leadProjectInterest.create({
    data: { organizationId: ctx.organizationId, leadId, projectId, level: "HIGH" },
  });
  return true;
}
