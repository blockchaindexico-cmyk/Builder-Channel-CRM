import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { LEAD_PERMISSIONS } from "@/modules/leads";
import { ImportWizard } from "@/modules/leads/components/import/import-wizard";
import { listLeadSources } from "@/modules/leads/server/masters";
import { getLeadSettings } from "@/modules/leads/server/settings";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Import leads" };

/** New lead import (M04-18). */
export default async function NewLeadImportPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, LEAD_PERMISSIONS.import);
  requirePermission(ctx, LEAD_PERMISSIONS.create);
  const [sources, settings] = await Promise.all([
    listLeadSources(ctx, { activeOnly: true }),
    getLeadSettings(ctx.db, ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Import leads"
        description="Bring in leads from a portal export, a campaign sheet or another CRM."
        breadcrumbs={[
          { label: "Leads", href: "/leads" },
          { label: "Imports", href: "/leads/import" },
          { label: "New import" },
        ]}
      />
      <ImportWizard
        sources={sources.map(({ id, name, type }) => ({ id, name, type }))}
        duplicatePolicy={settings.duplicatePolicy}
      />
    </>
  );
}
