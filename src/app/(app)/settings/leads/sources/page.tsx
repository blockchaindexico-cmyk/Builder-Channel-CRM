import type { Metadata } from "next";

import { SourcesTable } from "@/modules/leads/components/settings/sources-table";
import { listLeadSources } from "@/modules/leads/server/masters";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Lead sources" };

export default async function LeadSourcesPage() {
  const ctx = await getRequestContext();
  return <SourcesTable sources={await listLeadSources(ctx)} />;
}
