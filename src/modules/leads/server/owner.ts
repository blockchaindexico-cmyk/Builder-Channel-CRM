import type { TenantDbOrTx } from "@/platform/db/tenant-scope";

/**
 * Owner changes requested by the assignment module (M05). The leads module owns the lead row; the assignment
 * module decides who gets it and records the history. Optimistic: returns false when the owner is no longer
 * `expectedOwnerId` because someone else changed it in the meantime.
 */
export async function setLeadOwner(
  tx: TenantDbOrTx,
  leadId: string,
  change: { ownerId: string | null; expectedOwnerId: string | null },
): Promise<boolean> {
  const { count } = await tx.lead.updateMany({
    where: { id: leadId, deletedAt: null, ownerId: change.expectedOwnerId },
    data: { ownerId: change.ownerId, ownerAssignedAt: change.ownerId ? new Date() : null },
  });
  return count === 1;
}
