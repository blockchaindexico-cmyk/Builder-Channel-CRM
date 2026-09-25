import { FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { LEAD_PERMISSIONS } from "@/modules/leads";
import { ImportHistory } from "@/modules/leads/components/import/import-history";
import { listImportBatches } from "@/modules/leads/server/import/service";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Lead imports" };

/** Import history (M04-18). */
export default async function LeadImportsPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, LEAD_PERMISSIONS.import);
  const batches = await listImportBatches(ctx);
  return (
    <>
      <PageHeader
        title="Lead imports"
        description="Files imported into the CRM, with what was imported and what was left out."
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: "Imports" }]}
        actions={
          <Button asChild>
            <Link href="/leads/import/new">
              <FileUp /> New import
            </Link>
          </Button>
        }
      />
      <ImportHistory batches={batches} />
    </>
  );
}
