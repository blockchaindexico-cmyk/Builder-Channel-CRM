"use client";

import { ArrowRightLeft, Car, Phone, Users } from "lucide-react";
import Link from "next/link";

import { useFormatters } from "@/components/shared/regional-settings";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { VisitRow } from "../server/visits";
import { VisitKindBadge, VisitOutcomeBadge, VisitStatusBadge } from "./badges";
import { type VisitAbilities, VisitActions } from "./visit-actions";

const isOpen = (row: VisitRow) => row.status === "SCHEDULED" || row.status === "CONFIRMED";

/**
 * Site visits and revisits with their state (M08-06); open ones get Confirm / Done / No-show / Move / Cancel.
 * `showLead` for lists that span several leads (agenda, visits page).
 */
export function VisitList({
  rows,
  canManage,
  abilities,
  showLead = false,
  showAssignee = false,
  showCall = false,
  label = "Site visits",
  now,
}: {
  rows: VisitRow[];
  canManage: boolean;
  abilities: VisitAbilities;
  showLead?: boolean;
  showAssignee?: boolean;
  showCall?: boolean;
  label?: string;
  /** Rendering time from the server, so "outcome pending" does not flicker between server and browser. */
  now: string;
}) {
  const format = useFormatters();
  const nowMs = new Date(now).getTime();
  return (
    <ol className="divide-y rounded-lg border" aria-label={label}>
      {rows.map((row) => {
        const pending = isOpen(row) && new Date(row.scheduledAt).getTime() < nowMs;
        return (
          <li
            key={row.id}
            className={cn(
              "flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start",
              pending && "bg-warning/5",
            )}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <VisitKindBadge label={row.label} isRevisit={row.isRevisit} />
                <span className="font-medium">{format.dateTime(row.scheduledAt)}</span>
                {isOpen(row) ? (
                  <span className="text-muted-foreground">
                    (<RelativeTime value={row.scheduledAt} />)
                  </span>
                ) : null}
                <VisitStatusBadge status={row.status} pending={pending} />
                {row.rescheduledFromId ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowRightLeft className="size-3" /> moved
                  </span>
                ) : null}
              </div>
              <p>
                <span className="font-medium">{row.project.name}</span>
                <span className="text-muted-foreground"> · {row.builder.name}</span>
              </p>
              {showLead ? (
                <Link
                  href={`/leads/${row.lead.id}?tab=visits`}
                  className="font-medium text-primary hover:underline"
                >
                  {row.lead.number} · {row.lead.name}
                </Link>
              ) : null}
              {row.pickupRequired || row.attendees ? (
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {row.pickupRequired ? (
                    <span className="inline-flex items-center gap-1">
                      <Car className="size-3.5" /> Pickup
                      {row.pickupAddress ? ` from ${row.pickupAddress}` : ""}
                    </span>
                  ) : null}
                  {row.attendees ? (
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" /> {row.attendees} coming
                    </span>
                  ) : null}
                </p>
              ) : null}
              {row.notes && isOpen(row) ? <p className="whitespace-pre-line">{row.notes}</p> : null}
              {row.status === "COMPLETED" ? (
                <div className="space-y-1">
                  {row.outcome ? (
                    <VisitOutcomeBadge label={row.outcome.label} category={row.outcome.category} />
                  ) : null}
                  {row.feedback ? <p className="whitespace-pre-line">{row.feedback}</p> : null}
                  <p className="text-muted-foreground">
                    Went with {row.conductedByName ?? "—"}
                    {row.completedAt ? ` · recorded ${format.dateTime(row.completedAt)}` : ""}
                  </p>
                </div>
              ) : null}
              {row.status === "NO_SHOW" && row.feedback ? (
                <p className="text-muted-foreground">{row.feedback}</p>
              ) : null}
              {row.status === "CANCELLED" ? (
                <p className="text-muted-foreground">Cancelled: {row.cancelReason}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {showAssignee ? `${row.assignedToName ?? "No executive yet"} · ` : ""}
                Planned by {row.createdByName}
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
                {canManage ? (
                  <VisitActions
                    visit={{
                      id: row.id,
                      label: row.label,
                      status: row.status,
                      scheduledAt: row.scheduledAt,
                      assignedToId: row.assignedToId,
                      project: row.project,
                      lead: row.lead,
                    }}
                    abilities={abilities}
                    now={now}
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
