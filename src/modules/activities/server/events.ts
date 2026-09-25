declare module "@/platform/events/types" {
  interface DomainEventMap {
    "call.logged": {
      callId: string;
      leadId: string;
      callerId: string | null;
      outcomeId: string;
      outcomeKey: string | null;
      connected: boolean;
    };
    "followup.scheduled": {
      followUpId: string;
      leadId: string;
      type: "FOLLOW_UP" | "CALLBACK";
      assignedToId: string | null;
      dueAt: string;
    };
    "followup.completed": { followUpId: string; leadId: string; assignedToId: string | null };
    "followup.missed": { followUpId: string; leadId: string; assignedToId: string | null };
    "followup.rescheduled": {
      followUpId: string;
      newFollowUpId: string;
      leadId: string;
      dueAt: string;
    };
    "followup.cancelled": { followUpId: string; leadId: string; reason: string };
  }
}

export {};
