import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createLoader, parseAsBoolean, parseAsString, parseAsStringLiteral } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { toTableQuery } from "@/lib/table-query";
import { CATALOG_PERMISSIONS } from "@/modules/catalog";
import { ProjectsTable } from "@/modules/catalog/components/projects/projects-table";
import { PROJECT_STATUS_VALUES } from "@/modules/catalog/schemas";
import { getCatalogOptions } from "@/modules/catalog/server/masters";
import {
  getProjectFilterOptions,
  listProjects,
  PROJECT_SORTABLE_FIELDS,
} from "@/modules/catalog/server/projects";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Projects" };

const decimal = /^\d{1,12}(\.\d{1,2})?$/;

const loadSearchParams = createLoader({
  ...tableSearchParams,
  builder: parseAsString,
  city: parseAsString,
  status: parseAsStringLiteral(PROJECT_STATUS_VALUES),
  type: parseAsString,
  config: parseAsString,
  budgetMin: parseAsString,
  budgetMax: parseAsString,
  inactive: parseAsBoolean.withDefault(false),
});

/** Projects catalogue (M03-06). */
export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, CATALOG_PERMISSIONS.projectsView);
  const params = await loadSearchParams(searchParams);
  const query = toTableQuery(params, {
    sortable: PROJECT_SORTABLE_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  const [projects, filterOptions, masters] = await Promise.all([
    listProjects(ctx, query, {
      builderId: params.builder,
      city: params.city,
      status: params.status,
      propertyTypeId: params.type,
      configurationTypeId: params.config,
      budgetMin: params.budgetMin && decimal.test(params.budgetMin) ? params.budgetMin : null,
      budgetMax: params.budgetMax && decimal.test(params.budgetMax) ? params.budgetMax : null,
      includeInactive: params.inactive,
    }),
    getProjectFilterOptions(ctx),
    getCatalogOptions(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every project you sell: configurations, prices, possession, amenities and documents."
        actions={
          ctx.permissions.has(CATALOG_PERMISSIONS.projectsManage) ? (
            <Button asChild>
              <Link href="/projects/new">
                <Plus /> Add project
              </Link>
            </Button>
          ) : null
        }
      />
      <ProjectsTable
        rows={projects.rows}
        total={projects.total}
        options={{
          builders: filterOptions.builders,
          cities: filterOptions.cities,
          propertyTypes: masters.propertyTypes,
          configurationTypes: masters.configurationTypes,
        }}
      />
    </>
  );
}
