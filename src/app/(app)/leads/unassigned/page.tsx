import type { Metadata } from "next";
import { createLoader } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { toTableQuery } from "@/lib/table-query";
import { plural } from "@/lib/utils";
import { UnassignedQueue } from "@/modules/assignment/components/unassigned-queue";
import { ASSIGNMENT_PERMISSIONS } from "@/modules/assignment/permissions";
import { listUnassignedQueue } from "@/modules/assignment/server/workload";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Unassigned leads" };

const loadSearchParams = createLoader(tableSearchParams);

/** Unassigned lead queue with ageing (M05-07). */
export default async function UnassignedLeadsPage({
  searchParams,
}: PageProps<"/leads/unassigned">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ASSIGNMENT_PERMISSIONS.assign);
  const params = await loadSearchParams(searchParams);
  const query = toTableQuery(params, {
    sortable: ["createdAt", "name"],
    defaultSort: { field: "createdAt", direction: "asc" },
  });
  const [queue, regional] = await Promise.all([
    listUnassignedQueue(ctx, query),
    getRegionalSettings(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Unassigned leads"
        description={
          queue.total
            ? `${plural(queue.total, "open lead")} without an owner, oldest first. Assign them one by one or select several.`
            : "Open leads without an owner appear here, oldest first."
        }
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: "Unassigned" }]}
      />
      <UnassignedQueue
        rows={queue.rows}
        total={queue.total}
        overdueHours={queue.overdueHours}
        overdueBefore={queue.overdueBefore}
        country={regional.country}
      />
    </>
  );
}
