import type { SiteVisit } from "@/generated/prisma/client";
import { formatTime } from "@/lib/format";
import { cancelReminder, scheduleReminder } from "@/modules/notifications";
import type { RegionalSettings } from "@/modules/organization";
import type { TenantTx } from "@/platform/db/tenant-scope";
import type { ServiceContext } from "@/platform/tenant/context";

import { getDealSettings } from "./settings";

/**
 * Visit and revisit reminders through M06 (M08-03, PRD §18): one per visit, keyed by the visit, sent to its
 * executive the organization's visit reminder time before it starts (or at the time itself when that moment has
 * passed). Moving or re-targeting a visit re-schedules the same reminder; closing it cancels the reminder.
 */
export const visitReminderKey = (visitId: string) => `visit:${visitId}`;

export async function scheduleVisitReminder(
  tx: TenantTx,
  ctx: ServiceContext,
  visit: Pick<
    SiteVisit,
    | "id"
    | "scheduledAt"
    | "assignedToId"
    | "isRevisit"
    | "pickupRequired"
    | "pickupAddress"
    | "notes"
  >,
  context: {
    lead: { id: string; number: string; name: string };
    projectName: string;
    regional: RegionalSettings;
  },
  now: Date = new Date(),
): Promise<void> {
  const key = visitReminderKey(visit.id);
  if (!visit.assignedToId) {
    await cancelReminder(tx, ctx, key);
    return;
  }
  const { visitReminderMinutes } = await getDealSettings(tx, ctx);
  const before = new Date(visit.scheduledAt.getTime() - visitReminderMinutes * 60_000);
  const fireAt = before > now ? before : visit.scheduledAt > now ? visit.scheduledAt : null;
  if (!fireAt) {
    await cancelReminder(tx, ctx, key);
    return;
  }
  const { lead, projectName, regional } = context;
  await scheduleReminder(tx, ctx, {
    dedupeKey: key,
    recipientId: visit.assignedToId,
    fireAt,
    title: `${visit.isRevisit ? "Revisit" : "Site visit"} at ${formatTime(visit.scheduledAt, regional)}: ${lead.number} · ${lead.name} — ${projectName}`,
    body:
      [
        visit.pickupRequired
          ? `Pickup${visit.pickupAddress ? ` from ${visit.pickupAddress}` : " needed"}`
          : null,
        visit.notes,
      ]
        .filter(Boolean)
        .join("\n") || null,
    link: `/leads/${lead.id}?tab=visits`,
    entity: { type: "SiteVisit", id: visit.id },
  });
}

export async function cancelVisitReminder(
  tx: TenantTx,
  ctx: ServiceContext,
  visitId: string,
): Promise<void> {
  await cancelReminder(tx, ctx, visitReminderKey(visitId));
}
