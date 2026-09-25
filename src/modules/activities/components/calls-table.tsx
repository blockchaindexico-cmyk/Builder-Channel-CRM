"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Mic, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useTransition } from "react";

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

import type { CallRow } from "../server/calls";
import { OutcomeBadge } from "./badges";

const ALL = "__all__";

const filterParsers = {
  from: parseAsString,
  to: parseAsString,
  outcome: parseAsString,
  caller: parseAsString,
  direction: parseAsString,
  reached: parseAsString,
  page: parseAsInteger,
};

function Filter({
  label,
  value,
  onChange,
  choices,
  allLabel,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  choices: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? null : next)}>
      <SelectTrigger size="sm" className="w-40" aria-label={label}>
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

/** The calls list (M07-06): who called whom, when, how it went; filters by date, outcome, caller, direction. */
export function CallsTable({
  rows,
  total,
  outcomes,
  callers,
}: {
  rows: CallRow[];
  total: number;
  outcomes: { id: string; label: string }[];
  /** People whose calls the viewer may filter by (empty when they only see their own). */
  callers: { membershipId: string; name: string }[];
}) {
  const format = useFormatters();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(filterParsers, { shallow: false, startTransition });
  const set = (
    patch: Partial<Record<Exclude<keyof typeof filterParsers, "page">, string | null>>,
  ) => void setFilters({ ...patch, page: null });

  const columns: ColumnDef<CallRow, unknown>[] = [
    {
      id: "startedAt",
      accessorKey: "startedAt",
      meta: { label: "When" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{format.dateTime(row.original.startedAt)}</span>
      ),
    },
    {
      id: "lead",
      meta: { label: "Lead" },
      enableSorting: false,
      enableHiding: false,
      header: "Lead",
      cell: ({ row }) => (
        <Link href={`/leads/${row.original.lead.id}`} className="flex flex-col hover:underline">
          <span className="font-medium">{row.original.lead.name}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.lead.number}
          </span>
        </Link>
      ),
    },
    {
      id: "caller",
      meta: { label: "Caller" },
      enableSorting: false,
      header: "Caller",
      cell: ({ row }) => row.original.callerName,
    },
    {
      id: "direction",
      meta: { label: "Call" },
      enableSorting: false,
      header: "Call",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {!row.original.connected ? (
            <PhoneMissed className="size-3.5 text-muted-foreground" />
          ) : row.original.direction === "INBOUND" ? (
            <PhoneIncoming className="size-3.5 text-success" />
          ) : (
            <PhoneOutgoing className="size-3.5 text-success" />
          )}
          {row.original.direction === "INBOUND" ? "Incoming" : "Outgoing"}
          {row.original.hasRecording ? (
            <Mic className="size-3.5 text-muted-foreground" aria-label="Recorded" />
          ) : null}
        </span>
      ),
    },
    {
      id: "outcome",
      meta: { label: "Outcome" },
      enableSorting: false,
      header: "Outcome",
      cell: ({ row }) => (
        <OutcomeBadge label={row.original.outcome.label} category={row.original.outcome.category} />
      ),
    },
    {
      id: "durationSeconds",
      accessorKey: "durationSeconds",
      meta: { label: "Duration" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
      cell: ({ row }) =>
        row.original.durationSeconds > 0 ? (
          <span className="tabular-nums">
            {Math.floor(row.original.durationSeconds / 60)}:
            {String(row.original.durationSeconds % 60).padStart(2, "0")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "notes",
      meta: { label: "Notes" },
      enableSorting: false,
      header: "Notes",
      cell: ({ row }) =>
        row.original.notes ? (
          <span className="line-clamp-2 max-w-72 whitespace-normal">{row.original.notes}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      totalCount={total}
      getRowId={(row) => row.id}
      emptyState={
        <EmptyState
          icon={PhoneCall}
          title="No calls match"
          description="Try a wider date range or fewer filters."
          className="border-none"
        />
      }
      toolbar={(table) => (
        <DataTableToolbar table={table} searchPlaceholder="Search lead name, number or notes…">
          <DateRangePicker
            className="h-8"
            value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
            onChange={(range) => set({ from: range?.from ?? null, to: range?.to ?? null })}
          />
          <Filter
            label="Filter by outcome"
            value={filters.outcome}
            onChange={(value) => set({ outcome: value })}
            choices={outcomes.map((outcome) => ({ value: outcome.id, label: outcome.label }))}
            allLabel="Any outcome"
          />
          {callers.length > 0 ? (
            <Filter
              label="Filter by caller"
              value={filters.caller}
              onChange={(value) => set({ caller: value })}
              choices={callers.map((caller) => ({
                value: caller.membershipId,
                label: caller.name,
              }))}
              allLabel="Anyone"
            />
          ) : null}
          <Filter
            label="Filter by direction"
            value={filters.direction}
            onChange={(value) => set({ direction: value })}
            choices={[
              { value: "OUTBOUND", label: "Outgoing" },
              { value: "INBOUND", label: "Incoming" },
            ]}
            allLabel="In and out"
          />
          <Filter
            label="Filter by reached"
            value={filters.reached}
            onChange={(value) => set({ reached: value })}
            choices={[
              { value: "yes", label: "Reached" },
              { value: "no", label: "Not reached" },
            ]}
            allLabel="Reached or not"
          />
        </DataTableToolbar>
      )}
    />
  );
}
