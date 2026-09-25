"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Building, PanelRightOpen, X } from "lucide-react";
import Link from "next/link";
import { parseAsBoolean, parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useState, useTransition } from "react";

import { DataTable, DataTableColumnHeader, DataTableToolbar } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { parseAmountInput } from "@/lib/decimal";
import { formatMonthYear } from "@/lib/format";

import { PROJECT_STATUSES } from "../../schemas";
import type { ProjectRow } from "../../server/projects";
import { PriceRange } from "../shared/price-range";
import { InactiveBadge, ProjectStatusBadge } from "../shared/project-status-badge";
import { ProjectQuickInfoSheet } from "./project-quick-info";

const ALL = "__all__";

export interface ProjectFilterOptions {
  builders: { id: string; name: string; isActive: boolean }[];
  cities: string[];
  propertyTypes: { id: string; name: string }[];
  configurationTypes: { id: string; name: string }[];
}

function BudgetInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string | null;
  onCommit: (value: string | null) => void;
}) {
  const format = useFormatters();
  const [text, setText] = useState(value ? format.money(value, { compact: true }) : "");
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (!text.trim()) {
      setInvalid(false);
      return onCommit(null);
    }
    const parsed = parseAmountInput(text);
    setInvalid(parsed === null);
    if (parsed !== null) onCommit(parsed);
  };
  return (
    <Input
      aria-label={label}
      placeholder={label}
      value={text}
      aria-invalid={invalid}
      className="h-8 w-28"
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

/** Projects list (M03-06) with filters by builder, city, status, type, configuration and budget. */
export function ProjectsTable({
  rows,
  total,
  options,
}: {
  rows: ProjectRow[];
  total: number;
  options: ProjectFilterOptions;
}) {
  const [quickView, setQuickView] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(
    {
      builder: parseAsString,
      city: parseAsString,
      status: parseAsString,
      type: parseAsString,
      config: parseAsString,
      budgetMin: parseAsString,
      budgetMax: parseAsString,
      inactive: parseAsBoolean.withDefault(false),
      page: parseAsInteger.withDefault(1),
    },
    { shallow: false, startTransition },
  );
  type FilterPatch = Exclude<
    Parameters<typeof setFilters>[0],
    ((...args: never[]) => unknown) | null
  >;
  const set = (patch: FilterPatch) => void setFilters({ ...patch, page: null });
  const filtered =
    filters.builder ||
    filters.city ||
    filters.status ||
    filters.type ||
    filters.config ||
    filters.budgetMin ||
    filters.budgetMax ||
    filters.inactive;

  const columns: ColumnDef<ProjectRow, unknown>[] = [
    {
      id: "name",
      accessorKey: "name",
      meta: { label: "Project" },
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Project" />,
      cell: ({ row }) => (
        <div className="flex min-w-48 flex-col">
          <Link
            href={`/projects/${row.original.id}`}
            className="flex items-center gap-2 font-medium hover:underline"
          >
            {row.original.name}
            {!row.original.isActive ? <InactiveBadge /> : null}
          </Link>
          <span className="text-xs text-muted-foreground">
            {row.original.builderName} · <span className="font-mono">{row.original.code}</span>
          </span>
        </div>
      ),
    },
    {
      id: "location",
      meta: { label: "Location" },
      enableSorting: false,
      header: "Location",
      cell: ({ row }) =>
        [row.original.locality, row.original.city].filter(Boolean).join(", ") || (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      meta: { label: "Status" },
      enableSorting: false,
      header: "Status",
      cell: ({ row }) => <ProjectStatusBadge status={row.original.status} />,
    },
    {
      id: "configurations",
      meta: { label: "Configurations" },
      enableSorting: false,
      header: "Configurations",
      cell: ({ row }) => (
        <span className="line-clamp-2 max-w-48 whitespace-normal">
          {row.original.configurations.join(", ") || (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      ),
    },
    {
      id: "priceMin",
      accessorKey: "priceMin",
      meta: { label: "Price" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
      cell: ({ row }) => <PriceRange min={row.original.priceMin} max={row.original.priceMax} />,
    },
    {
      id: "possessionDate",
      accessorKey: "possessionDate",
      meta: { label: "Possession" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Possession" />,
      cell: ({ row }) => formatMonthYear(row.original.possessionDate),
    },
    {
      id: "propertyTypes",
      meta: { label: "Property type" },
      enableSorting: false,
      header: "Property type",
      cell: ({ row }) =>
        row.original.propertyTypes.join(", ") || <span className="text-muted-foreground">—</span>,
    },
    {
      id: "quick",
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Quick view</span>,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Quick view of ${row.original.name}`}
          onClick={() => setQuickView(row.original.id)}
        >
          <PanelRightOpen />
        </Button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        totalCount={total}
        getRowId={(row) => row.id}
        initiallyHiddenColumns={["propertyTypes"]}
        emptyState={
          <EmptyState
            icon={Building}
            title={filtered ? "No projects match these filters" : "No projects yet"}
            description={
              filtered
                ? "Try a wider budget or fewer filters."
                : "Projects added for your builders appear here."
            }
            className="border-none"
          />
        }
        toolbar={(table) => (
          <DataTableToolbar
            table={table}
            searchPlaceholder="Search project, builder, locality, RERA…"
          >
            <Select
              value={filters.builder ?? ALL}
              onValueChange={(value) => set({ builder: value === ALL ? null : value })}
            >
              <SelectTrigger size="sm" className="w-44" aria-label="Filter by builder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All builders</SelectItem>
                {options.builders.map((builder) => (
                  <SelectItem key={builder.id} value={builder.id}>
                    {builder.name}
                    {builder.isActive ? "" : " (inactive)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.city ?? ALL}
              onValueChange={(value) => set({ city: value === ALL ? null : value })}
            >
              <SelectTrigger size="sm" className="w-36" aria-label="Filter by city">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All cities</SelectItem>
                {options.cities.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.status ?? ALL}
              onValueChange={(value) => set({ status: value === ALL ? null : value })}
            >
              <SelectTrigger size="sm" className="w-44" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any status</SelectItem>
                {PROJECT_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.type ?? ALL}
              onValueChange={(value) => set({ type: value === ALL ? null : value })}
            >
              <SelectTrigger size="sm" className="w-44" aria-label="Filter by property type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any property type</SelectItem>
                {options.propertyTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.config ?? ALL}
              onValueChange={(value) => set({ config: value === ALL ? null : value })}
            >
              <SelectTrigger size="sm" className="w-44" aria-label="Filter by configuration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any configuration</SelectItem>
                {options.configurationTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <BudgetInput
                label="Budget from"
                value={filters.budgetMin}
                onCommit={(value) => set({ budgetMin: value })}
              />
              <span className="text-muted-foreground">–</span>
              <BudgetInput
                label="Budget to"
                value={filters.budgetMax}
                onCommit={(value) => set({ budgetMax: value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="show-inactive"
                checked={filters.inactive}
                onCheckedChange={(checked) => set({ inactive: checked || null })}
              />
              <Label htmlFor="show-inactive" className="text-sm font-normal">
                Show inactive
              </Label>
            </div>
            {filtered ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  set({
                    builder: null,
                    city: null,
                    status: null,
                    type: null,
                    config: null,
                    budgetMin: null,
                    budgetMax: null,
                    inactive: null,
                  })
                }
              >
                <X /> Clear filters
              </Button>
            ) : null}
          </DataTableToolbar>
        )}
      />
      <ProjectQuickInfoSheet
        projectId={quickView}
        onOpenChange={(open) => !open && setQuickView(null)}
      />
    </>
  );
}
