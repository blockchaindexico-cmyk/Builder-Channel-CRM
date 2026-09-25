import type { ComponentType, ReactNode } from "react";

import type { Prisma } from "@/generated/prisma/client";
import type { LeadChannel } from "@/generated/prisma/enums";
import type { TenantDbOrTx, TenantTx } from "@/platform/db/tenant-scope";
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
 * - `lead.list.filter` (server): extra filters of the lead list and its exports (M07 follow-up status, calls). Each
 *   reads its own URL parameter; its options appear under "More filters".
 * - `lead.list.preset`: ready-made views of the lead list (a query string), offered with the saved views — client-safe,
 *   contributed through module manifests (M08 lost and not-interested leads).
 * - `lead.status.changing` (server): hooks run inside the transaction of every status change, before it is saved;
 *   they may refuse it (throw) and add a line to its timeline entry (M08 requires a loss reason for Lost / Not
 *   Interested).
 * - `lead.status.fields`: extra fields of the status pickers (status dialog, M07's call dialog) for a chosen status;
 *   their answers travel as the change's `details` (client components, via `src/modules/registry.client.ts`).
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
  name: string;
  ownerId: string | null;
  ownerName: string | null;
  statusKey: string;
  statusCategory: string;
  /** Closed (won, lost, not interested, invalid): reopening needs `leads.reopen`. */
  isTerminal: boolean;
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

/** A status as seen by status-change hooks and fields. */
export interface LeadStatusInfo {
  key: string;
  label: string;
  category: string;
  isTerminal: boolean;
}

export interface LeadStatusChangingInput {
  /** The transaction of the status change. */
  tx: TenantDbOrTx;
  ctx: ServiceContext;
  lead: { id: string; number: string; ownerId: string | null };
  from: LeadStatusInfo;
  to: LeadStatusInfo;
  reason: string | null;
  /** Answers of the `lead.status.fields` of the change (validated by the hook that reads them). */
  details: Record<string, string | number | boolean | null>;
  /** Driven by a module's workflow (assignment, calls, visits, bookings) rather than chosen by a person. */
  workflow: boolean;
}

export interface LeadStatusChangingResult {
  /** Appended to the timeline and audit summary, e.g. "Loss reason: Budget". */
  note?: string;
  /** Merged into the timeline entry's payload. */
  payload?: Record<string, unknown>;
}

export type LeadStatusChangingHook = (
  input: LeadStatusChangingInput,
) => Promise<LeadStatusChangingResult | void>;

export interface LeadStatusFieldsProps {
  /** The status being chosen. */
  target: LeadStatusInfo;
  /** The status the lead is in (absent for bulk changes). */
  current?: LeadStatusInfo;
  details: Record<string, string | number | boolean | null>;
  onChange: (details: Record<string, string | number | boolean | null>) => void;
  disabled?: boolean;
}

export interface LeadStatusFields {
  key: string;
  order: number;
  /** Renders nothing when the target status needs no extra answer. */
  component: ComponentType<LeadStatusFieldsProps>;
}

/** A ready-made lead list view, e.g. "Lost leads" = `closure=lost`. */
export interface LeadListPreset {
  key: string;
  label: string;
  /** Query string of the lead list (filters, sort, columns). */
  query: string;
  order: number;
  /** Offered only with this permission. */
  permission?: string;
}

declare module "@/platform/registry/ui" {
  interface UiExtensionMap {
    "lead.detail.panel": LeadDetailPanel;
    "lead.detail.action": LeadDetailAction;
  }
}

declare module "@/platform/registry/types" {
  interface ContributionMap {
    "lead.timeline": LeadTimelineRenderer;
    "lead.list.preset": LeadListPreset;
  }
}

declare module "@/platform/registry/client-ui" {
  interface ClientUiExtensionMap {
    "lead.list.bulk-action": LeadBulkAction;
    "lead.status.fields": LeadStatusFields;
  }
}

declare module "@/platform/registry/server" {
  interface ServerExtensionMap {
    "lead.created": LeadCreatedHook;
    "lead.list.filter": LeadListFilter;
    "lead.status.changing": LeadStatusChangingHook;
  }
}

export interface LeadListFilterOption {
  value: string;
  label: string;
}

export interface LeadListFilter {
  /** URL parameter, e.g. "followUp" — must not clash with the list's own parameters. */
  key: string;
  label: string;
  order: number;
  /** Choices offered to this person (none = the filter is not shown). */
  options(ctx: ServiceContext): Promise<LeadListFilterOption[]> | LeadListFilterOption[];
  /** Condition for a chosen value; null ignores an unknown value. */
  where(
    value: string,
    context: { ctx: ServiceContext; timezone: string; now: Date },
  ): Promise<Prisma.LeadWhereInput | null> | Prisma.LeadWhereInput | null;
}
