import type { ReactNode } from "react";

/**
 * Extension points owned by the leads module (M04-07, M04-11).
 *
 * - `lead.detail.panel`: extra tabs on the lead page, rendered on the server (M05 assignments, M07 calls &
 *   follow-ups, M08 visits & bookings).
 * - `lead.timeline`: how timeline entries of a type are shown (label and accent) — client-safe, contributed
 *   through module manifests.
 */
export interface LeadDetailPanel {
  key: string;
  label: string;
  order: number;
  /** Shown only with this permission. */
  permission?: string;
  render: (props: { leadId: string }) => Promise<ReactNode> | ReactNode;
}

export interface LeadTimelineRenderer {
  type: string;
  label: string;
  /** Badge tone used for the entry. */
  tone?: "default" | "secondary" | "success" | "warning" | "info" | "muted" | "destructive";
}

declare module "@/platform/registry/ui" {
  interface UiExtensionMap {
    "lead.detail.panel": LeadDetailPanel;
  }
}

declare module "@/platform/registry/types" {
  interface ContributionMap {
    "lead.timeline": LeadTimelineRenderer;
  }
}
