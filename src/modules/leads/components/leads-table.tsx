"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Contact, ListFilter, X } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { type ReactNode, useTransition } from "react";

import { DataTable, DataTableColumnHeader, DataTableToolbar } from "@/components/shared/data-table";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/regional-settings";
import { RelativeTime } from "@/components/shared/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPhone } from "@/lib/phone";

import { STATUS_CATEGORIES, TEMPERATURES } from "../constants";
import type { LeadRow } from "../server/leads";
import type { LeadStatusRow } from "../server/masters";
import { LeadStatusBadge, TemperatureBadge } from "./badges";
import { StatusDialog, type StatusPermissions } from "./status-dialog";

const ALL = "__all__";

export interface LeadListOptions {
  statuses: LeadStatusRow[];
  sources: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
  owners: { membershipId: string; name: string; status: string }[];
  managers: { membershipId: string; name: string }[];
  projects: { id: string; name: string; builderName: string }[];
  builders: { id: string; name: string }[];
}

const filterParsers = {
  status: parseAsString,
  category: parseAsString,
  source: parseAsString,
  campaign: parseAsString,
  owner: parseAsString,
  team: parseAsString,
  project: parseAsString,
  builder: parseAsString,
  temperature: parseAsString,
  tag: parseAsString,
  createdFrom: parseAsString,
  createdTo: parseAsString,
  activityFrom: parseAsString,
  activityTo: parseAsString,
  page: parseAsInteger.withDefault(1),
};

function FilterSelect({
  label,
  value,
  onChange,
  choices,
  allLabel,
  className = "w-40",
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  choices: { value: string; label: ReactNode }[];
  allLabel: string;
  className?: string;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? null : next)}>
      <SelectTrigger size="sm" className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Lead list (M04-12 → M04-15): server paging/sorting, URL filters, column chooser and bulk actions. */
export function LeadsTable({
  rows,
  total,
  options,
  canBulkStatus,
  statusPermissions,
  bulkExtra,
}: {
  rows: LeadRow[];
  total: number;
  options: LeadListOptions;
  canBulkStatus: boolean;
  statusPermissions: StatusPermissions;
  /** Extra bulk actions from the page (e.g. export selected). */
  bulkExtra?: (selected: LeadRow[]) => ReactNode;
}) {
  const format = useFormatters();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(filterParsers, { shallow: false, startTransition });
  type Patch = Exclude<Parameters<typeof setFilters>[0], ((...args: never[]) => unknown) | null>;
  const set = (patch: Patch) => void setFilters({ ...patch, page: null });

  const statusChoices = options.statuses.map((status) => ({
    value: status.id,
    label: (
      <span className="inline-flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ backgroundColor: status.color }} />
        {status.label}
      </span>
    ),
  }));
  const ownerChoices = [
    { value: "unassigned", label: "Unassigned" },
    ...options.owners.map((owner) => ({
      value: owner.membershipId,
      label: owner.status === "INACTIVE" ? `${owner.name} (inactive)` : owner.name,
    })),
  ];

  const active: { key: keyof typeof filters; label: string }[] = [];
  const name = <T extends { id?: string; membershipId?: string; name?: string; label?: string }>(
    list: T[],
    id: string | null,
  ) => list.find((entry) => (entry.id ?? entry.membershipId) === id);
  if (filters.category)
    active.push({
      key: "category",
      label: `Category: ${STATUS_CATEGORIES.find((c) => c.value === filters.category)?.label}`,
    });
  if (filters.campaign)
    active.push({
      key: "campaign",
      label: `Campaign: ${name(options.campaigns, filters.campaign)?.name ?? "?"}`,
    });
  if (filters.team)
    active.push({
      key: "team",
      label: `Team of ${name(options.managers, filters.team)?.name ?? "?"}`,
    });
  if (filters.project)
    active.push({
      key: "project",
      label: `Project: ${name(options.projects, filters.project)?.name ?? "?"}`,
    });
  if (filters.builder)
    active.push({
      key: "builder",
      label: `Builder: ${name(options.builders, filters.builder)?.name ?? "?"}`,
    });
  if (filters.temperature)
    active.push({
      key: "temperature",
      label: `Temperature: ${TEMPERATURES.find((entry) => entry.value === filters.temperature)?.label ?? filters.temperature}`,
    });
  if (filters.tag) active.push({ key: "tag", label: `Tag: ${filters.tag}` });
  const moreCount = active.length + (filters.createdFrom ? 1 : 0) + (filters.activityFrom ? 1 : 0);

  const columns: ColumnDef<LeadRow, unknown>[] = [
    {
      id: "name",
      accessorKey: "name",
      meta: { label: "Lead" },
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lead" />,
      cell: ({ row }) => (
        <Link href={`/leads/${row.original.id}`} className="flex min-w-40 flex-col hover:underline">
          <span className="flex items-center gap-2 font-medium">
            {row.original.name}
            {row.original.duplicateStatus === "SUSPECTED" ? (
              <Badge variant="warning">Possible duplicate</Badge>
            ) : null}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{row.original.number}</span>
        </Link>
      ),
    },
    {
      id: "contact",
      meta: { label: "Contact" },
      enableSorting: false,
      header: "Contact",
      cell: ({ row }) => (
        <div className="flex flex-col text-sm">
          <span>{row.original.mobile ? formatPhone(row.original.mobile) : "—"}</span>
          {row.original.email ? (
            <span className="text-xs text-muted-foreground">{row.original.email}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "status",
      meta: { label: "Status" },
      enableSorting: false,
      header: "Status",
      cell: ({ row }) => (
        <LeadStatusBadge label={row.original.status.label} color={row.original.status.color} />
      ),
    },
    {
      id: "owner",
      meta: { label: "Owner" },
      enableSorting: false,
      header: "Owner",
      cell: ({ row }) =>
        row.original.ownerName ?? <span className="text-muted-foreground">Unassigned</span>,
    },
    {
      id: "projects",
      meta: { label: "Projects" },
      enableSorting: false,
      header: "Projects",
      cell: ({ row }) =>
        row.original.projects.length ? (
          <span className="line-clamp-2 max-w-48 whitespace-normal">
            {row.original.projects.join(", ")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "source",
      meta: { label: "Source" },
      enableSorting: false,
      header: "Source",
      cell: ({ row }) =>
        row.original.sourceName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "budget",
      meta: { label: "Budget" },
      enableSorting: false,
      header: "Budget",
      cell: ({ row }) =>
        row.original.budgetMin || row.original.budgetMax ? (
          <span className="whitespace-nowrap">
            {[row.original.budgetMin, row.original.budgetMax]
              .filter(Boolean)
              .map((value) => format.money(value, { compact: true }))
              .join(" – ")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "temperature",
      meta: { label: "Temperature" },
      enableSorting: false,
      header: "Temperature",
      cell: ({ row }) => <TemperatureBadge value={row.original.temperature} />,
    },
    {
      id: "location",
      meta: { label: "Location" },
      enableSorting: false,
      header: "Location",
      cell: ({ row }) => row.original.location ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "lastActivityAt",
      accessorKey: "lastActivityAt",
      meta: { label: "Last activity" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last activity" />,
      cell: ({ row }) => <RelativeTime value={row.original.lastActivityAt} />,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      meta: { label: "Created" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{format.date(row.original.createdAt)}</span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      totalCount={total}
      getRowId={(row) => row.id}
      persistColumnsInUrl
      initiallyHiddenColumns={["location", "temperature"]}
      enableRowSelection={canBulkStatus || Boolean(bulkExtra)}
      bulkActions={(selected, clear) => (
        <>
          {canBulkStatus ? (
            <StatusDialog
              statuses={options.statuses}
              leadIds={selected.map((row) => row.id)}
              permissions={statusPermissions}
              onDone={clear}
              trigger={
                <Button size="sm" variant="outline">
                  Change status
                </Button>
              }
            />
          ) : null}
          {bulkExtra?.(selected)}
          <Button size="sm" variant="ghost" onClick={clear}>
            Clear selection
          </Button>
        </>
      )}
      emptyState={
        <EmptyState
          icon={Contact}
          title="No leads match"
          description="Try another view, a wider date range or fewer filters."
          className="border-none"
        />
      }
      toolbar={(table) => (
        <div className="space-y-2">
          <DataTableToolbar
            table={table}
            searchPlaceholder="Search name, mobile, e-mail or lead number…"
          >
            <FilterSelect
              label="Filter by status"
              value={filters.status}
              onChange={(value) => set({ status: value })}
              choices={statusChoices}
              allLabel="Any status"
              className="w-44"
            />
            <FilterSelect
              label="Filter by owner"
              value={filters.owner}
              onChange={(value) => set({ owner: value })}
              choices={ownerChoices}
              allLabel="Any owner"
            />
            <FilterSelect
              label="Filter by source"
              value={filters.source}
              onChange={(value) => set({ source: value })}
              choices={options.sources.map((source) => ({ value: source.id, label: source.name }))}
              allLabel="Any source"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <ListFilter /> More filters{moreCount ? ` (${moreCount})` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(92vw,26rem)] space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Status category</Label>
                    <FilterSelect
                      label="Filter by status category"
                      value={filters.category}
                      onChange={(value) => set({ category: value })}
                      choices={STATUS_CATEGORIES.map((category) => ({
                        value: category.value,
                        label: category.label,
                      }))}
                      allLabel="Any"
                      className="w-full"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Temperature</Label>
                    <FilterSelect
                      label="Filter by temperature"
                      value={filters.temperature}
                      onChange={(value) => set({ temperature: value })}
                      choices={TEMPERATURES.map((entry) => ({
                        value: entry.value,
                        label: entry.label,
                      }))}
                      allLabel="Any"
                      className="w-full"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Builder</Label>
                    <FilterSelect
                      label="Filter by builder"
                      value={filters.builder}
                      onChange={(value) => set({ builder: value })}
                      choices={options.builders.map((builder) => ({
                        value: builder.id,
                        label: builder.name,
                      }))}
                      allLabel="Any"
                      className="w-full"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Project</Label>
                    <FilterSelect
                      label="Filter by project"
                      value={filters.project}
                      onChange={(value) => set({ project: value })}
                      choices={options.projects.map((project) => ({
                        value: project.id,
                        label: project.name,
                      }))}
                      allLabel="Any"
                      className="w-full"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Campaign</Label>
                    <FilterSelect
                      label="Filter by campaign"
                      value={filters.campaign}
                      onChange={(value) => set({ campaign: value })}
                      choices={options.campaigns.map((campaign) => ({
                        value: campaign.id,
                        label: campaign.name,
                      }))}
                      allLabel="Any"
                      className="w-full"
                    />
                  </div>
                  {options.managers.length > 0 ? (
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Manager&apos;s team</Label>
                      <FilterSelect
                        label="Filter by team"
                        value={filters.team}
                        onChange={(value) => set({ team: value })}
                        choices={options.managers.map((manager) => ({
                          value: manager.membershipId,
                          label: manager.name,
                        }))}
                        allLabel="Any team"
                        className="w-full"
                      />
                    </div>
                  ) : null}
                  <div className="grid gap-1.5">
                    <Label className="text-xs" htmlFor="lead-tag-filter">
                      Tag
                    </Label>
                    <Input
                      id="lead-tag-filter"
                      className="h-8"
                      defaultValue={filters.tag ?? ""}
                      placeholder="e.g. NRI"
                      onKeyDown={(event) => {
                        if (event.key === "Enter")
                          set({ tag: event.currentTarget.value.trim() || null });
                      }}
                      onBlur={(event) => set({ tag: event.currentTarget.value.trim() || null })}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Created</Label>
                  <DateRangePicker
                    className="h-8 w-full justify-start"
                    value={
                      filters.createdFrom && filters.createdTo
                        ? { from: filters.createdFrom, to: filters.createdTo }
                        : null
                    }
                    onChange={(range) =>
                      set({ createdFrom: range?.from ?? null, createdTo: range?.to ?? null })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Last activity</Label>
                  <DateRangePicker
                    className="h-8 w-full justify-start"
                    value={
                      filters.activityFrom && filters.activityTo
                        ? { from: filters.activityFrom, to: filters.activityTo }
                        : null
                    }
                    onChange={(range) =>
                      set({ activityFrom: range?.from ?? null, activityTo: range?.to ?? null })
                    }
                  />
                </div>
              </PopoverContent>
            </Popover>
          </DataTableToolbar>
          {active.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {active.map((entry) => (
                <Badge key={entry.key} variant="secondary" className="gap-1 pr-1">
                  {entry.label}
                  <button
                    type="button"
                    aria-label={`Remove filter ${entry.label}`}
                    className="rounded-sm hover:bg-foreground/10"
                    onClick={() => set({ [entry.key]: null } as Patch)}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      )}
    />
  );
}
