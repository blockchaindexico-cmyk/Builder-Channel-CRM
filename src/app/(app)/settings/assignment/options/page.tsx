import type { Metadata } from "next";

import { AssignmentOptionsForm } from "@/modules/assignment/components/settings/options-form";
import { getAssignmentSettings } from "@/modules/assignment/server/settings";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Assignment options" };

export default async function AssignmentOptionsPage() {
  const ctx = await getRequestContext();
  return <AssignmentOptionsForm settings={await getAssignmentSettings(ctx.db, ctx)} />;
}
