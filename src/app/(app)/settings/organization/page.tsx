import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { ORGANIZATION_PERMISSIONS } from "@/modules/organization";
import { LogoUploader } from "@/modules/organization/components/logo-uploader";
import { OrganizationProfileForm } from "@/modules/organization/components/organization-profile-form";
import { TestEmailCard } from "@/modules/organization/components/test-email-card";
import { listTimezones } from "@/modules/organization/schemas";
import { getOrganizationProfile } from "@/modules/organization/server/service";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Organization profile" };

export default async function OrganizationSettingsPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, ORGANIZATION_PERMISSIONS.view);
  const profile = await getOrganizationProfile(ctx);
  const canEdit = ctx.permissions.has(ORGANIZATION_PERMISSIONS.manage);

  return (
    <>
      <PageHeader
        title="Organization profile"
        description="Company details and regional settings used across the CRM."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Organization profile" }]}
      />
      <div className="space-y-6">
        <LogoUploader logoUrl={profile.logo?.url ?? null} canEdit={canEdit} />
        <OrganizationProfileForm
          values={profile.values}
          timezones={listTimezones()}
          canEdit={canEdit}
        />
        {canEdit ? <TestEmailCard defaultEmail={profile.values.email ?? ""} /> : null}
      </div>
    </>
  );
}
