import type { Metadata } from "next";

import { StatusesTable } from "@/modules/leads/components/settings/statuses-table";
import { listLeadStatusesWithUsage } from "@/modules/leads/server/masters";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Lead statuses" };

export default async function LeadStatusesPage() {
  const ctx = await getRequestContext();
  return <StatusesTable statuses={await listLeadStatusesWithUsage(ctx)} />;
}
