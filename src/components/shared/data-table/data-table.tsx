"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { type ReactNode, useState, useTransition } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { DataTablePagination } from "./data-table-pagination";

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  totalCount: number;
  /** Rendered above the table (search, filters, view options). Receives the table instance. */
  toolbar?: (table: ReturnType<typeof useReactTable<TData>>) => ReactNode;
  emptyState?: ReactNode;
  getRowId?: (row: TData) => string;
  /** Column ids hidden until the user shows them from the "Columns" menu. */
  initiallyHiddenColumns?: readonly string[];
  className?: string;
}

const tableUrlState = {
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(25),
  sort: parseAsString.withDefault(""),
};

/**
 * Server-driven data table (M01-22). Pagination and sorting live in the URL (`?page=&pageSize=&sort=`);
 * changing them re-renders the server page, which queries only the requested slice.
 */
export function DataTable<TData>({
  columns,
  data,
  totalCount,
  toolbar,
  emptyState,
  getRowId,
  initiallyHiddenColumns,
  className,
}: DataTableProps<TData>) {
  const [isPending, startTransition] = useTransition();
  const [{ page, pageSize, sort }, setUrlState] = useQueryStates(tableUrlState, {
    shallow: false,
    history: "push",
    startTransition,
  });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries((initiallyHiddenColumns ?? []).map((id) => [id, false])),
  );

  const [sortField, sortDirection] = sort.split(".");
  const sorting: SortingState = sortField
    ? [{ id: sortField, desc: sortDirection === "desc" }]
    : [];
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  // React Compiler is not enabled; TanStack Table's non-memoizable API is fine here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getRowId,
    pageCount,
    manualPagination: true,
    manualSorting: true,
    state: { sorting, columnVisibility, pagination: { pageIndex: page - 1, pageSize } },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      void setUrlState({
        sort: first ? `${first.id}.${first.desc ? "desc" : "asc"}` : null,
        page: 1,
      });
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {toolbar ? toolbar(table) : null}
      <div
        className={cn(
          "overflow-hidden rounded-lg border transition-opacity",
          isPending && "opacity-60",
        )}
        aria-busy={isPending}
      >
        <Table>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="px-3">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-3 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="p-0">
                  {emptyState ?? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No results.</p>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onChange={(next) => void setUrlState(next)}
      />
    </div>
  );
}
