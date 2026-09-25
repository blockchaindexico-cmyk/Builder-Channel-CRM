import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { formatCalendarDate, formatMoney, type RegionalFormatSettings } from "@/lib/format";

import type { BookingRow } from "../server/bookings";
import { BookingStatusBadge } from "./badges";

/** A lead's bookings as cards linking to their page (M08-08). Values only for people allowed to see them. */
export function BookingCards({
  rows,
  regional,
}: {
  rows: BookingRow[];
  regional: RegionalFormatSettings;
}) {
  return (
    <ul className="grid gap-3 md:grid-cols-2" aria-label="Bookings">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/bookings/${row.id}`}
            className="group flex h-full flex-col gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{row.number}</span>
              <span className="flex items-center gap-1">
                <BookingStatusBadge status={row.status} stage={row.stage?.label} />
                <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground" />
              </span>
            </div>
            <p>
              <span className="font-medium">{row.project.name}</span>
              <span className="text-muted-foreground"> · {row.builder.name}</span>
            </p>
            <p className="text-muted-foreground">
              {[
                row.tower ? `Tower ${row.tower}` : null,
                row.unitNumber ? `Unit ${row.unitNumber}` : null,
                row.configuration,
              ]
                .filter(Boolean)
                .join(" · ") || "Unit not recorded yet"}
            </p>
            <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Booked on</dt>
              <dd>{formatCalendarDate(row.bookingDate, regional)}</dd>
              <dt className="text-muted-foreground">Credited to</dt>
              <dd>{row.executive.name}</dd>
              {!row.valuesHidden ? (
                <>
                  <dt className="text-muted-foreground">Agreement value</dt>
                  <dd>{formatMoney(row.agreementValue, regional)}</dd>
                </>
              ) : null}
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}
