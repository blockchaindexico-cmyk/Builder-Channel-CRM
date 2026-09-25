import type { Metadata } from "next";

import { MasterTable } from "@/modules/catalog/components/masters/master-table";
import { listMasters } from "@/modules/catalog/server/masters";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Amenities" };

export default async function Page() {
  const ctx = await getRequestContext();
  const rows = await listMasters(ctx, "amenity");
  return <MasterTable kind="amenity" rows={rows} />;
}
