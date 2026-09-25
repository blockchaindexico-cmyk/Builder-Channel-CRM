import type { Metadata } from "next";

import { RulesManager } from "@/modules/assignment/components/settings/rules-manager";
import { eligibleOwners } from "@/modules/assignment/server/core";
import { listAssignmentRules } from "@/modules/assignment/server/rules";
import { listProjectOptions } from "@/modules/catalog";
import { listCampaigns, listLeadSources } from "@/modules/leads";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Assignment rules" };

export default async function AssignmentRulesPage() {
  const ctx = await getRequestContext();
  const [rules, sources, campaigns, projects, members] = await Promise.all([
    listAssignmentRules(ctx),
    listLeadSources(ctx, { activeOnly: true }),
    listCampaigns(ctx, { activeOnly: true }),
    listProjectOptions(ctx),
    eligibleOwners(ctx.db),
  ]);
  return (
    <RulesManager
      rules={rules}
      sources={sources.map(({ id, name }) => ({ id, name }))}
      campaigns={campaigns.map(({ id, name }) => ({ id, name }))}
      projects={projects
        .filter((project) => project.isActive)
        .map(({ id, name }) => ({ id, name }))}
      members={[...members].map(([id, name]) => ({ id, name }))}
    />
  );
}
