import Link from "next/link";

import type { DateRange } from "@/lib/date-range";
import { cn } from "@/lib/utils";

import type { TeamVisitRow } from "../server/visit-lists";

/** Visits per executive (M08-06, PRD §11): managers see who is visiting and how it goes. */
export function TeamVisitsTable({
  rows,
  range,
}: {
  rows: TeamVisitRow[];
  range: DateRange | null;
}) {
  const link = (membershipId: string | null, status?: string) => {
    const params = new URLSearchParams();
    if (membershipId) params.set("executive", membershipId);
    if (status) params.set("status", status);
    if (range) {
      params.set("from", range.from);
      params.set("to", range.to);
    }
    return `/visits?${params.toString()}`;
  };
  const cell = (value: number, href: string, attention = false) =>
    value > 0 ? (
      <Link
        href={href}
        className={cn(
          "tabular-nums hover:underline",
          attention && "font-semibold text-destructive",
        )}
      >
        {value}
      </Link>
    ) : (
      <span className="text-muted-foreground tabular-nums">0</span>
    );
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm" aria-label="Visits per person">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-2 font-medium">Executive</th>
            <th className="px-4 py-2 text-right font-medium">Coming up</th>
            <th className="px-4 py-2 text-right font-medium">Outcome pending</th>
            <th className="px-4 py-2 text-right font-medium">Done</th>
            <th className="px-4 py-2 text-right font-medium">Revisits done</th>
            <th className="px-4 py-2 text-right font-medium">No-shows</th>
            <th className="px-4 py-2 text-right font-medium">Cancelled</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                No visits in this period.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.membershipId ?? "none"}>
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  {row.name}
                </th>
                <td className="px-4 py-2 text-right">
                  {cell(row.upcoming, link(row.membershipId, "upcoming"))}
                </td>
                <td className="px-4 py-2 text-right">
                  {cell(row.pendingOutcome, link(row.membershipId, "pending-outcome"), true)}
                </td>
                <td className="px-4 py-2 text-right">
                  {cell(row.completed, link(row.membershipId, "COMPLETED"))}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{row.revisits}</td>
                <td className="px-4 py-2 text-right">
                  {cell(row.noShow, link(row.membershipId, "NO_SHOW"), true)}
                </td>
                <td className="px-4 py-2 text-right">
                  {cell(row.cancelled, link(row.membershipId, "CANCELLED"))}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
