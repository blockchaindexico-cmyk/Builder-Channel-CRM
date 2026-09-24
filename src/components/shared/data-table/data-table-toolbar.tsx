"use client";

import type { Table } from "@tanstack/react-table";
import { Search, Settings2, X } from "lucide-react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { type ReactNode, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

/** Search box bound to `?q=` (debounced), filter slot and column visibility menu. */
export function DataTableToolbar<TData>({
  table,
  searchPlaceholder = "Search…",
  children,
}: {
  table: Table<TData>;
  searchPlaceholder?: string;
  children?: ReactNode;
}) {
  const [, startTransition] = useTransition();
  const [{ q }, setSearch] = useQueryStates(
    { q: parseAsString.withDefault(""), page: parseAsInteger.withDefault(1) },
    { shallow: false, startTransition, throttleMs: 400 },
  );
  // nuqs updates `q` immediately (the URL/server refresh is throttled). A new search starts on page 1.
  const setQ = (value: string | null) => setSearch({ q: value, page: null });

  const hideable = table.getAllColumns().filter((column) => column.getCanHide());

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            placeholder={searchPlaceholder}
            aria-label="Search"
            className="pl-8"
            onChange={(event) => void setQ(event.target.value || null)}
          />
          {q ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
              aria-label="Clear search"
              onClick={() => void setQ(null)}
            >
              <X />
            </Button>
          ) : null}
        </div>
        {children}
      </div>
      {hideable.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="self-start sm:self-auto">
              <Settings2 /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {hideable.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(checked) => column.toggleVisibility(Boolean(checked))}
                onSelect={(event) => event.preventDefault()}
              >
                {(column.columnDef.meta as { label?: string } | undefined)?.label ?? column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
