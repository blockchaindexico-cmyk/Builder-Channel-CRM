import type { FollowUp } from "@/generated/prisma/client";
import { formatTime } from "@/lib/format";
import { cancelReminder, getNotificationSettings, scheduleReminder } from "@/modules/notifications";
import type { RegionalSettings } from "@/modules/organization";
import type { TenantTx } from "@/platform/db/tenant-scope";
import type { ServiceContext } from "@/platform/tenant/context";

/**
 * Reminders of follow-ups and callbacks through M06 (M07-13): one per item, keyed by the follow-up, sent the
 * organization's reminder lead time before it is due (or at the time itself when that moment has already passed).
 * Moving or re-targeting a follow-up re-schedules the same reminder; closing it cancels the reminder.
 */
export const followUpReminderKey = (followUpId: string) => `followup:${followUpId}`;

export async function scheduleFollowUpReminder(
  tx: TenantTx,
  ctx: ServiceContext,
  followUp: Pick<FollowUp, "id" | "type" | "dueAt" | "assignedToId" | "notes">,
  lead: { id: string; number: string; name: string },
  purposeLabel: string | null,
  regional: RegionalSettings,
  now: Date = new Date(),
): Promise<void> {
  const key = followUpReminderKey(followUp.id);
  if (!followUp.assignedToId) {
    await cancelReminder(tx, ctx, key);
    return;
  }
  const { reminderLeadMinutes } = await getNotificationSettings(tx, ctx);
  const before = new Date(followUp.dueAt.getTime() - reminderLeadMinutes * 60_000);
  const fireAt = before > now ? before : followUp.dueAt > now ? followUp.dueAt : null;
  if (!fireAt) {
    await cancelReminder(tx, ctx, key);
    return;
  }
  const kind = followUp.type === "CALLBACK" ? "Callback" : "Follow-up";
  await scheduleReminder(tx, ctx, {
    dedupeKey: key,
    recipientId: followUp.assignedToId,
    fireAt,
    title: `${kind} at ${formatTime(followUp.dueAt, regional)}: ${lead.number} · ${lead.name}`,
    body: [purposeLabel, followUp.notes].filter(Boolean).join("\n") || null,
    link: `/leads/${lead.id}`,
    entity: { type: "FollowUp", id: followUp.id },
  });
}

export async function cancelFollowUpReminder(
  tx: TenantTx,
  ctx: ServiceContext,
  followUpId: string,
): Promise<void> {
  await cancelReminder(tx, ctx, followUpReminderKey(followUpId));
}
