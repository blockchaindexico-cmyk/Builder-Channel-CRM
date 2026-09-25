import { PageHeader } from "@/components/shared/page-header";
import { DealSettingsNav } from "@/modules/deals/components/settings/deal-settings-nav";
import { DEAL_PERMISSIONS } from "@/modules/deals/permissions";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Visits & bookings settings (M08-02). */
export default async function DealSettingsLayout({ children }: LayoutProps<"/settings/deals">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, DEAL_PERMISSIONS.mastersManage);
  return (
    <>
      <PageHeader
        title="Visits & bookings"
        description="Visit outcomes, loss reasons, booking stages, visit reminders and what moves with a reassigned lead."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Visits & bookings" }]}
      />
      <DealSettingsNav />
      {children}
    </>
  );
}
