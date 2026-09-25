import type { Metadata } from "next";

import { ActivityOptionsForm } from "@/modules/activities/components/settings/activity-options-form";
import { getActivitySettings } from "@/modules/activities/server/settings";
import { getNotificationSettings } from "@/modules/notifications";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Call & follow-up options" };

export default async function ActivityOptionsPage() {
  const ctx = await getRequestContext();
  const [settings, notifications] = await Promise.all([
    getActivitySettings(ctx.db, ctx),
    getNotificationSettings(ctx.db, ctx),
  ]);
  return (
    <ActivityOptionsForm
      settings={settings}
      reminderLeadMinutes={notifications.reminderLeadMinutes}
    />
  );
}
