import { PageHeader } from "@/components/shared/page-header";
import { LEAD_PERMISSIONS } from "@/modules/leads";
import { LeadSettingsNav } from "@/modules/leads/components/settings/lead-settings-nav";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Lead settings (M04-03). */
export default async function LeadSettingsLayout({ children }: LayoutProps<"/settings/leads">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, LEAD_PERMISSIONS.mastersManage);
  return (
    <>
      <PageHeader
        title="Lead settings"
        description="How leads move through their lifecycle and where they come from."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Lead settings" }]}
      />
      <LeadSettingsNav />
      {children}
    </>
  );
}
