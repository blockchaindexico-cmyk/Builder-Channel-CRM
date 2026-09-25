import type { Metadata } from "next";
import { createLoader, parseAsStringLiteral } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { toTableQuery } from "@/lib/table-query";
import { CATALOG_PERMISSIONS } from "@/modules/catalog";
import { BuilderFormDialog } from "@/modules/catalog/components/builders/builder-form-dialog";
import { BuildersTable } from "@/modules/catalog/components/builders/builders-table";
import { BUILDER_SORTABLE_FIELDS, listBuilders } from "@/modules/catalog/server/builders";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Builders" };

const loadSearchParams = createLoader({
  ...tableSearchParams,
  status: parseAsStringLiteral(["active", "inactive", "all"] as const).withDefault("active"),
});

/** Builders (M03-03). */
export default async function BuildersPage({ searchParams }: PageProps<"/builders">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, CATALOG_PERMISSIONS.buildersView);
  const params = await loadSearchParams(searchParams);
  const query = toTableQuery(params, {
    sortable: BUILDER_SORTABLE_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  const builders = await listBuilders(ctx, query, { status: params.status });

  return (
    <>
      <PageHeader
        title="Builders"
        description="Developers you work with, their contacts, projects and agreements."
        actions={
          ctx.permissions.has(CATALOG_PERMISSIONS.buildersManage) ? <BuilderFormDialog /> : null
        }
      />
      <BuildersTable rows={builders.rows} total={builders.total} />
    </>
  );
}
