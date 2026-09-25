import type { Metadata } from "next";

import { OutcomesManager } from "@/modules/activities/components/settings/outcomes-manager";
import { listCallOutcomes } from "@/modules/activities/server/masters";
import { listLeadStatuses } from "@/modules/leads";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Call outcomes" };

export default async function CallOutcomesPage() {
  const ctx = await getRequestContext();
  const [outcomes, statuses] = await Promise.all([
    listCallOutcomes(ctx),
    listLeadStatuses(ctx, { activeOnly: true }),
  ]);
  return (
    <OutcomesManager
      outcomes={outcomes}
      statuses={statuses.map((status) => ({ key: status.key, label: status.label }))}
    />
  );
}
