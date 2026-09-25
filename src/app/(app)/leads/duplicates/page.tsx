import type { Metadata } from "next";
import { createLoader } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { toTableQuery } from "@/lib/table-query";
import { plural } from "@/lib/utils";
import { LEAD_PERMISSIONS } from "@/modules/leads";
import { DuplicatesQueue } from "@/modules/leads/components/duplicates-queue";
import { listDuplicateQueue } from "@/modules/leads/server/duplicates";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Duplicate leads" };

const loadSearchParams = createLoader(tableSearchParams);

/** Duplicate review queue (M04-17). */
export default async function DuplicatesPage({ searchParams }: PageProps<"/leads/duplicates">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, LEAD_PERMISSIONS.merge);
  const params = await loadSearchParams(searchParams);
  const queue = await listDuplicateQueue(
    ctx,
    toTableQuery({ ...params, pageSize: 50 }, { sortable: [] }),
  );
  return (
    <>
      <PageHeader
        title="Duplicate leads"
        description={`${plural(queue.total, "lead")} matched an existing customer by mobile or e-mail and ${queue.total === 1 ? "waits" : "wait"} for review.`}
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: "Duplicates" }]}
      />
      <DuplicatesQueue rows={queue.rows} />
    </>
  );
}
