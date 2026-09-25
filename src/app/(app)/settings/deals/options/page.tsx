import type { Metadata } from "next";

import { DealOptionsForm } from "@/modules/deals/components/settings/deal-options-form";
import { getDealSettings } from "@/modules/deals/server/settings";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Visit and booking options" };

export default async function DealOptionsPage() {
  const ctx = await getRequestContext();
  return <DealOptionsForm settings={await getDealSettings(ctx.db, ctx)} />;
}
