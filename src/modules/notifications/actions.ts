"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { tenantAction } from "@/platform/actions/client";

import { NOTIFICATION_PERMISSIONS } from "./permissions";
import { type AnnouncementInput, notificationSettingsSchema, preferenceSchema } from "./schemas";
import * as announcements from "./server/announcements";
import * as center from "./server/center";
import * as preferences from "./server/preferences";
import * as settings from "./server/settings";

// --- Notification center (M06-06) ---------------------------------------------------------------------------------

export const markNotificationsAction = tenantAction
  .metadata({ name: "notifications.mark" })
  .inputSchema(z.object({ ids: z.array(z.uuid()).min(1).max(100), read: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    const changed = await center.markNotifications(ctx.service, parsedInput.ids, parsedInput.read);
    revalidatePath("/notifications");
    return { changed };
  });

export const markAllNotificationsReadAction = tenantAction
  .metadata({ name: "notifications.mark-all" })
  .inputSchema(z.object({ category: z.string().max(40).nullable().optional() }))
  .action(async ({ parsedInput, ctx }) => {
    const changed = await center.markAllNotificationsRead(ctx.service, {
      category: parsedInput.category ?? null,
    });
    revalidatePath("/notifications");
    return { changed };
  });

// --- Preferences (M06-07) -----------------------------------------------------------------------------------------

export const setPreferenceAction = tenantAction
  .metadata({ name: "notifications.preference.set" })
  .inputSchema(preferenceSchema)
  .action(async ({ parsedInput, ctx }) => {
    await preferences.setMyNotificationPreference(ctx.service, parsedInput);
    revalidatePath("/profile");
  });

export const resetPreferencesAction = tenantAction
  .metadata({ name: "notifications.preference.reset" })
  .action(async ({ ctx }) => {
    await preferences.resetMyNotificationPreferences(ctx.service);
    revalidatePath("/profile");
  });

// --- Organization settings (M06-08) -------------------------------------------------------------------------------

export const saveNotificationSettingsAction = tenantAction
  .metadata({
    name: "notifications.settings.update",
    permission: NOTIFICATION_PERMISSIONS.settingsManage,
  })
  .inputSchema(notificationSettingsSchema)
  .action(async ({ parsedInput, ctx }) => {
    await settings.updateNotificationSettings(ctx.service, parsedInput);
    revalidatePath("/settings/notifications");
  });

// --- Announcements (M06-09) ---------------------------------------------------------------------------------------

export const saveAnnouncementAction = tenantAction
  .metadata({
    name: "notifications.announcement.save",
    permission: NOTIFICATION_PERMISSIONS.announcementsManage,
  })
  // The service validates `values` (its schema turns the dates into Date objects).
  .inputSchema(z.object({ id: z.uuid().nullable(), values: z.record(z.string(), z.unknown()) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await announcements.saveAnnouncement(
      ctx.service,
      parsedInput.id,
      parsedInput.values as AnnouncementInput,
    );
    revalidatePath("/settings/announcements");
    revalidatePath("/", "layout");
    return result;
  });

export const endAnnouncementAction = tenantAction
  .metadata({
    name: "notifications.announcement.end",
    permission: NOTIFICATION_PERMISSIONS.announcementsManage,
  })
  .inputSchema(z.object({ id: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await announcements.endAnnouncement(ctx.service, parsedInput.id);
    revalidatePath("/settings/announcements");
    revalidatePath("/", "layout");
  });

export const deleteAnnouncementAction = tenantAction
  .metadata({
    name: "notifications.announcement.delete",
    permission: NOTIFICATION_PERMISSIONS.announcementsManage,
  })
  .inputSchema(z.object({ id: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await announcements.deleteAnnouncement(ctx.service, parsedInput.id);
    revalidatePath("/settings/announcements");
    revalidatePath("/", "layout");
  });

export const markAnnouncementsReadAction = tenantAction
  .metadata({ name: "notifications.announcement.read" })
  .inputSchema(z.object({ ids: z.array(z.uuid()).min(1).max(50) }))
  .action(async ({ parsedInput, ctx }) => {
    await announcements.markAnnouncementsRead(ctx.service, parsedInput.ids);
  });
