import { PageHeader } from "@/components/shared/page-header";
import { ActivitySettingsNav } from "@/modules/activities/components/settings/activity-settings-nav";
import { ACTIVITY_PERMISSIONS } from "@/modules/activities/permissions";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Calls & follow-ups settings (M07-03). */
export default async function ActivitySettingsLayout({
  children,
}: LayoutProps<"/settings/activities">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ACTIVITY_PERMISSIONS.mastersManage);
  return (
    <>
      <PageHeader
        title="Calls & follow-ups"
        description="Call outcomes and the statuses they suggest, follow-up purposes, missed and unresponsive rules."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Calls & follow-ups" }]}
      />
      <ActivitySettingsNav />
      {children}
    </>
  );
}
