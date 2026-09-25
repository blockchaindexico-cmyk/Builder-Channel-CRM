"use client";

import { Download } from "lucide-react";
import { parseAsString, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { DataTableSelectFilter } from "@/components/shared/data-table";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Choice = { value: string; label: string };

const parsers = {
  from: parseAsString,
  to: parseAsString,
  by: parseAsString,
  builder: parseAsString,
  category: parseAsString,
};

/**
 * Period (defaults to the current fiscal year), an optional "group by" and filter, and CSV/XLSX export of what is
 * shown (M09-14). State lives in the URL so reports can be shared and bookmarked.
 */
export function ReportFilters({
  period,
  dimensions,
  dimension,
  builders,
  categories,
  exportRegister,
}: {
  period: { from: string; to: string };
  dimensions?: readonly Choice[];
  dimension?: string;
  builders?: Choice[];
  categories?: readonly Choice[];
  exportRegister?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(parsers, { shallow: false, startTransition });
  const exportHref = (format: "csv" | "xlsx") => {
    const params = new URLSearchParams({
      register: exportRegister ?? "",
      format,
      from: period.from,
      to: period.to,
    });
    if (dimension) params.set("dimension", dimension);
    if (filters.builder) params.set("builderId", filters.builder);
    if (filters.category) params.set("category", filters.category);
    return `/api/billing/export?${params.toString()}`;
  };
  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2"
      aria-busy={pending}
      data-pending={pending || undefined}
    >
      <DateRangePicker
        className="h-8"
        allowClear={false}
        value={period}
        onChange={(range) => void setFilters({ from: range?.from ?? null, to: range?.to ?? null })}
      />
      {dimensions ? (
        <Select value={dimension} onValueChange={(by) => void setFilters({ by })}>
          <SelectTrigger size="sm" className="w-44" aria-label="Group by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dimensions.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                By {choice.label.toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {builders ? (
        <DataTableSelectFilter
          label="Filter by builder"
          value={filters.builder}
          onChange={(builder) => void setFilters({ builder })}
          choices={builders}
          allLabel="All builders"
          className="w-48"
        />
      ) : null}
      {categories ? (
        <DataTableSelectFilter
          label="Filter by category"
          value={filters.category}
          onChange={(category) => void setFilters({ category })}
          choices={[...categories]}
          allLabel="All categories"
        />
      ) : null}
      {exportRegister ? (
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={exportHref("csv")} download>
              <Download /> CSV
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={exportHref("xlsx")} download>
              <Download /> Excel
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
