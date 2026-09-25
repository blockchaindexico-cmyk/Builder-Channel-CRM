import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { NotificationSettingsForm } from "@/modules/notifications/components/settings/notification-settings-form";
import { NOTIFICATION_PERMISSIONS } from "@/modules/notifications/permissions";
import { listNotificationTypes } from "@/modules/notifications/server/registry";
import { getNotificationSettings } from "@/modules/notifications/server/settings";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Notification settings" };

/** Organization notification settings (M06-08). */
export default async function NotificationSettingsPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, NOTIFICATION_PERMISSIONS.settingsManage);
  const [settings, regional] = await Promise.all([
    getNotificationSettings(ctx.db, ctx),
    getRegionalSettings(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Which notifications are sent and how, reminder timing and the daily summary."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Notifications" }]}
      />
      <NotificationSettingsForm
        types={[...listNotificationTypes()]}
        settings={settings}
        timezone={regional.timezone}
      />
    </>
  );
}
