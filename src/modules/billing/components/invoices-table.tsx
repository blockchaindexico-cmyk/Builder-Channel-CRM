"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Download, FileText } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { formatCalendarDate } from "@/lib/format";

import { INVOICE_STATUSES } from "../constants";
import type { InvoiceRow } from "../server/invoices";
import { InvoiceStatusBadge } from "./badges";

const filterParsers = {
  from: parseAsString,
  to: parseAsString,
  status: parseAsString,
  builder: parseAsString,
  overdue: parseAsString,
  page: parseAsInteger,
};

/** Invoice register (M09-07, M09-14): status, builder, invoice dates, overdue. */
export function InvoicesTable({
  rows,
  total,
  builders,
}: {
  rows: InvoiceRow[];
  total: number;
  builders: { id: string; label: string }[];
}) {
  const format = useFormatters();
  const regional = useRegionalSettings();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(filterParsers, { shallow: false, startTransition });
  const set = (
    patch: Partial<Record<Exclude<keyof typeof filterParsers, "page">, string | null>>,
  ) => void setFilters({ ...patch, page: null });
  const money = (value: string) => (
    <span className="block text-right whitespace-nowrap tabular-nums">{format.money(value)}</span>
  );
  const exportHref = (type: "csv" | "xlsx") => {
    const params = new URLSearchParams({ register: "invoices", format: type });
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.status) params.set("status", filters.status);
    if (filters.builder) params.set("builderId", filters.builder);
    return `/api/billing/export?${params.toString()}`;
  };

  const columns: ColumnDef<InvoiceRow, unknown>[] = [
    {
      id: "number",
      meta: { label: "Invoice" },
      enableHiding: false,
      enableSorting: false,
      header: "Invoice",
      cell: ({ row }) => (
        <Link href={`/billing/invoices/${row.original.id}`} className="font-medium hover:underline">
          {row.original.number ?? "Draft"}
        </Link>
      ),
    },
    {
      id: "builder",
      meta: { label: "Builder" },
      enableSorting: false,
      header: "Builder",
      cell: ({ row }) => row.original.builder.name,
    },
    {
      id: "issueDate",
      accessorKey: "issueDate",
      meta: { label: "Date" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) =>
        row.original.issueDate ? (
          <span className="whitespace-nowrap">
            {formatCalendarDate(row.original.issueDate, regional)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "dueDate",
      accessorKey: "dueDate",
      meta: { label: "Due" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due" />,
      cell: ({ row }) =>
        row.original.dueDate ? (
          <span className="whitespace-nowrap">
            {formatCalendarDate(row.original.dueDate, regional)}
          </span>
        ) : null,
    },
    {
      id: "total",
      accessorKey: "total",
      meta: { label: "Total" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) => money(row.original.total),
    },
    {
      id: "balance",
      accessorKey: "balance",
      meta: { label: "Balance" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />,
      cell: ({ row }) => money(row.original.balance),
    },
    {
      id: "status",
      meta: { label: "Status" },
      enableSorting: false,
      header: "Status",
      cell: ({ row }) => (
        <InvoiceStatusBadge status={row.original.status} overdue={row.original.overdue} />
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
          icon={FileText}
          title="No invoices match"
          description="Create an invoice for a builder's closed deals."
          className="border-none"
        />
      }
      toolbar={(table) => (
        <DataTableToolbar table={table} searchPlaceholder="Search number or builder…">
          <DateRangePicker
            className="h-8"
            value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
            onChange={(range) => set({ from: range?.from ?? null, to: range?.to ?? null })}
          />
          <DataTableSelectFilter
            label="Filter by status"
            value={filters.status}
            onChange={(value) => set({ status: value })}
            choices={[
              { value: "OPEN", label: "Open (unpaid)" },
              ...INVOICE_STATUSES.map((status) => ({ value: status.value, label: status.label })),
            ]}
            allLabel="Any status"
          />
          <DataTableSelectFilter
            label="Filter by builder"
            value={filters.builder}
            onChange={(value) => set({ builder: value })}
            choices={builders.map((option) => ({ value: option.id, label: option.label }))}
            allLabel="Any builder"
            className="w-48"
          />
          <DataTableSelectFilter
            label="Filter overdue"
            value={filters.overdue}
            onChange={(value) => set({ overdue: value })}
            choices={[{ value: "1", label: "Overdue only" }]}
            allLabel="Due or not"
          />
          <Button variant="outline" size="sm" className="h-8" asChild>
            <a href={exportHref("xlsx")} download>
              <Download /> Excel
            </a>
          </Button>
          <Button variant="outline" size="sm" className="h-8" asChild>
            <a href={exportHref("csv")} download>
              <Download /> CSV
            </a>
          </Button>
        </DataTableToolbar>
      )}
    />
  );
}
