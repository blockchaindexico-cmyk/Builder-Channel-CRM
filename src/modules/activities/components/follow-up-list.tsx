"use client";

import { ArrowRightLeft, Phone, PhoneCall } from "lucide-react";
import Link from "next/link";

import { useFormatters } from "@/components/shared/regional-settings";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { FollowUpRow } from "../server/follow-ups";
import { FollowUpStatusBadge, FollowUpTypeBadge } from "./badges";
import { FollowUpActions } from "./follow-up-actions";
import { LogCallDialog } from "./log-call-dialog";

const isOpen = (row: FollowUpRow) => row.status === "SCHEDULED" || row.status === "MISSED";

/**
 * Follow-ups and callbacks with their state; open ones get Done / Move / Cancel. `showLead` for lists that span
 * several leads (agenda, team board).
 */
export function FollowUpList({
  rows,
  canManage,
  showLead = false,
  showAssignee = false,
  label = "Follow-ups",
  showCall = false,
  now,
}: {
  rows: FollowUpRow[];
  canManage: boolean;
  showLead?: boolean;
  showAssignee?: boolean;
  label?: string;
  /** Call and "Log call" buttons next to open items (agenda). */
  showCall?: boolean;
  /** Rendering time from the server, so "overdue" does not flicker between server and browser. */
  now: string;
}) {
  const format = useFormatters();
  const nowMs = new Date(now).getTime();
  return (
    <ol className="divide-y rounded-lg border" aria-label={label}>
      {rows.map((row) => {
        const overdue = isOpen(row) && new Date(row.dueAt).getTime() < nowMs;
        return (
          <li
            key={row.id}
            className={cn(
              "flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start",
              overdue && "bg-warning/5",
            )}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <FollowUpTypeBadge type={row.type} />
                <span className={cn("font-medium", overdue && "text-destructive")}>
                  {format.dateTime(row.dueAt)}
                </span>
                {isOpen(row) ? (
                  <span className="text-muted-foreground">
                    (<RelativeTime value={row.dueAt} />)
                  </span>
                ) : null}
                <FollowUpStatusBadge status={row.status} overdue={overdue} />
                {row.rescheduledFromId ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowRightLeft className="size-3" /> moved
                  </span>
                ) : null}
              </div>
              {showLead ? (
                <Link
                  href={`/leads/${row.lead.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {row.lead.number} · {row.lead.name}
                </Link>
              ) : null}
              {row.purpose || row.notes ? (
                <p className="whitespace-pre-line">
                  {row.purpose ? <span className="font-medium">{row.purpose}</span> : null}
                  {row.purpose && row.notes ? " — " : null}
                  {row.notes}
                </p>
              ) : null}
              {row.status === "COMPLETED" ? (
                <p className="text-muted-foreground">
                  Done by {row.completedByName}{" "}
                  {row.completedAt ? format.dateTime(row.completedAt) : ""}
                  {row.completionNotes ? `: ${row.completionNotes}` : ""}
                </p>
              ) : null}
              {row.status === "CANCELLED" ? (
                <p className="text-muted-foreground">Cancelled: {row.cancelReason}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {showAssignee ? `${row.assignedToName ?? "No owner yet"} · ` : ""}
                Scheduled by {row.createdByName}
              </p>
            </div>
            {isOpen(row) && (canManage || showCall) ? (
              <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                {showCall && row.lead.mobile ? (
                  <Button asChild size="sm" variant="secondary" className="h-7 px-2">
                    <a href={`tel:${row.lead.mobile}`}>
                      <Phone /> Call
                      <span className="sr-only"> {row.lead.name}</span>
                    </a>
                  </Button>
                ) : null}
                {showCall ? (
                  <LogCallDialog
                    leadId={row.lead.id}
                    trigger={
                      <Button size="sm" variant="outline" className="h-7 px-2">
                        <PhoneCall /> Log call
                        <span className="sr-only"> for {row.lead.name}</span>
                      </Button>
                    }
                  />
                ) : null}
                {canManage ? (
                  <FollowUpActions
                    followUp={{ id: row.id, type: row.type, dueAt: row.dueAt, lead: row.lead }}
                    compact
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
