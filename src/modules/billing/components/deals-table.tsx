"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Download, Wallet } from "lucide-react";
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

import { DEAL_FINANCIAL_STATUSES } from "../constants";
import type { DealRow } from "../server/financials";
import { DealStatusBadge } from "./badges";

const filterParsers = {
  from: parseAsString,
  to: parseAsString,
  status: parseAsString,
  builder: parseAsString,
  project: parseAsString,
  executive: parseAsString,
  manager: parseAsString,
  invoiced: parseAsString,
  page: parseAsInteger,
};

type Option = { id: string; label: string };

/** Deal financials (M09-06): commission, costs and profit of each closed booking. */
export function DealsTable({
  rows,
  total,
  builders,
  projects,
  executives,
  managers,
}: {
  rows: DealRow[];
  total: number;
  builders: Option[];
  projects: Option[];
  executives: Option[];
  managers: Option[];
}) {
  const format = useFormatters();
  const regional = useRegionalSettings();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(filterParsers, { shallow: false, startTransition });
  const set = (
    patch: Partial<Record<Exclude<keyof typeof filterParsers, "page">, string | null>>,
  ) => void setFilters({ ...patch, page: null });
  const money = (value: string) => (
    <span className="whitespace-nowrap tabular-nums">{format.money(value)}</span>
  );
  const exportHref = () => {
    const params = new URLSearchParams({ register: "deals", format: "xlsx" });
    for (const [key, name] of [
      ["from", "from"],
      ["to", "to"],
      ["status", "status"],
      ["builder", "builderId"],
      ["project", "projectId"],
      ["executive", "executiveId"],
      ["manager", "managerId"],
    ] as const) {
      const value = filters[key];
      if (value) params.set(name, value);
    }
    return `/api/billing/export?${params.toString()}`;
  };

  const columns: ColumnDef<DealRow, unknown>[] = [
    {
      id: "booking",
      meta: { label: "Booking" },
      enableHiding: false,
      enableSorting: false,
      header: "Booking",
      cell: ({ row }) => (
        <Link href={`/billing/deals/${row.original.id}`} className="flex flex-col hover:underline">
          <span className="font-medium">{row.original.booking.number}</span>
          <span className="text-xs text-muted-foreground">{row.original.booking.customerName}</span>
        </Link>
      ),
    },
    {
      id: "recognizedOn",
      accessorKey: "recognizedOn",
      meta: { label: "Closed on" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Closed on" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {formatCalendarDate(row.original.recognizedOn, regional)}
        </span>
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
      cell: ({ row }) => row.original.executiveName,
    },
    {
      id: "agreementValue",
      meta: { label: "Agreement value" },
      enableSorting: false,
      header: () => <span className="block text-right">Agreement value</span>,
      cell: ({ row }) => <div className="text-right">{money(row.original.agreementValue)}</div>,
    },
    {
      id: "grossCommission",
      accessorKey: "grossCommission",
      meta: { label: "Commission" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Commission" />,
      cell: ({ row }) => (
        <span className="flex flex-col">
          {money(row.original.grossCommission)}
          <span className="text-xs text-muted-foreground">
            {row.original.commissionOverridden
              ? "by hand"
              : row.original.commissionRate
                ? `${Number(row.original.commissionRate)}%`
                : ""}
          </span>
        </span>
      ),
    },
    {
      id: "netProfit",
      accessorKey: "netProfit",
      meta: { label: "Net profit" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Net profit" />,
      cell: ({ row }) => money(row.original.netProfit),
    },
    {
      id: "status",
      meta: { label: "Status" },
      enableSorting: false,
      header: "Status",
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1">
          <DealStatusBadge status={row.original.status} />
          {row.original.invoice ? (
            <Link
              href={`/billing/invoices/${row.original.invoice.id}`}
              className="text-xs text-primary hover:underline"
            >
              {row.original.invoice.number ?? "Draft invoice"}
            </Link>
          ) : null}
        </span>
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
          icon={Wallet}
          title="No deals match"
          description="Deal financials are created when a booking is closed as won."
          className="border-none"
        />
      }
      toolbar={(table) => (
        <DataTableToolbar table={table} searchPlaceholder="Search booking, customer or lead…">
          <DateRangePicker
            className="h-8"
            value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
            onChange={(range) => set({ from: range?.from ?? null, to: range?.to ?? null })}
          />
          <DataTableSelectFilter
            label="Filter by status"
            value={filters.status}
            onChange={(value) => set({ status: value })}
            choices={DEAL_FINANCIAL_STATUSES.map((status) => ({
              value: status.value,
              label: status.label,
            }))}
            allLabel="Draft or confirmed"
          />
          <DataTableSelectFilter
            label="Filter by invoice"
            value={filters.invoiced}
            onChange={(value) => set({ invoiced: value })}
            choices={[
              { value: "no", label: "Not invoiced" },
              { value: "yes", label: "Invoiced" },
            ]}
            allLabel="Invoiced or not"
          />
          <DataTableSelectFilter
            label="Filter by builder"
            value={filters.builder}
            onChange={(value) => set({ builder: value })}
            choices={builders.map((option) => ({ value: option.id, label: option.label }))}
            allLabel="Any builder"
          />
          <DataTableSelectFilter
            label="Filter by project"
            value={filters.project}
            onChange={(value) => set({ project: value })}
            choices={projects.map((option) => ({ value: option.id, label: option.label }))}
            allLabel="Any project"
          />
          <DataTableSelectFilter
            label="Filter by manager"
            value={filters.manager}
            onChange={(value) => set({ manager: value })}
            choices={managers.map((option) => ({ value: option.id, label: option.label }))}
            allLabel="Any manager"
          />
          <DataTableSelectFilter
            label="Filter by executive"
            value={filters.executive}
            onChange={(value) => set({ executive: value })}
            choices={executives.map((option) => ({ value: option.id, label: option.label }))}
            allLabel="Anyone"
          />
          <Button variant="outline" size="sm" className="h-8" asChild>
            <a href={exportHref()} download>
              <Download /> Export
            </a>
          </Button>
        </DataTableToolbar>
      )}
    />
  );
}
