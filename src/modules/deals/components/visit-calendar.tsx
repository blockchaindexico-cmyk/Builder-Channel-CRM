"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { useFormatters } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { VisitWeek } from "../server/visit-lists";

const TONES: Record<string, string> = {
  SCHEDULED: "border-info",
  CONFIRMED: "border-primary",
  COMPLETED: "border-success",
  NO_SHOW: "border-destructive",
  CANCELLED: "border-muted-foreground/40 line-through opacity-70",
};

const dayLabel = (date: string) => {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
};

/** A week of site visits (M08-06), today highlighted; each visit links to its lead. */
export function VisitCalendar({ week, now }: { week: VisitWeek; now: string }) {
  const format = useFormatters();
  const pathname = usePathname();
  const params = useSearchParams();
  const hrefFor = (start: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "calendar");
    next.set("week", start);
    return `${pathname}?${next.toString()}`;
  };
  const nowMs = new Date(now).getTime();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {dayLabel(week.days[0]!.date)} – {dayLabel(week.days[6]!.date)}
        </p>
        <div className="flex gap-1">
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(week.previous)} aria-label="Previous week">
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(week.today)}>This week</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(week.next)} aria-label="Next week">
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>
      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
        aria-label="Visits this week"
      >
        {week.days.map((day) => (
          <section
            key={day.date}
            aria-label={dayLabel(day.date)}
            className={cn(
              "min-h-32 rounded-lg border p-2",
              day.date === week.today && "border-primary bg-primary/5",
            )}
          >
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
              {dayLabel(day.date)}
              {day.date === week.today ? " · today" : ""}
            </h3>
            {day.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No visits</p>
            ) : (
              <ul className="space-y-1.5">
                {day.items.map((item) => {
                  const pending =
                    (item.status === "SCHEDULED" || item.status === "CONFIRMED") &&
                    new Date(item.scheduledAt).getTime() < nowMs;
                  return (
                    <li key={item.id} className="text-xs">
                      <Link
                        href={`/leads/${item.lead.id}?tab=visits`}
                        className={cn(
                          "block rounded-md border-l-2 bg-muted/50 px-2 py-1 hover:bg-muted",
                          pending ? "border-warning" : TONES[item.status],
                        )}
                      >
                        <span className="font-medium tabular-nums">
                          {format.time(item.scheduledAt)}
                        </span>{" "}
                        {item.label}
                        <span className="block truncate font-medium">{item.lead.name}</span>
                        <span className="block truncate text-muted-foreground">
                          {item.project.name}
                          {item.assignedToName ? ` · ${item.assignedToName}` : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
