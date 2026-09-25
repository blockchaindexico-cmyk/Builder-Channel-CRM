"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { DataTable, DataTableColumnHeader, DataTableToolbar } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { BuilderRow } from "../../server/builders";
import { InactiveBadge } from "../shared/project-status-badge";

/** Builders list (M03-03): search, status filter, project counts. */
export function BuildersTable({ rows, total }: { rows: BuilderRow[]; total: number }) {
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(
    { status: parseAsString.withDefault("active"), page: parseAsInteger.withDefault(1) },
    { shallow: false, startTransition },
  );

  const columns: ColumnDef<BuilderRow, unknown>[] = [
    {
      id: "name",
      accessorKey: "name",
      meta: { label: "Builder" },
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Builder" />,
      cell: ({ row }) => (
        <Link href={`/builders/${row.original.id}`} className="flex flex-col hover:underline">
          <span className="flex items-center gap-2 font-medium">
            {row.original.name}
            {!row.original.isActive ? <InactiveBadge /> : null}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{row.original.code}</span>
        </Link>
      ),
    },
    {
      id: "city",
      meta: { label: "City" },
      enableSorting: false,
      header: "City",
      cell: ({ row }) => row.original.city ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "contact",
      meta: { label: "Primary contact" },
      enableSorting: false,
      header: "Primary contact",
      cell: ({ row }) =>
        row.original.primaryContact ? (
          <div className="flex flex-col">
            <span>{row.original.primaryContact.name}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.primaryContact.phone ?? row.original.primaryContact.email ?? ""}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "projects",
      meta: { label: "Projects" },
      enableSorting: false,
      header: "Projects",
      cell: ({ row }) => (
        <span>
          {row.original.activeProjects}
          {row.original.totalProjects !== row.original.activeProjects ? (
            <span className="text-muted-foreground"> / {row.original.totalProjects}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: "code",
      accessorKey: "code",
      meta: { label: "Code" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      totalCount={total}
      getRowId={(row) => row.id}
      initiallyHiddenColumns={["code"]}
      emptyState={
        <EmptyState
          icon={Building2}
          title="No builders found"
          description="Add the developers you work with to start listing their projects."
          className="border-none"
        />
      }
      toolbar={(table) => (
        <DataTableToolbar table={table} searchPlaceholder="Search name, code, city or contact…">
          <Select
            value={filters.status}
            onValueChange={(value) => void setFilters({ status: value, page: null })}
          >
            <SelectTrigger size="sm" className="w-36" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All builders</SelectItem>
            </SelectContent>
          </Select>
        </DataTableToolbar>
      )}
    />
  );
}
