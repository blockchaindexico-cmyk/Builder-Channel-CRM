import type { Metadata } from "next";

import { ReasonsTable } from "@/modules/assignment/components/settings/reasons-table";
import { listReassignmentReasons } from "@/modules/assignment/server/reasons";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Reassignment reasons" };

export default async function ReassignmentReasonsPage() {
  const ctx = await getRequestContext();
  return <ReasonsTable reasons={await listReassignmentReasons(ctx)} />;
}
