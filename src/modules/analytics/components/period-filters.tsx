"use client";

import { parseAsString, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { DataTableSelectFilter } from "@/components/shared/data-table";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { Button } from "@/components/ui/button";
import { DATE_RANGE_PRESETS } from "@/lib/date-range";
import { cn } from "@/lib/utils";

type Choice = { value: string; label: string };

const parsers = {
  period: parseAsString,
  from: parseAsString,
  to: parseAsString,
  by: parseAsString,
  executive: parseAsString,
  manager: parseAsString,
  builder: parseAsString,
  project: parseAsString,
  source: parseAsString,
  status: parseAsString,
};

export type FilterKey = "executive" | "manager" | "builder" | "project" | "source" | "status";

/**
 * The one filter row above dashboards and reports: period presets, custom dates, bucket size and dimension filters
 * (M10-02, M10-08). Everything lives in the URL.
 */
export function PeriodFilters({
  preset,
  range,
  presets = DATE_RANGE_PRESETS.map((entry) => entry.value),
  granularity,
  filters = {},
  children,
}: {
  preset: string;
  range: { from: string; to: string };
  presets?: readonly string[];
  granularity?: string;
  filters?: Partial<Record<FilterKey, { label: string; choices: Choice[] }>>;
  children?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useQueryStates(parsers, { shallow: false, startTransition });
  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-2"
      aria-busy={pending}
      data-pending={pending || undefined}
    >
      <div
        className="inline-flex flex-wrap rounded-lg bg-muted p-1"
        role="group"
        aria-label="Period"
      >
        {DATE_RANGE_PRESETS.filter((entry) => presets.includes(entry.value)).map((entry) => (
          <Button
            key={entry.value}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={preset === entry.value}
            className={cn(
              "h-7 px-3 text-muted-foreground",
              preset === entry.value &&
                "bg-background text-foreground shadow-sm hover:bg-background",
            )}
            onClick={() => void setValues({ period: entry.value, from: null, to: null })}
          >
            {entry.label}
          </Button>
        ))}
      </div>
      <DateRangePicker
        className="h-8"
        allowClear={false}
        value={range}
        onChange={(next) =>
          void setValues({ period: null, from: next?.from ?? null, to: next?.to ?? null })
        }
      />
      {granularity ? (
        <DataTableSelectFilter
          label="Group by"
          value={granularity}
          onChange={(by) => void setValues({ by })}
          choices={[
            { value: "day", label: "By day" },
            { value: "week", label: "By week" },
            { value: "month", label: "By month" },
          ]}
          allLabel="Automatic"
          className="w-32"
        />
      ) : null}
      {(Object.entries(filters) as [FilterKey, { label: string; choices: Choice[] }][]).map(
        ([key, filter]) =>
          filter.choices.length ? (
            <DataTableSelectFilter
              key={key}
              label={`Filter by ${filter.label.toLowerCase()}`}
              value={values[key]}
              onChange={(value) => void setValues({ [key]: value })}
              choices={filter.choices}
              allLabel={`Any ${filter.label.toLowerCase()}`}
              className="w-44"
            />
          ) : null,
      )}
      {children ? <div className="ml-auto flex gap-2">{children}</div> : null}
    </div>
  );
}
