import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { LEAD_PERMISSIONS } from "@/modules/leads";
import { ImportProgress } from "@/modules/leads/components/import/import-progress";
import { getImportBatch } from "@/modules/leads/server/import/service";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Lead import" };

/** Progress and report of one import (M04-18). */
export default async function LeadImportPage({ params }: PageProps<"/leads/import/[id]">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, LEAD_PERMISSIONS.import);
  const id = routeId((await params).id);
  const batch = await loadOrNotFound(getImportBatch(ctx, id));
  return (
    <>
      <PageHeader
        title="Lead import"
        description="Leads are created in the background — you can leave this page."
        breadcrumbs={[
          { label: "Leads", href: "/leads" },
          { label: "Imports", href: "/leads/import" },
          { label: batch.fileName },
        ]}
      />
      <ImportProgress batch={batch} />
    </>
  );
}
