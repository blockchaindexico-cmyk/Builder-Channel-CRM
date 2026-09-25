"use client";

import Link from "next/link";

import { useFormatters } from "@/components/shared/regional-settings";
import { cn } from "@/lib/utils";

import type { FollowUpRow } from "../server/follow-ups";

/** The week at a glance (M07-14): open follow-ups and callbacks per day, today highlighted. */
export function WeekCalendar({
  week,
  today,
}: {
  week: { date: string; items: FollowUpRow[] }[];
  /** Today's date (yyyy-MM-dd) in the organization's time zone. */
  today: string;
}) {
  const format = useFormatters();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" aria-label="This week">
      {week.map((day) => {
        const [year, month, date] = day.date.split("-").map(Number) as [number, number, number];
        const label = new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        });
        return (
          <section
            key={day.date}
            aria-label={label}
            className={cn(
              "min-h-28 rounded-lg border p-2",
              day.date === today && "border-primary bg-primary/5",
            )}
          >
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
              {label}
              {day.date === today ? " · today" : ""}
            </h3>
            {day.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing planned</p>
            ) : (
              <ul className="space-y-1.5">
                {day.items.map((item) => (
                  <li key={item.id} className="text-xs">
                    <Link
                      href={`/leads/${item.lead.id}`}
                      className={cn(
                        "block rounded-md border-l-2 bg-muted/50 px-2 py-1 hover:bg-muted",
                        item.type === "CALLBACK" ? "border-primary" : "border-muted-foreground/40",
                      )}
                    >
                      <span className="font-medium tabular-nums">{format.time(item.dueAt)}</span>{" "}
                      {item.type === "CALLBACK" ? "Callback" : "Follow-up"}
                      <span className="block truncate">{item.lead.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
