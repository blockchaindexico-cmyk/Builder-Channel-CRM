"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Radio } from "lucide-react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { DataTable, DataTableColumnHeader, DataTableToolbar } from "@/components/shared/data-table";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/regional-settings";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { DomainEventRow } from "../server/service";

const ALL = "__all__";

function useEventColumns(): ColumnDef<DomainEventRow, unknown>[] {
  const format = useFormatters();
  return [
    {
      accessorKey: "type",
      meta: { label: "Event" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Event" />,
      cell: ({ row }) => (
        <Badge variant="secondary" className="font-mono">
          {row.original.type}
        </Badge>
      ),
      enableHiding: false,
    },
    {
      accessorKey: "occurredAt",
      meta: { label: "Occurred" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Occurred" />,
      cell: ({ row }) => (
        <span title={row.original.occurredAt}>{format.dateTime(row.original.occurredAt)}</span>
      ),
    },
    {
      id: "actor",
      meta: { label: "Performed by" },
      enableSorting: false,
      header: "Performed by",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.actorName ?? "—"}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.actorType.toLowerCase()}
          </span>
        </div>
      ),
    },
    {
      id: "handlers",
      meta: { label: "Delivered to" },
      enableSorting: false,
      header: "Delivered to",
      cell: ({ row }) =>
        row.original.dispatchedTo.length ? (
          <div className="flex flex-wrap gap-1">
            {row.original.dispatchedTo.map((handler) => (
              <Badge key={handler} variant="outline" className="font-mono text-[11px]">
                {handler}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">No subscribers</span>
        ),
    },
    {
      accessorKey: "requestId",
      meta: { label: "Request ID" },
      enableSorting: false,
      header: "Request ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.requestId?.slice(0, 8) ?? "—"}
        </span>
      ),
    },
  ];
}

/** Domain-event log (M01-12) with URL-driven search, type filter, date range, sorting and paging. */
export function EventLogTable({
  rows,
  total,
  eventTypes,
}: {
  rows: DomainEventRow[];
  total: number;
  eventTypes: string[];
}) {
  const columns = useEventColumns();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(
    {
      type: parseAsString,
      from: parseAsString,
      to: parseAsString,
      page: parseAsInteger.withDefault(1),
    },
    { shallow: false, startTransition },
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      totalCount={total}
      getRowId={(row) => row.id}
      emptyState={
        <EmptyState
          icon={Radio}
          title="No events yet"
          description="Events appear here when data changes, e.g. after saving the organization profile."
          className="border-none"
        />
      }
      toolbar={(table) => (
        <DataTableToolbar table={table} searchPlaceholder="Search events or people…">
          <Select
            value={filters.type ?? ALL}
            onValueChange={(value) =>
              void setFilters({ type: value === ALL ? null : value, page: null })
            }
          >
            <SelectTrigger size="sm" className="w-52" aria-label="Filter by event type">
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All events</SelectItem>
              {eventTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangePicker
            className="h-8"
            value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
            onChange={(range) =>
              void setFilters({ from: range?.from ?? null, to: range?.to ?? null, page: null })
            }
          />
        </DataTableToolbar>
      )}
    />
  );
}
