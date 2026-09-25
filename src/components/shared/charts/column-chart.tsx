"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { ChartTable, Legend } from "./chart-table";
import { compactNumber, niceTicks, seriesColor } from "./scale";

export interface ColumnSeries {
  key: string;
  label: string;
  /** Categorical slot 1–8 (fixed per entity, so filters never repaint it). */
  slot: number;
}

export interface ColumnDatum {
  key: string;
  label: string;
  values: Record<string, number>;
}

/**
 * Columns over time (M10 dashboards and reports): one baseline, thin columns with rounded tops, stacked with a
 * 2px surface gap when there are several series, a hairline grid, hover tooltip, legend for two or more series and a
 * table view.
 */
export function ColumnChart({
  title,
  data,
  series,
  height = 180,
  format = (value: number) => value.toLocaleString("en-IN"),
  className,
}: {
  title: string;
  data: ColumnDatum[];
  series: ColumnSeries[];
  height?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((datum) =>
    series.reduce((sum, entry) => sum + (datum.values[entry.key] ?? 0), 0),
  );
  const ticks = niceTicks(Math.max(...totals, 0));
  const top = ticks.at(-1)!;
  // Show about eight x labels whatever the number of columns.
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));
  const hovered = hover === null ? null : data[hover];

  return (
    <figure className={cn("w-full", className)} aria-label={title}>
      {series.length > 1 ? (
        <Legend
          items={series.map((entry) => ({ label: entry.label, color: seriesColor(entry.slot) }))}
        />
      ) : null}
      <div className="relative" style={{ height }}>
        {/* Grid and y ticks */}
        <div className="pointer-events-none absolute inset-0 left-10" aria-hidden>
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute right-0 left-0 border-t"
              style={{
                bottom: `${(tick / top) * 100}%`,
                borderColor: tick === 0 ? "var(--viz-axis)" : "var(--viz-grid)",
              }}
            >
              <span
                className="absolute -top-2 -left-10 w-8 text-right text-[10px] tabular-nums"
                style={{ color: "var(--viz-muted)" }}
              >
                {compactNumber(tick)}
              </span>
            </div>
          ))}
        </div>
        <div
          className="absolute inset-0 left-10 flex items-end"
          onMouseLeave={() => setHover(null)}
        >
          {data.map((datum, index) => (
            <div
              key={datum.key}
              className="flex h-full flex-1 cursor-default items-end justify-center"
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              tabIndex={0}
              aria-label={`${datum.label}: ${series.map((entry) => `${entry.label} ${format(datum.values[entry.key] ?? 0)}`).join(", ")}`}
            >
              <div
                className={cn(
                  "flex w-[70%] max-w-6 flex-col-reverse gap-[2px] transition-opacity",
                  hover !== null && hover !== index && "opacity-60",
                )}
                style={{ height: `${(totals[index]! / top) * 100}%` }}
              >
                {series.map((entry, position) => {
                  const value = datum.values[entry.key] ?? 0;
                  if (!value) return null;
                  const last = series
                    .slice(position + 1)
                    .every((next) => !(datum.values[next.key] ?? 0));
                  return (
                    <div
                      key={entry.key}
                      className={last ? "rounded-t" : undefined}
                      style={{
                        flexGrow: value,
                        flexBasis: 0,
                        background: seriesColor(entry.slot),
                        minHeight: 2,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          {hovered ? (
            <div
              className="pointer-events-none absolute z-10 min-w-32 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
              style={{
                left: `${((hover! + 0.5) / data.length) * 100}%`,
                top: 0,
                transform: hover! > data.length / 2 ? "translateX(-105%)" : "translateX(5%)",
              }}
              role="status"
            >
              <p className="mb-1 font-medium">{hovered.label}</p>
              {series.map((entry) => (
                <p key={entry.key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="inline-block size-2 rounded-[2px]"
                      style={{ background: seriesColor(entry.slot) }}
                    />
                    {entry.label}
                  </span>
                  <span className="tabular-nums">{format(hovered.values[entry.key] ?? 0)}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="ml-10 flex text-[10px]" style={{ color: "var(--viz-muted)" }} aria-hidden>
        {data.map((datum, index) => (
          <span key={datum.key} className="relative h-4 flex-1 pt-1">
            {index % labelEvery === 0 ? (
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                {datum.label}
              </span>
            ) : null}
          </span>
        ))}
      </div>
      <ChartTable
        caption={title}
        headers={["", ...series.map((entry) => entry.label)]}
        rows={data.map((datum) => [
          datum.label,
          ...series.map((entry) => format(datum.values[entry.key] ?? 0)),
        ])}
      />
    </figure>
  );
}
