import { PageHeader } from "@/components/shared/page-header";
import { AssignmentSettingsNav } from "@/modules/assignment/components/settings/assignment-settings-nav";
import { ASSIGNMENT_PERMISSIONS } from "@/modules/assignment/permissions";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Lead assignment settings (M05-06, M05-08, M05-10). */
export default async function AssignmentSettingsLayout({
  children,
}: LayoutProps<"/settings/assignment">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ASSIGNMENT_PERMISSIONS.rulesManage);
  return (
    <>
      <PageHeader
        title="Lead assignment"
        description="Who gets new leads automatically, why leads move and when they count as unworked."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Lead assignment" }]}
      />
      <AssignmentSettingsNav />
      {children}
    </>
  );
}
