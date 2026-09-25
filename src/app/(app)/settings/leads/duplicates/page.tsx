import type { Metadata } from "next";

import { DuplicatePolicyForm } from "@/modules/leads/components/settings/duplicate-policy-form";
import { getLeadSettings } from "@/modules/leads/server/settings";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Duplicate policy" };

export default async function DuplicatePolicyPage() {
  const ctx = await getRequestContext();
  const settings = await getLeadSettings(ctx.db, ctx);
  return <DuplicatePolicyForm value={settings.duplicatePolicy} />;
}
