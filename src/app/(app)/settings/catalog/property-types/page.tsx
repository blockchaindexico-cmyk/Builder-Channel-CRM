import type { Metadata } from "next";

import { MasterTable } from "@/modules/catalog/components/masters/master-table";
import { listMasters } from "@/modules/catalog/server/masters";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Property types" };

export default async function Page() {
  const ctx = await getRequestContext();
  const rows = await listMasters(ctx, "propertyType");
  return <MasterTable kind="propertyType" rows={rows} />;
}
