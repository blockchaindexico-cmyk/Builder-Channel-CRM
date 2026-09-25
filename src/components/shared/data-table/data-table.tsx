"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { parseAsArrayOf, parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { type ReactNode, useMemo, useState, useTransition } from "react";

import { Checkbox } from "@/components/ui/checkbox";
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
  /** Keep hidden columns in the URL (`?hide=a,b`) so saved views and links remember them. */
  persistColumnsInUrl?: boolean;
  /** Adds a selection column; `bulkActions` renders above the table while rows are selected. */
  enableRowSelection?: boolean;
  bulkActions?: (selected: TData[], clearSelection: () => void) => ReactNode;
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
  persistColumnsInUrl = false,
  enableRowSelection = false,
  bulkActions,
  className,
}: DataTableProps<TData>) {
  const [isPending, startTransition] = useTransition();
  const [{ page, pageSize, sort }, setUrlState] = useQueryStates(tableUrlState, {
    shallow: false,
    history: "push",
    startTransition,
  });
  const [{ hide }, setHidden] = useQueryStates({ hide: parseAsArrayOf(parseAsString) });
  const [localVisibility, setLocalVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries((initiallyHiddenColumns ?? []).map((id) => [id, false])),
  );
  const columnVisibility: VisibilityState = persistColumnsInUrl
    ? Object.fromEntries((hide ?? initiallyHiddenColumns ?? []).map((id) => [id, false]))
    : localVisibility;
  const setColumnVisibility = (
    updater: VisibilityState | ((old: VisibilityState) => VisibilityState),
  ) => {
    const next = typeof updater === "function" ? updater(columnVisibility) : updater;
    if (!persistColumnsInUrl) return setLocalVisibility(next);
    const hidden = Object.entries(next)
      .filter(([, visible]) => !visible)
      .map(([id]) => id);
    void setHidden({ hide: hidden });
  };
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const allColumns = useMemo<ColumnDef<TData, unknown>[]>(
    () =>
      enableRowSelection
        ? [
            {
              id: "select",
              enableSorting: false,
              enableHiding: false,
              header: ({ table }) => (
                <Checkbox
                  aria-label="Select all rows on this page"
                  checked={
                    table.getIsAllPageRowsSelected()
                      ? true
                      : table.getIsSomePageRowsSelected()
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
                />
              ),
              cell: ({ row }) => (
                <Checkbox
                  aria-label="Select row"
                  checked={row.getIsSelected()}
                  onCheckedChange={(checked) => row.toggleSelected(checked === true)}
                />
              ),
            },
            ...columns,
          ]
        : columns,
    [columns, enableRowSelection],
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
    columns: allColumns,
    getRowId,
    enableRowSelection,
    onRowSelectionChange: setRowSelection,
    pageCount,
    manualPagination: true,
    manualSorting: true,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      pagination: { pageIndex: page - 1, pageSize },
    },
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
      {bulkActions && table.getSelectedRowModel().rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{table.getSelectedRowModel().rows.length} selected</span>
          {bulkActions(
            table.getSelectedRowModel().rows.map((row) => row.original),
            () => setRowSelection({}),
          )}
        </div>
      ) : null}
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
