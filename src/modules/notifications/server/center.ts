import type { Prisma } from "@/generated/prisma/client";
import type { NotificationPriority } from "@/generated/prisma/enums";
import { ForbiddenError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";

import { NOTIFICATION_CATEGORIES } from "../constants";

/** The signed-in person's in-app notifications (M06-06): bell, dropdown and the full page. */
export interface NotificationItem {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  priority: NotificationPriority;
  actorName: string | null;
  groupCount: number;
  read: boolean;
  createdAt: string;
}

export interface NotificationFilters {
  unreadOnly?: boolean;
  category?: string | null;
}

function recipientOf(ctx: ServiceContext): string {
  const membershipId = ctx.actor.membershipId;
  if (!membershipId) throw new ForbiddenError("Only people have notifications.");
  return membershipId;
}

function whereFor(ctx: ServiceContext, filters: NotificationFilters = {}) {
  const where: Prisma.NotificationWhereInput = {
    recipientId: recipientOf(ctx),
    channels: { has: "IN_APP" },
  };
  if (filters.unreadOnly) where.readAt = null;
  if (
    filters.category &&
    (NOTIFICATION_CATEGORIES as readonly string[]).includes(filters.category)
  ) {
    where.category = filters.category;
  }
  return where;
}

const itemSelect = {
  id: true,
  type: true,
  category: true,
  title: true,
  body: true,
  link: true,
  priority: true,
  actorName: true,
  groupCount: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

function toItem(
  row: Prisma.NotificationGetPayload<{ select: typeof itemSelect }>,
): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    title: row.title,
    body: row.body,
    link: row.link,
    priority: row.priority,
    actorName: row.actorName,
    groupCount: row.groupCount,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMyNotifications(
  ctx: ServiceContext,
  options: NotificationFilters & { page?: number; pageSize?: number } = {},
): Promise<{ items: NotificationItem[]; total: number; page: number; pageCount: number }> {
  const where = whereFor(ctx, options);
  const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 100);
  const total = await ctx.db.notification.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(options.page ?? 1, 1), pageCount);
  const rows = await ctx.db.notification.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: itemSelect,
  });
  return { items: rows.map(toItem), total, page, pageCount };
}

/** Unread count and the latest few, for the bell (polled). */
export async function getNotificationSummary(
  ctx: ServiceContext,
  take = 8,
): Promise<{ unread: number; recent: NotificationItem[] }> {
  const [unread, recent] = await Promise.all([
    ctx.db.notification.count({ where: whereFor(ctx, { unreadOnly: true }) }),
    ctx.db.notification.findMany({
      where: whereFor(ctx),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: itemSelect,
    }),
  ]);
  return { unread, recent: recent.map(toItem) };
}

/** Marks some of one's own notifications read or unread. Others' notifications are silently ignored. */
export async function markNotifications(
  ctx: ServiceContext,
  ids: readonly string[],
  read: boolean,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await ctx.db.notification.updateMany({
    where: { ...whereFor(ctx), id: { in: [...ids] }, readAt: read ? null : { not: null } },
    data: { readAt: read ? new Date() : null },
  });
  return count;
}

export async function markAllNotificationsRead(
  ctx: ServiceContext,
  filters: Pick<NotificationFilters, "category"> = {},
): Promise<number> {
  const { count } = await ctx.db.notification.updateMany({
    where: whereFor(ctx, { ...filters, unreadOnly: true }),
    data: { readAt: new Date() },
  });
  return count;
}
