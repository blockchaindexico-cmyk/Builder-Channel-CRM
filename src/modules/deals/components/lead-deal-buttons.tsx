"use client";

import { CircleSlash, MoreHorizontal, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MarkLostDialog } from "./mark-lost-dialog";
import { ScheduleVisitDialog } from "./schedule-visit-dialog";

/**
 * Lead page header (M08-03, M08-07, M08-11): "Schedule visit"; "Book" once the lead has visited; converting to a
 * booking and closing the lead as lost under "More".
 */
export function LeadDealButtons({
  lead,
  canVisit,
  canBook,
  canMarkLost,
  bookFirst,
}: {
  lead: { id: string; number: string; name: string };
  canVisit: boolean;
  canBook: boolean;
  canMarkLost: boolean;
  /** Show "Book" as its own button (the lead is at Visit / Revisit). */
  bookFirst: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const bookHref = `/bookings/new?lead=${lead.id}`;
  const more = (canBook && !bookFirst) || canMarkLost;
  return (
    <>
      {canVisit ? <ScheduleVisitDialog leadId={lead.id} /> : null}
      {canBook && bookFirst ? (
        <Button asChild variant="outline">
          <Link href={bookHref}>
            <Trophy /> Book
          </Link>
        </Button>
      ) : null}
      {more ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canBook && !bookFirst ? (
              <DropdownMenuItem asChild>
                <Link href={bookHref}>
                  <Trophy /> Convert to booking
                </Link>
              </DropdownMenuItem>
            ) : null}
            {canMarkLost ? (
              <DropdownMenuItem variant="destructive" onSelect={() => setClosing(true)}>
                <CircleSlash /> Mark lost or not interested
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {canMarkLost ? (
        <MarkLostDialog lead={lead} trigger={null} open={closing} onOpenChange={setClosing} />
      ) : null}
    </>
  );
}
