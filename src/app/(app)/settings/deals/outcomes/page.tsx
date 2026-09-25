import type { Metadata } from "next";

import { VisitOutcomesManager } from "@/modules/deals/components/settings/visit-outcomes-manager";
import { listVisitOutcomes } from "@/modules/deals/server/masters";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Visit outcomes" };

export default async function VisitOutcomesPage() {
  const ctx = await getRequestContext();
  return <VisitOutcomesManager outcomes={await listVisitOutcomes(ctx)} />;
}
