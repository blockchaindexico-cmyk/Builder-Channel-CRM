import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { BillingSettingsForm } from "@/modules/billing/components/settings/billing-settings-form";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { resolvePeriod } from "@/modules/billing/server/period";
import { getBillingSettings } from "@/modules/billing/server/settings";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Billing settings" };

export default async function BillingSettingsPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, BILLING_PERMISSIONS.billingManage);
  const regional = await getRegionalSettings(ctx);
  const [{ today }, settings] = await Promise.all([
    resolvePeriod(ctx, regional.timezone, {}),
    getBillingSettings(ctx.db, ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Billing & invoices"
        description="Legal name, GSTIN, invoice numbering, tax and TDS rates, payment terms and bank details."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Billing & invoices" }]}
      />
      <BillingSettingsForm settings={settings} today={today} />
    </>
  );
}
