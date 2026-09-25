import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { env } from "@/config/env";
import { LEAD_PERMISSIONS } from "@/modules/leads";
import { ApiKeysManager } from "@/modules/leads/components/api-keys/api-keys-manager";
import { IntakeApiDocs } from "@/modules/leads/components/api-keys/intake-api-docs";
import { listApiKeys } from "@/modules/leads/server/api-keys";
import { listLeadSources } from "@/modules/leads/server/masters";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "API keys" };

/** API keys and documentation of the lead intake API (M04-20). */
export default async function ApiKeysPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, LEAD_PERMISSIONS.apiKeysManage);
  const [keys, sources] = await Promise.all([
    listApiKeys(ctx),
    listLeadSources(ctx, { activeOnly: true }),
  ]);
  return (
    <>
      <PageHeader
        title="API keys"
        description="Keys for website forms, landing pages and portals that send leads to the CRM."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "API keys" }]}
      />
      <div className="space-y-8">
        <ApiKeysManager keys={keys} sources={sources.map(({ id, name }) => ({ id, name }))} />
        <IntakeApiDocs
          endpoint={`${env.APP_URL.replace(/\/$/, "")}/api/v1/leads`}
          sources={sources.map(({ name, code }) => ({ name, code }))}
        />
      </div>
    </>
  );
}
