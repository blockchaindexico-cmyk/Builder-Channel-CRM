import { PageHeader } from "@/components/shared/page-header";
import { CATALOG_PERMISSIONS } from "@/modules/catalog";
import { CatalogSettingsNav } from "@/modules/catalog/components/masters/catalog-settings-nav";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Project catalogue masters (M03-10). */
export default async function CatalogSettingsLayout({
  children,
}: LayoutProps<"/settings/catalog">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, CATALOG_PERMISSIONS.projectsManage);
  return (
    <>
      <PageHeader
        title="Project catalogue"
        description="Lists used when describing projects and customer requirements."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Project catalogue" }]}
      />
      <CatalogSettingsNav />
      {children}
    </>
  );
}
