declare module "@/platform/events/types" {
  interface DomainEventMap {
    "lead.assigned": {
      leadId: string;
      assigneeId: string;
      method: string;
      ruleId: string | null;
    };
    "lead.reassigned": {
      leadId: string;
      assigneeId: string;
      previousOwnerId: string;
      method: string;
      reason: string | null;
    };
    "lead.unassigned": {
      leadId: string;
      previousOwnerId: string;
      method: string;
      reason: string | null;
    };
  }
}

export {};
