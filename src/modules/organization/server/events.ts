declare module "@/platform/events/types" {
  interface DomainEventMap {
    /** Organization profile or regional settings changed. */
    "organization.settings_updated": { changedFields: string[] };
  }
}

export {};
