import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { CommissionTermsManager } from "@/modules/billing/components/settings/commission-terms-manager";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { resolvePeriod } from "@/modules/billing/server/period";
import { listCommissionTerms } from "@/modules/billing/server/terms";
import { listBuilderOptions, listProjectOptions } from "@/modules/catalog";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Commission rate cards" };

export default async function CommissionSettingsPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, BILLING_PERMISSIONS.commissionManage);
  const regional = await getRegionalSettings(ctx);
  const [{ today }, terms, builders, projects] = await Promise.all([
    resolvePeriod(ctx, regional.timezone, {}),
    listCommissionTerms(ctx),
    listBuilderOptions(ctx, { includeInactive: true }),
    listProjectOptions(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Commission rate cards"
        description="Percentage, flat or slab commission per builder and project, with validity dates."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Commission rate cards" }]}
      />
      <CommissionTermsManager
        terms={terms}
        builders={builders.map((builder) => ({ id: builder.id, label: builder.name }))}
        projects={projects.map((project) => ({
          id: project.id,
          label: project.name,
          builderId: project.builderId,
        }))}
        today={today}
      />
    </>
  );
}
