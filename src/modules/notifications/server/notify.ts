import type { Prisma } from "@/generated/prisma/client";
import type { NotificationPriority } from "@/generated/prisma/enums";
import { findMembers } from "@/modules/identity";
import type { TenantTx } from "@/platform/db/tenant-scope";
import { enqueueJob } from "@/platform/jobs/enqueue";
import type { ServiceContext } from "@/platform/tenant/context";

import { GROUPED_EMAIL_DELAY_SECONDS, NOTIFICATION_JOBS } from "../constants";
import { resolveChannels } from "./channels";
import { loadPreferences } from "./preferences";
import { requireNotificationType } from "./registry";
import { getNotificationSettings } from "./settings";

export interface NotificationText {
  title: string;
  body?: string | null;
  /** Path inside the app, e.g. `/leads/<id>`. */
  link?: string | null;
}

export interface NotifyInput extends NotificationText {
  /** A registered notification type (see `notification.type` contributions). */
  type: string;
  /** Memberships to notify; inactive members and duplicates are dropped. */
  recipientIds: readonly string[];
  entity?: { type: string; id: string } | null;
  priority?: NotificationPriority;
  /** Who caused it, shown next to the notification (e.g. the manager who reassigned a lead). */
  actorName?: string | null;
  /** Structured content for type-specific e-mail templates. */
  data?: Prisma.InputJsonValue;
  /**
   * The same key reaches each recipient once — retried events, reminders and digests use it. With `group`, it is
   * the key of the group instead.
   */
  idempotencyKey?: string | null;
  /**
   * Related events that should read as one notification (e.g. the leads of one bulk assignment): the first call
   * creates it, later calls with the same `idempotencyKey` count up and re-render the text with the new count.
   */
  group?: (count: number) => NotificationText;
}

export interface NotifyResult {
  /** Ids of the new notifications. */
  createdIds: string[];
  /** Existing grouped notifications that counted one more event. */
  grouped: number;
}

/**
 * Sends a notification (M06-03): applies the organization's settings and each recipient's preferences, stores the
 * in-app notification and queues the e-mail delivery — all in the caller's transaction when one is given, so a
 * rolled-back change never notifies anybody.
 */
export async function notify(
  ctx: ServiceContext,
  input: NotifyInput,
  options: { tx?: TenantTx } = {},
): Promise<NotifyResult> {
  if (options.tx) return notifyInTransaction(options.tx, ctx, input);
  return ctx.db.$transaction((tx) => notifyInTransaction(tx, ctx, input));
}

async function notifyInTransaction(
  tx: TenantTx,
  ctx: ServiceContext,
  input: NotifyInput,
): Promise<NotifyResult> {
  const type = requireNotificationType(input.type);
  if (input.group && !input.idempotencyKey) {
    throw new Error("Grouped notifications need an idempotencyKey (the key of the group).");
  }
  const recipientIds = [...new Set(input.recipientIds)];
  if (recipientIds.length === 0) return { createdIds: [], grouped: 0 };

  // One connection per transaction: queries run one after another.
  const members = await findMembers(tx, { ids: recipientIds, activeOnly: true });
  const settings = await getNotificationSettings(tx, ctx);
  const preferences = await loadPreferences(tx, recipientIds, type.key);
  const plans = members
    .map((member) => ({
      recipientId: member.membershipId,
      channels: resolveChannels(type, settings, preferences.get(member.membershipId)),
    }))
    .filter((plan) => plan.channels.length > 0);
  if (plans.length === 0) return { createdIds: [], grouped: 0 };

  const text = input.group ? input.group(1) : input;
  const created = await tx.notification.createManyAndReturn({
    data: plans.map((plan) => ({
      organizationId: ctx.organizationId,
      recipientId: plan.recipientId,
      type: type.key,
      category: type.category,
      title: text.title,
      body: text.body ?? null,
      link: text.link ?? null,
      entityType: input.entity?.type ?? null,
      entityId: input.entity?.id ?? null,
      priority: input.priority ?? "NORMAL",
      channels: plan.channels,
      actorName: input.actorName ?? null,
      data: input.data,
      idempotencyKey: input.idempotencyKey ?? null,
    })),
    // An existing notification with the same key (per recipient) is left alone.
    skipDuplicates: true,
    select: { id: true, recipientId: true, channels: true },
  });

  const emails = created.filter((notification) => notification.channels.includes("EMAIL"));
  if (emails.length > 0) {
    const deliveries = await tx.notificationDelivery.createManyAndReturn({
      data: emails.map((notification) => ({
        organizationId: ctx.organizationId,
        notificationId: notification.id,
        channel: "EMAIL" as const,
      })),
      select: { id: true },
    });
    for (const delivery of deliveries) {
      await enqueueJob(
        NOTIFICATION_JOBS.deliverEmail,
        { organizationId: ctx.organizationId, deliveryId: delivery.id },
        { tx, ...(input.group ? { startAfter: GROUPED_EMAIL_DELAY_SECONDS } : {}) },
      );
    }
  }

  let grouped = 0;
  if (input.group && input.idempotencyKey) {
    const createdFor = new Set(created.map((notification) => notification.recipientId));
    for (const plan of plans) {
      if (createdFor.has(plan.recipientId)) continue;
      // The row lock taken here orders concurrent events of the same group.
      const counted = await tx.notification.update({
        where: {
          organizationId_recipientId_idempotencyKey: {
            organizationId: ctx.organizationId,
            recipientId: plan.recipientId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        data: { groupCount: { increment: 1 } },
        select: { id: true, groupCount: true },
      });
      const next = input.group(counted.groupCount);
      await tx.notification.update({
        where: { id: counted.id },
        data: {
          title: next.title,
          body: next.body ?? null,
          link: next.link ?? null,
          readAt: null,
        },
      });
      grouped += 1;
    }
  }

  return { createdIds: created.map((notification) => notification.id), grouped };
}
