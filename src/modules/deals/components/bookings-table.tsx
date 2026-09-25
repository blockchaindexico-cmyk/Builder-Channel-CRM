"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Trophy } from "lucide-react";
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
import { useFormatters, useRegionalSettings } from "@/components/shared/regional-settings";
import { formatCalendarDate } from "@/lib/format";

import { BOOKING_STATUSES } from "../constants";
import type { BookingRow } from "../server/bookings";
import { BookingStatusBadge } from "./badges";

const filterParsers = {
  from: parseAsString,
  to: parseAsString,
  builder: parseAsString,
  project: parseAsString,
  manager: parseAsString,
  executive: parseAsString,
  status: parseAsString,
  stage: parseAsString,
  page: parseAsInteger,
};

type Option = { id: string; label: string };

/** Bookings (M08-08): by booking date, builder, project, manager, executive, status and stage. */
export function BookingsTable({
  rows,
  total,
  builders,
  projects,
  managers,
  executives,
  stages,
  canSeeValues,
}: {
  rows: BookingRow[];
  total: number;
  builders: Option[];
  projects: Option[];
  managers: Option[];
  executives: Option[];
  stages: Option[];
  canSeeValues: boolean;
}) {
  const format = useFormatters();
  const regional = useRegionalSettings();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(filterParsers, { shallow: false, startTransition });
  const set = (
    patch: Partial<Record<Exclude<keyof typeof filterParsers, "page">, string | null>>,
  ) => void setFilters({ ...patch, page: null });

  const columns: ColumnDef<BookingRow, unknown>[] = [
    {
      id: "number",
      accessorKey: "number",
      meta: { label: "Booking" },
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Booking" />,
      cell: ({ row }) => (
        <Link href={`/bookings/${row.original.id}`} className="font-medium hover:underline">
          {row.original.number}
        </Link>
      ),
    },
    {
      id: "bookingDate",
      accessorKey: "bookingDate",
      meta: { label: "Booked on" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Booked on" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {formatCalendarDate(row.original.bookingDate, regional)}
        </span>
      ),
    },
    {
      id: "customer",
      meta: { label: "Customer" },
      enableSorting: false,
      header: "Customer",
      cell: ({ row }) => (
        <Link href={`/leads/${row.original.lead.id}`} className="flex flex-col hover:underline">
          <span className="font-medium">{row.original.customerName}</span>
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
      id: "unit",
      meta: { label: "Unit" },
      enableSorting: false,
      header: "Unit",
      cell: ({ row }) =>
        [
          row.original.tower ? `T-${row.original.tower}` : null,
          row.original.unitNumber,
          row.original.configuration,
        ]
          .filter(Boolean)
          .join(" · ") || <span className="text-muted-foreground">—</span>,
    },
    {
      id: "status",
      meta: { label: "Status" },
      enableSorting: false,
      header: "Status",
      cell: ({ row }) => (
        <BookingStatusBadge status={row.original.status} stage={row.original.stage?.label} />
      ),
    },
    {
      id: "executive",
      meta: { label: "Executive" },
      enableSorting: false,
      header: "Executive",
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span>{row.original.executive.name}</span>
          {row.original.manager ? (
            <span className="text-xs text-muted-foreground">{row.original.manager.name}</span>
          ) : null}
        </span>
      ),
    },
    ...(canSeeValues
      ? [
          {
            id: "agreementValue",
            accessorKey: "agreementValue",
            meta: { label: "Agreement value" },
            header: ({ column }) => (
              <DataTableColumnHeader column={column} title="Agreement value" />
            ),
            cell: ({ row }) => (
              <span className="whitespace-nowrap tabular-nums">
                {format.money(row.original.agreementValue)}
              </span>
            ),
          } satisfies ColumnDef<BookingRow, unknown>,
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
          icon={Trophy}
          title="No bookings match"
          description="Bookings are created from a lead once the customer books a unit."
          className="border-none"
        />
      }
      toolbar={(table) => (
        <DataTableToolbar table={table} searchPlaceholder="Search booking, customer or unit…">
          <DateRangePicker
            className="h-8"
            value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
            onChange={(range) => set({ from: range?.from ?? null, to: range?.to ?? null })}
          />
          <DataTableSelectFilter
            label="Filter by status"
            value={filters.status}
            onChange={(value) => set({ status: value })}
            choices={BOOKING_STATUSES.map((status) => ({
              value: status.value,
              label: status.label,
            }))}
            allLabel="Any status"
          />
          {stages.length > 1 ? (
            <DataTableSelectFilter
              label="Filter by stage"
              value={filters.stage}
              onChange={(value) => set({ stage: value })}
              choices={stages.map((stage) => ({ value: stage.id, label: stage.label }))}
              allLabel="Any stage"
            />
          ) : null}
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
          {managers.length > 0 ? (
            <DataTableSelectFilter
              label="Filter by manager"
              value={filters.manager}
              onChange={(value) => set({ manager: value })}
              choices={managers.map((member) => ({ value: member.id, label: member.label }))}
              allLabel="Any manager"
            />
          ) : null}
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
