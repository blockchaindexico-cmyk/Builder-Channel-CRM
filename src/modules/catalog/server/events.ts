declare module "@/platform/events/types" {
  interface DomainEventMap {
    "builder.created": { builderId: string; code: string; name: string };
    /** Details, status (`isActive`) or contacts of a builder changed. */
    "builder.updated": { builderId: string; changedFields: string[] };
    "project.created": { projectId: string; builderId: string; code: string; name: string };
    /** Details, configurations, lifecycle `status` or `isActive` of a project changed. */
    "project.updated": { projectId: string; changedFields: string[] };
  }
}

export {};
