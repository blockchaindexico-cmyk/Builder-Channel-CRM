import type { ReactNode } from "react";

/**
 * Extension points owned by calls & follow-ups (M07).
 *
 * - `agenda.section`: extra tabs of "My agenda", rendered on the server (M08 site visits).
 */
export interface AgendaSection {
  key: string;
  order: number;
  /** Shown only with this permission. */
  permission?: string;
  /** The tab's label (with its count) and content for the signed-in person; null leaves it out. */
  load(props: { now: Date }): Promise<{ label: string; content: ReactNode } | null>;
}

declare module "@/platform/registry/ui" {
  interface UiExtensionMap {
    "agenda.section": AgendaSection;
  }
}
