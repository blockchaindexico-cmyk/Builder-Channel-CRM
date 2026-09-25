import type { TenantTx } from "@/platform/db/tenant-scope";
import { ValidationError } from "@/platform/errors";
import { enqueueJob } from "@/platform/jobs/enqueue";
import type { Logger } from "@/platform/logger";
import { createSystemContext, type ServiceContext } from "@/platform/tenant/context";

import { NOTIFICATION_JOBS, REMINDER_TYPE } from "../constants";
import { notify } from "./notify";
import { requireNotificationType } from "./registry";

/**
 * Reminders (M06-05). The `scheduled_reminders` row is the source of truth; a delayed job fires it at `fireAt`
 * and a sweep every few minutes fires any the jobs missed. Firing claims the row first, so a reminder is sent
 * once even when the job and the sweep race. Callers identify a reminder by `dedupeKey` (e.g. `follow-up:<id>`):
 * scheduling the same key again moves it, cancelling it stops it.
 */
export interface ReminderInput {
  /** Stable key of what the reminder is about, e.g. `follow-up:<id>`; one live reminder per key. */
  dedupeKey: string;
  recipientId: string;
  fireAt: Date;
  title: string;
  body?: string | null;
  link?: string | null;
  entity?: { type: string; id: string } | null;
  /** Notification type (default "reminder"); follows the recipient's preferences for that type. */
  type?: string;
}

/** Schedules — or moves — the reminder with this key. Runs in the caller's transaction. */
export async function scheduleReminder(
  tx: TenantTx,
  ctx: ServiceContext,
  input: ReminderInput,
): Promise<{ id: string }> {
  const type = requireNotificationType(input.type ?? REMINDER_TYPE);
  if (!input.dedupeKey.trim()) throw new ValidationError("A reminder needs a key.");
  if (Number.isNaN(input.fireAt.getTime())) throw new ValidationError("Invalid reminder time.");
  const values = {
    recipientId: input.recipientId,
    type: type.key,
    fireAt: input.fireAt,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    entityType: input.entity?.type ?? null,
    entityId: input.entity?.id ?? null,
    status: "SCHEDULED" as const,
    sentAt: null,
    cancelledAt: null,
    notificationId: null,
  };
  const reminder = await tx.scheduledReminder.upsert({
    where: {
      organizationId_dedupeKey: { organizationId: ctx.organizationId, dedupeKey: input.dedupeKey },
    },
    create: { organizationId: ctx.organizationId, dedupeKey: input.dedupeKey, ...values },
    update: values,
    select: { id: true, fireAt: true },
  });
  // A job scheduled for an earlier time finds a different `fireAt` and does nothing.
  await enqueueJob(
    NOTIFICATION_JOBS.fireReminder,
    {
      organizationId: ctx.organizationId,
      reminderId: reminder.id,
      fireAt: reminder.fireAt.toISOString(),
    },
    { tx, startAfter: reminder.fireAt },
  );
  return { id: reminder.id };
}

/** Cancels the live reminder with this key (no-op when there is none). Returns whether one was cancelled. */
export async function cancelReminder(
  tx: TenantTx,
  ctx: ServiceContext,
  dedupeKey: string,
): Promise<boolean> {
  const { count } = await tx.scheduledReminder.updateMany({
    where: { dedupeKey, status: "SCHEDULED" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  return count > 0;
}

/**
 * Sends one reminder if it is still due at `expectedFireAt` (job) or at all (sweep). Idempotent: the row is
 * claimed with a conditional update, and the notification carries a key derived from the firing.
 */
export async function fireReminder(
  ctx: ServiceContext,
  reminderId: string,
  expectedFireAt: Date | null,
  now: Date = new Date(),
): Promise<boolean> {
  return ctx.db.$transaction(async (tx) => {
    const claimed = await tx.scheduledReminder.updateManyAndReturn({
      where: {
        id: reminderId,
        status: "SCHEDULED",
        // The job runs once `fireAt` has passed; the sweep only takes what is overdue.
        fireAt: expectedFireAt ? { equals: expectedFireAt } : { lte: now },
      },
      data: { status: "SENT", sentAt: now },
    });
    const reminder = claimed[0];
    if (!reminder) return false;
    const result = await notify(
      ctx,
      {
        type: reminder.type,
        recipientIds: [reminder.recipientId],
        title: reminder.title,
        body: reminder.body,
        link: reminder.link,
        entity:
          reminder.entityType && reminder.entityId
            ? { type: reminder.entityType, id: reminder.entityId }
            : null,
        priority: "HIGH",
        idempotencyKey: `reminder:${reminder.id}:${reminder.fireAt.toISOString()}`,
      },
      { tx },
    );
    const notificationId = result.createdIds[0];
    if (notificationId) {
      await tx.scheduledReminder.update({ where: { id: reminder.id }, data: { notificationId } });
    }
    return true;
  });
}

/** Job handler: fires the reminder scheduled for `fireAt` (skipped when it was moved or cancelled since). */
export async function runReminderJob(data: {
  organizationId: string;
  reminderId: string;
  fireAt: string;
}): Promise<void> {
  const ctx = createSystemContext(data.organizationId, { name: "Reminders" });
  await fireReminder(ctx, data.reminderId, new Date(data.fireAt));
}

/** Fires reminders whose job did not run (worker down, lost job). Part of the sweep. */
export async function fireOverdueReminders(
  ctx: ServiceContext,
  now: Date,
  logger?: Logger,
): Promise<number> {
  // Leave the delayed jobs a minute to do their work first.
  const due = await ctx.db.scheduledReminder.findMany({
    where: { status: "SCHEDULED", fireAt: { lte: new Date(now.getTime() - 60_000) } },
    orderBy: { fireAt: "asc" },
    select: { id: true },
    take: 500,
  });
  let fired = 0;
  for (const reminder of due) {
    if (await fireReminder(ctx, reminder.id, null, now)) fired += 1;
  }
  if (fired > 0)
    logger?.warn({ organizationId: ctx.organizationId, fired }, "sweep fired reminders");
  return fired;
}
