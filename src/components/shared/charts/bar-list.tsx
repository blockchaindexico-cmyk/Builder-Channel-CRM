import Link from "next/link";

import { cn } from "@/lib/utils";

import { ChartTable, Legend } from "./chart-table";
import { seriesColor } from "./scale";

export interface BarListItem {
  key: string;
  label: string;
  /** One value per segment (a single-series list has one segment). */
  values: number[];
  /** Text at the bar's tip, e.g. "12 · 40%". Defaults to the total. */
  display?: string;
  href?: string;
  hint?: string;
}

/**
 * Horizontal bars for ranked lists (executives, sources, projects, reasons): 4px rounded ends, square at the
 * baseline, values at the tip, segments separated by a 2px gap, a legend when there are several segments, and a
 * table view.
 */
export function BarList({
  title,
  items,
  segments = [{ label: "Value", slot: 1 }],
  empty = "Nothing in this period.",
  format = (value: number) => value.toLocaleString("en-IN"),
  className,
}: {
  title: string;
  items: BarListItem[];
  segments?: { label: string; slot: number }[];
  empty?: string;
  format?: (value: number) => string;
  className?: string;
}) {
  const max = Math.max(
    1,
    ...items.map((item) => item.values.reduce((sum, value) => sum + value, 0)),
  );
  if (items.length === 0)
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <figure className={cn("w-full", className)} aria-label={title}>
      {segments.length > 1 ? (
        <Legend
          items={segments.map((segment) => ({
            label: segment.label,
            color: seriesColor(segment.slot),
          }))}
        />
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => {
          const total = item.values.reduce((sum, value) => sum + value, 0);
          const label = item.href ? (
            <Link href={item.href} className="truncate hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="truncate">{item.label}</span>
          );
          return (
            <li
              key={item.key}
              className="grid grid-cols-[minmax(6rem,11rem)_1fr] items-center gap-3 text-sm"
              title={
                segments.length > 1
                  ? segments
                      .map(
                        (segment, index) => `${segment.label}: ${format(item.values[index] ?? 0)}`,
                      )
                      .join(" · ")
                  : undefined
              }
            >
              <span className="flex min-w-0 flex-col">
                {label}
                {item.hint ? (
                  <span className="truncate text-xs text-muted-foreground">{item.hint}</span>
                ) : null}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="flex h-3 min-w-0 gap-[2px]"
                  style={{ width: `${(total / max) * 100}%` }}
                >
                  {item.values.map((value, index) =>
                    value ? (
                      <span
                        key={index}
                        className={
                          index === item.values.findLastIndex((entry) => entry > 0)
                            ? "rounded-r"
                            : undefined
                        }
                        style={{
                          flexGrow: value,
                          flexBasis: 0,
                          background: seriesColor(segments[index]?.slot ?? 1),
                        }}
                      />
                    ) : null,
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {item.display ?? format(total)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <ChartTable
        caption={title}
        headers={[
          "",
          ...(segments.length > 1 ? segments.map((segment) => segment.label) : []),
          "Total",
        ]}
        rows={items.map((item) => [
          item.label,
          ...(segments.length > 1 ? item.values.map((value) => format(value)) : []),
          item.display ?? format(item.values.reduce((sum, value) => sum + value, 0)),
        ])}
      />
    </figure>
  );
}
