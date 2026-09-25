import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { CATALOG_PERMISSIONS } from "@/modules/catalog";
import { ProjectForm } from "@/modules/catalog/components/projects/project-form";
import { listBuilderOptions } from "@/modules/catalog/server/builders";
import { getCatalogOptions } from "@/modules/catalog/server/masters";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";
import { uuidOrNull } from "@/platform/validation";

export const metadata: Metadata = { title: "Add project" };

export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, CATALOG_PERMISSIONS.projectsManage);
  const { builderId } = await searchParams;
  const [builders, options] = await Promise.all([listBuilderOptions(ctx), getCatalogOptions(ctx)]);

  return (
    <>
      <PageHeader
        title="Add project"
        description="Only the builder and the name are required; complete the rest now or later."
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "Add project" }]}
      />
      <ProjectForm
        builders={builders}
        options={options}
        builderId={uuidOrNull(typeof builderId === "string" ? builderId : null) ?? undefined}
      />
    </>
  );
}
