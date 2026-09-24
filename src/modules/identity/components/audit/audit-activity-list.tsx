"use client";

import { useState } from "react";

import { RelativeTime } from "@/components/shared/relative-time";

import type { AuditLogRow } from "../../server/audit-log";
import { AuditEntryDetails } from "./audit-entry-details";

/** Compact recent-activity list (user detail page); click an entry for its details. */
export function AuditActivityList({ entries }: { entries: AuditLogRow[] }) {
  const [selected, setSelected] = useState<AuditLogRow | null>(null);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  }
  return (
    <>
      <ol className="space-y-1">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => setSelected(entry)}
              className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <span className="min-w-0">
                {entry.summary ?? entry.action}
                <span className="text-muted-foreground"> · {entry.actorName ?? "System"}</span>
              </span>
              <RelativeTime
                value={entry.createdAt}
                className="shrink-0 text-xs text-muted-foreground"
              />
            </button>
          </li>
        ))}
      </ol>
      <AuditEntryDetails entry={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
}
