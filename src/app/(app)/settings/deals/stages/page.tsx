import type { Metadata } from "next";

import { BookingStagesManager } from "@/modules/deals/components/settings/booking-stages-manager";
import { listBookingStages } from "@/modules/deals/server/masters";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Booking stages" };

export default async function BookingStagesPage() {
  const ctx = await getRequestContext();
  return <BookingStagesManager stages={await listBookingStages(ctx)} />;
}
