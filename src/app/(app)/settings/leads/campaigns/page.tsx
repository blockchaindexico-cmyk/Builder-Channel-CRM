import type { Metadata } from "next";

import { CampaignsTable } from "@/modules/leads/components/settings/campaigns-table";
import { listCampaigns, listLeadSources } from "@/modules/leads/server/masters";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const ctx = await getRequestContext();
  const [campaigns, sources] = await Promise.all([
    listCampaigns(ctx),
    listLeadSources(ctx, { activeOnly: true }),
  ]);
  return (
    <CampaignsTable campaigns={campaigns} sources={sources.map(({ id, name }) => ({ id, name }))} />
  );
}
