import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { CATALOG_PERMISSIONS } from "@/modules/catalog";
import { ProjectForm } from "@/modules/catalog/components/projects/project-form";
import { listBuilderOptions } from "@/modules/catalog/server/builders";
import { getCatalogOptions } from "@/modules/catalog/server/masters";
import { getProject } from "@/modules/catalog/server/projects";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, CATALOG_PERMISSIONS.projectsManage);
  const project = await loadOrNotFound(getProject(ctx, routeId((await params).id)));
  const [builders, options] = await Promise.all([
    listBuilderOptions(ctx, { includeInactive: true }),
    getCatalogOptions(ctx),
  ]);

  return (
    <>
      <PageHeader
        title={`Edit ${project.name}`}
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Edit" },
        ]}
      />
      <ProjectForm project={project} builders={builders} options={options} />
    </>
  );
}
