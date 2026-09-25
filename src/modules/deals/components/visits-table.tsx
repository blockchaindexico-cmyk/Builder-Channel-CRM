"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Car, MapPinned } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useTransition } from "react";

import {
  DataTable,
  DataTableColumnHeader,
  DataTableSelectFilter,
  DataTableToolbar,
} from "@/components/shared/data-table";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/regional-settings";

import type { VisitRow } from "../server/visits";
import { VisitKindBadge, VisitOutcomeBadge, VisitStatusBadge } from "./badges";
import { type VisitAbilities, VisitActions } from "./visit-actions";

const filterParsers = {
  from: parseAsString,
  to: parseAsString,
  project: parseAsString,
  builder: parseAsString,
  executive: parseAsString,
  status: parseAsString,
  kind: parseAsString,
  page: parseAsInteger,
};

export const VISIT_STATUS_FILTERS = [
  { value: "upcoming", label: "Coming up" },
  { value: "pending-outcome", label: "Outcome pending" },
  { value: "COMPLETED", label: "Done" },
  { value: "NO_SHOW", label: "No-show" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "RESCHEDULED", label: "Moved" },
];

/** Visits list (M08-06): by date, project, builder, executive, status and visit/revisit. */
export function VisitsTable({
  rows,
  total,
  projects,
  builders,
  executives,
  canManage,
  abilities,
  now,
}: {
  rows: VisitRow[];
  total: number;
  projects: { id: string; label: string }[];
  builders: { id: string; label: string }[];
  /** People whose visits the viewer may filter by (empty when they only see their own). */
  executives: { id: string; label: string }[];
  canManage: boolean;
  abilities: VisitAbilities;
  now: string;
}) {
  const format = useFormatters();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(filterParsers, { shallow: false, startTransition });
  const set = (
    patch: Partial<Record<Exclude<keyof typeof filterParsers, "page">, string | null>>,
  ) => void setFilters({ ...patch, page: null });
  const nowMs = new Date(now).getTime();
  const isOpen = (row: VisitRow) => row.status === "SCHEDULED" || row.status === "CONFIRMED";

  const columns: ColumnDef<VisitRow, unknown>[] = [
    {
      id: "scheduledAt",
      accessorKey: "scheduledAt",
      meta: { label: "When" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{format.dateTime(row.original.scheduledAt)}</span>
      ),
    },
    {
      id: "visit",
      meta: { label: "Visit" },
      enableSorting: false,
      header: "Visit",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5">
          <VisitKindBadge label={row.original.label} isRevisit={row.original.isRevisit} />
          {row.original.pickupRequired ? (
            <Car className="size-3.5 text-muted-foreground" aria-label="Pickup" />
          ) : null}
        </span>
      ),
    },
    {
      id: "lead",
      meta: { label: "Lead" },
      enableSorting: false,
      enableHiding: false,
      header: "Lead",
      cell: ({ row }) => (
        <Link
          href={`/leads/${row.original.lead.id}?tab=visits`}
          className="flex flex-col hover:underline"
        >
          <span className="font-medium">{row.original.lead.name}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.lead.number}
          </span>
        </Link>
      ),
    },
    {
      id: "project",
      meta: { label: "Project" },
      enableSorting: false,
      header: "Project",
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span>{row.original.project.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.builder.name}</span>
        </span>
      ),
    },
    {
      id: "executive",
      meta: { label: "Executive" },
      enableSorting: false,
      header: "Executive",
      cell: ({ row }) =>
        row.original.assignedToName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "status",
      meta: { label: "Status" },
      enableSorting: false,
      header: "Status",
      cell: ({ row }) => (
        <span className="flex flex-col items-start gap-1">
          <VisitStatusBadge
            status={row.original.status}
            pending={isOpen(row.original) && new Date(row.original.scheduledAt).getTime() < nowMs}
          />
          {row.original.outcome ? (
            <VisitOutcomeBadge
              label={row.original.outcome.label}
              category={row.original.outcome.category}
            />
          ) : null}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            meta: { label: "Actions" },
            enableSorting: false,
            enableHiding: false,
            header: () => <span className="sr-only">Actions</span>,
            cell: ({ row }) =>
              isOpen(row.original) ? (
                <VisitActions
                  visit={{
                    id: row.original.id,
                    label: row.original.label,
                    status: row.original.status,
                    scheduledAt: row.original.scheduledAt,
                    assignedToId: row.original.assignedToId,
                    project: row.original.project,
                    lead: row.original.lead,
                  }}
                  abilities={abilities}
                  now={now}
                />
              ) : null,
          } satisfies ColumnDef<VisitRow, unknown>,
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      totalCount={total}
      getRowId={(row) => row.id}
      emptyState={
        <EmptyState
          icon={MapPinned}
          title="No visits match"
          description="Try a wider date range or fewer filters."
          className="border-none"
        />
      }
      toolbar={(table) => (
        <DataTableToolbar table={table} searchPlaceholder="Search lead or project…">
          <DateRangePicker
            className="h-8"
            value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
            onChange={(range) => set({ from: range?.from ?? null, to: range?.to ?? null })}
          />
          <DataTableSelectFilter
            label="Filter by status"
            value={filters.status}
            onChange={(value) => set({ status: value })}
            choices={VISIT_STATUS_FILTERS}
            allLabel="Any status"
          />
          <DataTableSelectFilter
            label="Filter by visit or revisit"
            value={filters.kind}
            onChange={(value) => set({ kind: value })}
            choices={[
              { value: "visit", label: "First visits" },
              { value: "revisit", label: "Revisits" },
            ]}
            allLabel="Visits and revisits"
          />
          <DataTableSelectFilter
            label="Filter by builder"
            value={filters.builder}
            onChange={(value) => set({ builder: value })}
            choices={builders.map((builder) => ({ value: builder.id, label: builder.label }))}
            allLabel="Any builder"
          />
          <DataTableSelectFilter
            label="Filter by project"
            value={filters.project}
            onChange={(value) => set({ project: value })}
            choices={projects.map((project) => ({ value: project.id, label: project.label }))}
            allLabel="Any project"
          />
          {executives.length > 0 ? (
            <DataTableSelectFilter
              label="Filter by executive"
              value={filters.executive}
              onChange={(value) => set({ executive: value })}
              choices={executives.map((member) => ({ value: member.id, label: member.label }))}
              allLabel="Anyone"
            />
          ) : null}
        </DataTableToolbar>
      )}
    />
  );
}
