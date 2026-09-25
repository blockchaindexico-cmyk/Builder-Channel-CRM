import type { ComponentType, ReactNode } from "react";

import type { LeadChannel } from "@/generated/prisma/enums";
import type { TenantTx } from "@/platform/db/tenant-scope";
import type { ServiceContext } from "@/platform/tenant/context";

/**
 * Extension points owned by the leads module (M04-07, M04-11).
 *
 * - `lead.detail.panel`: extra tabs on the lead page, rendered on the server (M05 assignments, M07 calls &
 *   follow-ups, M08 visits & bookings).
 * - `lead.detail.action`: extra buttons in the lead page header, rendered on the server (M05 assign/reassign).
 * - `lead.timeline`: how timeline entries of a type are shown (label and accent) — client-safe, contributed
 *   through module manifests.
 * - `lead.list.bulk-action`: extra bulk actions for selected leads (client components, via
 *   `src/modules/registry.client.ts`).
 * - `lead.created` (server): hooks run inside the transaction that creates a lead (M05 assigns it there).
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

/** The lead a header action is rendered for. */
export interface LeadActionTarget {
  id: string;
  number: string;
  ownerId: string | null;
  ownerName: string | null;
  statusKey: string;
}

export interface LeadDetailAction {
  key: string;
  order: number;
  render: (props: { lead: LeadActionTarget }) => Promise<ReactNode> | ReactNode;
}

export interface LeadBulkAction {
  key: string;
  order: number;
  /** Rendered in the bulk bar of the lead list; decides itself whether the user may use it. */
  component: ComponentType<{ leadIds: string[]; onDone: () => void }>;
}

export interface LeadCreatedHookInput {
  tx: TenantTx;
  ctx: ServiceContext;
  lead: {
    id: string;
    number: string;
    channel: LeadChannel;
    statusKey: string;
    sourceId: string | null;
    campaignId: string | null;
    projectIds: string[];
  };
  /** Owner asked for by the creator ("Assign to" on the form, an import's owner column); undefined if none. */
  requestedOwnerId?: string | null;
  importBatchId?: string;
}
export type LeadCreatedHook = (input: LeadCreatedHookInput) => Promise<void>;

declare module "@/platform/registry/ui" {
  interface UiExtensionMap {
    "lead.detail.panel": LeadDetailPanel;
    "lead.detail.action": LeadDetailAction;
  }
}

declare module "@/platform/registry/types" {
  interface ContributionMap {
    "lead.timeline": LeadTimelineRenderer;
  }
}

declare module "@/platform/registry/client-ui" {
  interface ClientUiExtensionMap {
    "lead.list.bulk-action": LeadBulkAction;
  }
}

declare module "@/platform/registry/server" {
  interface ServerExtensionMap {
    "lead.created": LeadCreatedHook;
  }
}
