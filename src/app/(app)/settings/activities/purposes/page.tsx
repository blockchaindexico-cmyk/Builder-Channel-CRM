import type { Metadata } from "next";

import { PurposesManager } from "@/modules/activities/components/settings/purposes-manager";
import { listFollowUpPurposes } from "@/modules/activities/server/masters";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Follow-up purposes" };

export default async function FollowUpPurposesPage() {
  const ctx = await getRequestContext();
  return <PurposesManager purposes={await listFollowUpPurposes(ctx)} />;
}
