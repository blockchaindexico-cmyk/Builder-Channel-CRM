"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Inbox } from "lucide-react";
import Link from "next/link";

import { DataTable, DataTableColumnHeader, DataTableToolbar } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { LeadRow } from "@/modules/leads";

import { AssignDialog } from "./assign-dialog";
import { BulkAssignAction } from "./bulk-assign-action";

/** Unassigned open leads, oldest first, with how long they have been waiting (M05-07). */
export function UnassignedQueue({
  rows,
  total,
  overdueHours,
  overdueBefore,
  country,
}: {
  rows: LeadRow[];
  total: number;
  /** Leads created before `overdueBefore` have waited more than this many hours. */
  overdueHours: number;
  overdueBefore: string;
  country: string;
}) {
  const columns: ColumnDef<LeadRow, unknown>[] = [
    {
      id: "name",
      accessorKey: "name",
      meta: { label: "Lead" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lead" />,
      cell: ({ row }) => (
        <Link href={`/leads/${row.original.id}`} className="flex min-w-40 flex-col hover:underline">
          <span className="font-medium">{row.original.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{row.original.number}</span>
        </Link>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {row.original.mobile ? formatPhone(row.original.mobile, country) : row.original.email}
        </span>
      ),
    },
    {
      id: "source",
      header: "Source",
      cell: ({ row }) => row.original.sourceName ?? "—",
    },
    {
      id: "projects",
      header: "Projects",
      cell: ({ row }) => row.original.projects.join(", ") || "—",
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      meta: { label: "Waiting" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Waiting since" />,
      cell: ({ row }) => {
        const overdue = row.original.createdAt < overdueBefore;
        return (
          <span
            className={cn("flex items-center gap-2 whitespace-nowrap", overdue && "font-medium")}
          >
            <RelativeTime value={row.original.createdAt} />
            {overdue ? <Badge variant="warning">Over {overdueHours} h</Badge> : null}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <AssignDialog
          lead={{
            id: row.original.id,
            number: row.original.number,
            ownerId: null,
            ownerName: null,
          }}
          trigger={
            <Button size="sm" variant="outline" aria-label={`Assign ${row.original.number}`}>
              Assign
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      totalCount={total}
      getRowId={(row) => row.id}
      enableRowSelection
      bulkActions={(selected, clear) => (
        <BulkAssignAction leadIds={selected.map((row) => row.id)} onDone={clear} />
      )}
      toolbar={(table) => (
        <DataTableToolbar table={table} searchPlaceholder="Search name, mobile or lead number…" />
      )}
      emptyState={
        <EmptyState
          icon={Inbox}
          title="Nothing waiting"
          description="Every open lead has an owner."
          className="border-none"
        />
      }
    />
  );
}
