import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await getRequestContext();
  const organization = await ctx.db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { name: true },
  });

  return (
    <>
      <PageHeader title="Dashboard" description={`Welcome to ${organization.name}.`} />
      <EmptyState
        icon={LayoutDashboard}
        title="Your dashboard is on its way"
        description="Leads, follow-ups, site visits, bookings and team performance will appear here as those features are switched on."
      />
    </>
  );
}
