import "server-only";

import { MapPinned, Trophy } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ACTIVITY_PERMISSIONS } from "@/modules/activities";
import { findVisibleLead, isLeadInScope } from "@/modules/leads";
import { getRegionalSettings } from "@/modules/organization";
import { getRequestContext } from "@/platform/tenant/request-context";

import { DEAL_PERMISSIONS } from "../permissions";
import { listLeadBookings } from "../server/bookings";
import { listLeadVisits } from "../server/visits";
import { BookingCards } from "./booking-cards";
import { ScheduleVisitDialog } from "./schedule-visit-dialog";
import { VisitList } from "./visit-list";

/** "Visits" tab of the lead page (M08-06): upcoming visits first, then the history with outcomes. */
export async function LeadVisitsPanel({ leadId }: { leadId: string }) {
  const ctx = await getRequestContext();
  const lead = await findVisibleLead(ctx, leadId, { include: { status: true } });
  const [rows, canManage, canBook, canMarkLost, canFollowUp] = await Promise.all([
    listLeadVisits(ctx, leadId),
    isLeadInScope(ctx, lead, DEAL_PERMISSIONS.visitsManage),
    isLeadInScope(ctx, lead, DEAL_PERMISSIONS.bookingsManage),
    isLeadInScope(ctx, lead, DEAL_PERMISSIONS.markLost),
    isLeadInScope(ctx, lead, ACTIVITY_PERMISSIONS.followUpsManage),
  ]);
  const open = !lead.status.isTerminal;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={MapPinned}
        title="No site visits yet"
        description="Plan a visit to one of the projects this customer likes; revisits link to it."
        action={canManage && open ? <ScheduleVisitDialog leadId={leadId} /> : undefined}
      />
    );
  }
  return (
    <VisitList
      rows={rows}
      canManage={canManage}
      abilities={{ canBook: canBook && open, canMarkLost: canMarkLost && open, canFollowUp }}
      label="Site visits and revisits"
      now={new Date().toISOString()}
    />
  );
}

/** "Bookings" tab of the lead page (M08-08). */
export async function LeadBookingsPanel({ leadId }: { leadId: string }) {
  const ctx = await getRequestContext();
  const lead = await findVisibleLead(ctx, leadId, { include: { status: true } });
  const [rows, canBook, regional] = await Promise.all([
    listLeadBookings(ctx, leadId),
    isLeadInScope(ctx, lead, DEAL_PERMISSIONS.bookingsManage),
    getRegionalSettings(ctx),
  ]);
  const bookable = canBook && !["LOST", "INVALID"].includes(lead.status.category);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No booking yet"
        description="When the customer books a unit, record it here: the booking gets its number and the lead moves to Booking."
        action={
          bookable ? (
            <Button asChild>
              <Link href={`/bookings/new?lead=${leadId}`}>
                <Trophy /> Convert to booking
              </Link>
            </Button>
          ) : undefined
        }
      />
    );
  }
  return <BookingCards rows={rows} regional={regional} />;
}
