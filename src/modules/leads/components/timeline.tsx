"use client";

import {
  ArrowRightLeft,
  CircleDot,
  Copy,
  FilePlus2,
  FileX2,
  GitMerge,
  type LucideIcon,
  MessageSquarePlus,
  MessageSquareX,
  PencilLine,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actionErrorMessage } from "@/lib/action-result";
import { appRegistry } from "@/modules/registry";

import { loadTimelineAction } from "../actions";
import type { TimelineEntry } from "../server/timeline";
import { LeadStatusBadge } from "./badges";

/** Built-in entry types (M04); other modules contribute labels through the "lead.timeline" extension point. */
const BUILT_IN: Record<string, { label: string; icon: LucideIcon }> = {
  CREATED: { label: "Created", icon: Sparkles },
  UPDATED: { label: "Details changed", icon: PencilLine },
  STATUS_CHANGED: { label: "Status", icon: ArrowRightLeft },
  NOTE_ADDED: { label: "Note", icon: MessageSquarePlus },
  NOTE_UPDATED: { label: "Note edited", icon: PencilLine },
  NOTE_DELETED: { label: "Note deleted", icon: MessageSquareX },
  FILE_ADDED: { label: "Attachment", icon: FilePlus2 },
  FILE_REMOVED: { label: "Attachment removed", icon: FileX2 },
  DUPLICATE_DETECTED: { label: "Possible duplicate", icon: Copy },
  DUPLICATE_RESOLVED: { label: "Duplicate review", icon: Copy },
  MERGED: { label: "Merged", icon: GitMerge },
  DELETED: { label: "Deleted", icon: Trash2 },
};

function describe(type: string) {
  const builtIn = BUILT_IN[type];
  if (builtIn) return builtIn;
  const contributed = appRegistry
    .contributions("lead.timeline")
    .find((renderer) => renderer.type === type);
  return { label: contributed?.label ?? type.replace(/_/g, " ").toLowerCase(), icon: CircleDot };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}

function Details({ entry }: { entry: TimelineEntry }) {
  const payload = entry.payload;
  if (entry.type === "STATUS_CHANGED") {
    const from = payload.from as { label: string; color: string } | undefined;
    const to = payload.to as { label: string; color: string } | undefined;
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {from ? <LeadStatusBadge label={from.label} color={from.color} /> : null}
          <span className="text-muted-foreground">→</span>
          {to ? <LeadStatusBadge label={to.label} color={to.color} /> : null}
        </div>
        {payload.reason ? (
          <p className="text-muted-foreground">Reason: {String(payload.reason)}</p>
        ) : null}
      </div>
    );
  }
  if (entry.type === "UPDATED" && payload.changes && typeof payload.changes === "object") {
    const changes = payload.changes as Record<string, { from: unknown; to: unknown }>;
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {Object.entries(changes).map(([field, change]) => (
          <div key={field} className="contents">
            <dt className="text-muted-foreground">
              {field.replace(/([A-Z])/g, " $1").toLowerCase()}
            </dt>
            <dd>
              <span className="text-muted-foreground line-through decoration-muted-foreground/40">
                {formatValue(change.from)}
              </span>{" "}
              → {formatValue(change.to)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  if (
    (entry.type === "NOTE_ADDED" ||
      entry.type === "NOTE_UPDATED" ||
      entry.type === "NOTE_DELETED") &&
    payload.excerpt
  ) {
    return <p className="whitespace-pre-line text-muted-foreground">“{String(payload.excerpt)}”</p>;
  }
  return null;
}

/**
 * Lead timeline (M04-11, PRD §22): every event with who did it and when, newest first, filterable by type.
 */
export function LeadTimeline({
  leadId,
  initial,
}: {
  leadId: string;
  initial: { entries: TimelineEntry[]; types: string[]; hasMore: boolean };
}) {
  const [entries, setEntries] = useState(initial.entries);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [type, setType] = useState("__all__");
  const [loading, setLoading] = useState(false);

  async function load(nextType: string, append: boolean) {
    setLoading(true);
    const result = await loadTimelineAction({
      leadId,
      types: nextType === "__all__" ? undefined : [nextType],
      before: append ? (entries.at(-1)?.occurredAt ?? null) : null,
    });
    setLoading(false);
    const error = actionErrorMessage(result);
    if (error || !result?.data) return void toast.error(error ?? "Could not load the timeline.");
    setEntries(append ? [...entries, ...result.data.entries] : result.data.entries);
    setHasMore(result.data.hasMore);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Everything that happened with this lead.</p>
        <Select
          value={type}
          onValueChange={(value) => {
            setType(value);
            void load(value, false);
          }}
        >
          <SelectTrigger size="sm" className="w-48" aria-label="Filter timeline">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All activity</SelectItem>
            {initial.types.map((value) => (
              <SelectItem key={value} value={value}>
                {describe(value).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {entries.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="Activity appears as the lead is worked."
        />
      ) : (
        <ol className="relative space-y-4 border-l pl-6" aria-label="Lead timeline">
          {entries.map((entry) => {
            const { icon: Icon, label } = describe(entry.type);
            return (
              <li key={entry.id} className="relative">
                <span className="absolute top-0.5 -left-[35px] flex size-6 items-center justify-center rounded-full border bg-background">
                  <Icon className="size-3.5 text-muted-foreground" />
                </span>
                <div className="space-y-1 text-sm">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{entry.summary}</span>
                    <span className="text-xs text-muted-foreground">
                      {label} · {entry.actorName} · <RelativeTime value={entry.occurredAt} />
                    </span>
                  </p>
                  <Details entry={entry} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {hasMore ? (
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load(type, true)}
        >
          {loading ? "Loading…" : "Show older activity"}
        </Button>
      ) : null}
    </div>
  );
}
