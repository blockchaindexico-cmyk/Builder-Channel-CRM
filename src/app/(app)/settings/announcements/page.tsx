import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { listMemberOptions, listRoleOptions } from "@/modules/identity";
import { AnnouncementsManager } from "@/modules/notifications/components/settings/announcements-manager";
import { NOTIFICATION_PERMISSIONS } from "@/modules/notifications/permissions";
import { listAnnouncements } from "@/modules/notifications/server/announcements";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Announcements" };

/** Settings → Announcements (M06-09). */
export default async function AnnouncementSettingsPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, NOTIFICATION_PERMISSIONS.announcementsManage);
  const [announcements, roles, managers] = await Promise.all([
    listAnnouncements(ctx),
    listRoleOptions(ctx.db),
    listMemberOptions(ctx, { managersOnly: true }),
  ]);
  return (
    <>
      <PageHeader
        title="Announcements"
        description="News for everyone, some roles or a manager's team — shown as a banner and sent as a notification."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Announcements" }]}
      />
      <AnnouncementsManager
        announcements={announcements}
        roles={roles.map((role) => ({ id: role.id, name: role.name }))}
        managers={managers.map((member) => ({ id: member.membershipId, name: member.name }))}
      />
    </>
  );
}
