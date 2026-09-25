declare module "@/platform/events/types" {
  interface DomainEventMap {
    "lead.created": {
      leadId: string;
      number: string;
      channel: "MANUAL" | "IMPORT" | "API";
      ownerId: string | null;
      sourceId: string | null;
      projectIds: string[];
    };
    "lead.updated": { leadId: string; changedFields: string[] };
    "lead.status_changed": {
      leadId: string;
      fromStatusKey: string | null;
      toStatusKey: string;
      reason: string | null;
      reopened: boolean;
    };
    "lead.note_added": { leadId: string; noteId: string };
    "lead.duplicate_detected": { leadId: string; matchedLeadIds: string[] };
    "lead.merged": { primaryLeadId: string; mergedLeadId: string };
    "lead.import_completed": {
      batchId: string;
      createdById: string;
      fileName: string;
      imported: number;
      duplicates: number;
      skipped: number;
      errors: number;
    };
    "lead.import_failed": {
      batchId: string;
      createdById: string;
      fileName: string;
      message: string;
    };
  }
}

export {};
