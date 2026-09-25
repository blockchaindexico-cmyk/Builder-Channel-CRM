import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { listAssignableMembers } from "@/modules/assignment";
import { LEAD_PERMISSIONS } from "@/modules/leads";
import { LeadForm } from "@/modules/leads/components/lead-form";
import { loadLeadFormOptions } from "@/modules/leads/server/page-data";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, LEAD_PERMISSIONS.create);
  const [options, assignees] = await Promise.all([
    loadLeadFormOptions(ctx),
    listAssignableMembers(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="New lead"
        description="Capture the customer, what they are looking for and where they came from."
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: "New lead" }]}
      />
      <LeadForm options={options} assignees={assignees} />
    </>
  );
}
