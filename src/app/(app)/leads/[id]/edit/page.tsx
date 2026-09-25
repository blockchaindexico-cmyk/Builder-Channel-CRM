import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { isLeadInScope, LEAD_PERMISSIONS } from "@/modules/leads";
import { LeadForm } from "@/modules/leads/components/lead-form";
import { getLead } from "@/modules/leads/server/leads";
import { loadLeadFormOptions } from "@/modules/leads/server/page-data";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Edit lead" };

export default async function EditLeadPage({ params }: PageProps<"/leads/[id]/edit">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, LEAD_PERMISSIONS.update);
  const lead = await loadOrNotFound(getLead(ctx, routeId((await params).id)));
  if (
    !(await isLeadInScope(
      ctx,
      { ownerId: lead.owner?.membershipId ?? null },
      LEAD_PERMISSIONS.update,
    ))
  ) {
    forbidden();
  }
  const options = await loadLeadFormOptions(
    ctx,
    lead.interests.map((interest) => interest.projectId),
  );
  return (
    <>
      <PageHeader
        title={`Edit ${lead.name}`}
        breadcrumbs={[
          { label: "Leads", href: "/leads" },
          { label: lead.number, href: `/leads/${lead.id}` },
          { label: "Edit" },
        ]}
      />
      <LeadForm lead={lead} options={options} />
    </>
  );
}
