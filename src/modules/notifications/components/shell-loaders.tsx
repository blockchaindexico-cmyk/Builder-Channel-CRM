import "server-only";

import { getRequestContext } from "@/platform/tenant/request-context";

import { listMyAnnouncements } from "../server/announcements";
import { getNotificationSummary } from "../server/center";
import { AnnouncementBanner } from "./announcement-banner";
import { NotificationBell } from "./notification-bell";

/** Server part of the bell: the first summary comes with the page, later ones are polled. */
export async function NotificationBellLoader() {
  const ctx = await getRequestContext();
  if (!ctx.actor.membershipId) return null;
  return <NotificationBell initial={await getNotificationSummary(ctx)} />;
}

export async function AnnouncementBannerLoader() {
  const ctx = await getRequestContext();
  const announcements = await listMyAnnouncements(ctx, { unreadOnly: true });
  if (announcements.length === 0) return null;
  return <AnnouncementBanner announcements={announcements} />;
}
