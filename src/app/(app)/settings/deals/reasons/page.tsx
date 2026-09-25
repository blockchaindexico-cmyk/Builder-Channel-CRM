import type { Metadata } from "next";

import { LossReasonsManager } from "@/modules/deals/components/settings/loss-reasons-manager";
import { listLossReasons } from "@/modules/deals/server/masters";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Loss reasons" };

export default async function LossReasonsPage() {
  const ctx = await getRequestContext();
  return <LossReasonsManager reasons={await listLossReasons(ctx)} />;
}
