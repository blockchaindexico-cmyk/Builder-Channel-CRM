"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ScrollText } from "lucide-react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useState, useTransition } from "react";

import { DataTable, DataTableColumnHeader, DataTableToolbar } from "@/components/shared/data-table";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/regional-settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { AuditLogRow } from "../../server/audit-log";
import { AuditEntryDetails } from "./audit-entry-details";

const ALL = "__all__";

/** Audit log viewer (M02-18): who changed what and when, with filters and a before/after view. */
export function AuditLogTable({
  rows,
  total,
  actors,
  entityTypes,
  actions,
}: {
  rows: AuditLogRow[];
  total: number;
  actors: { id: string; name: string }[];
  entityTypes: string[];
  actions: string[];
}) {
  const format = useFormatters();
  const [selected, setSelected] = useState<AuditLogRow | null>(null);
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(
    {
      actor: parseAsString,
      entity: parseAsString,
      action: parseAsString,
      from: parseAsString,
      to: parseAsString,
      page: parseAsInteger.withDefault(1),
    },
    { shallow: false, startTransition },
  );

  const columns: ColumnDef<AuditLogRow, unknown>[] = [
    {
      id: "createdAt",
      accessorKey: "createdAt",
      meta: { label: "When" },
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{format.dateTime(row.original.createdAt)}</span>
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
          {row.original.actorType !== "USER" ? (
            <span className="text-xs text-muted-foreground">
              {row.original.actorType.toLowerCase()}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "summary",
      meta: { label: "What happened" },
      enableSorting: false,
      enableHiding: false,
      header: "What happened",
      cell: ({ row }) => (
        <div className="flex max-w-xl min-w-56 flex-col items-start gap-1 whitespace-normal">
          <button
            type="button"
            onClick={() => setSelected(row.original)}
            className="text-left hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {row.original.summary ?? row.original.action}
          </button>
          <span className="text-xs text-muted-foreground">
            <span className="font-mono">{row.original.action}</span>
            {row.original.changes
              ? ` · ${Object.keys(row.original.changes).length} field(s) changed`
              : ""}
          </span>
        </div>
      ),
    },
    {
      id: "entityType",
      meta: { label: "Record" },
      enableSorting: false,
      header: "Record",
      cell: ({ row }) => row.original.entityType,
    },
    {
      id: "ipAddress",
      meta: { label: "IP address" },
      enableSorting: false,
      header: "IP address",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.ipAddress ?? "—"}
        </span>
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
        initiallyHiddenColumns={["ipAddress"]}
        emptyState={
          <EmptyState
            icon={ScrollText}
            title="No matching entries"
            description="Important changes (settings, users, roles, sign-ins) are recorded here."
            className="border-none"
          />
        }
        toolbar={(table) => (
          <DataTableToolbar table={table} searchPlaceholder="Search summary, action or person…">
            <Select
              value={filters.actor ?? ALL}
              onValueChange={(value) =>
                void setFilters({ actor: value === ALL ? null : value, page: null })
              }
            >
              <SelectTrigger size="sm" className="w-44" aria-label="Filter by person">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone</SelectItem>
                {actors.map((actor) => (
                  <SelectItem key={actor.id} value={actor.id}>
                    {actor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.entity ?? ALL}
              onValueChange={(value) =>
                void setFilters({ entity: value === ALL ? null : value, page: null })
              }
            >
              <SelectTrigger size="sm" className="w-44" aria-label="Filter by record type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All records</SelectItem>
                {entityTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.action ?? ALL}
              onValueChange={(value) =>
                void setFilters({ action: value === ALL ? null : value, page: null })
              }
            >
              <SelectTrigger size="sm" className="w-48" aria-label="Filter by action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All actions</SelectItem>
                {actions.map((action) => (
                  <SelectItem key={action} value={action} className="font-mono text-xs">
                    {action}
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
      <AuditEntryDetails entry={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
}
