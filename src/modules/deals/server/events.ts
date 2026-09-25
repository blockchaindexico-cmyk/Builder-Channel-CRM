declare module "@/platform/events/types" {
  interface DomainEventMap {
    "visit.scheduled": {
      visitId: string;
      leadId: string;
      projectId: string;
      assignedToId: string | null;
      scheduledAt: string;
      isRevisit: boolean;
    };
    "visit.confirmed": { visitId: string; leadId: string };
    "visit.completed": {
      visitId: string;
      leadId: string;
      projectId: string;
      outcomeId: string;
      outcomeKey: string | null;
      conductedById: string | null;
      isRevisit: boolean;
    };
    "visit.no_show": { visitId: string; leadId: string };
    "visit.cancelled": { visitId: string; leadId: string; reason: string };
    "visit.rescheduled": {
      visitId: string;
      newVisitId: string;
      leadId: string;
      scheduledAt: string;
    };
    "booking.created": {
      bookingId: string;
      leadId: string;
      projectId: string;
      builderId: string;
      executiveId: string;
      managerId: string | null;
    };
    "booking.updated": { bookingId: string; leadId: string; fields: string[]; stage?: string };
    "booking.closed": { bookingId: string; leadId: string; executiveId: string };
    "booking.cancelled": {
      bookingId: string;
      leadId: string;
      reasonId: string;
      leadOutcome: "LOST" | "ACTIVE" | "UNCHANGED";
    };
    "lead.lost": { leadId: string; lossReasonId: string; statusKey: string };
    "lead.not_interested": { leadId: string; lossReasonId: string; statusKey: string };
  }
}

export {};
