"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Users } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { DataTable, DataTableColumnHeader, DataTableToolbar } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initials } from "@/lib/utils";

import type { MemberRow } from "../server/members";
import { MemberStatusBadge } from "./member-status-badge";

const ALL = "__all__";

/** Users list (M02-10) with URL-driven search, role/status filters, sorting and paging. */
export function MembersTable({
  rows,
  total,
  roles = [],
  managers = [],
  linkBase,
}: {
  rows: MemberRow[];
  total: number;
  /** Role filter options (omit to hide the filter). */
  roles?: { id: string; name: string }[];
  /** Reporting-manager filter options (omit to hide the filter). */
  managers?: { membershipId: string; name: string }[];
  /** Where a row links to (`/settings/users` for admins). Omit for read-only lists. */
  linkBase?: string;
}) {
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(
    {
      role: parseAsString,
      status: parseAsString,
      manager: parseAsString,
      page: parseAsInteger.withDefault(1),
    },
    { shallow: false, startTransition },
  );

  const columns: ColumnDef<MemberRow, unknown>[] = [
    {
      id: "name",
      accessorKey: "name",
      meta: { label: "Name" },
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const content = (
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-primary">
                {initials(row.original.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{row.original.name}</span>
              <span className="truncate text-xs text-muted-foreground">{row.original.email}</span>
            </div>
          </div>
        );
        return linkBase ? (
          <Link href={`${linkBase}/${row.original.membershipId}`} className="hover:underline">
            {content}
          </Link>
        ) : (
          content
        );
      },
    },
    {
      id: "role",
      meta: { label: "Role" },
      enableSorting: false,
      header: "Role",
      cell: ({ row }) => <Badge variant="secondary">{row.original.roleName}</Badge>,
    },
    {
      id: "designation",
      meta: { label: "Designation" },
      enableSorting: false,
      header: "Designation",
      cell: ({ row }) =>
        row.original.designation ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "reportsTo",
      meta: { label: "Reports to" },
      enableSorting: false,
      header: "Reports to",
      cell: ({ row }) =>
        row.original.reportsToName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "status",
      accessorKey: "status",
      meta: { label: "Status" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <MemberStatusBadge status={row.original.status} />,
    },
    {
      id: "lastLoginAt",
      accessorKey: "lastLoginAt",
      meta: { label: "Last sign-in" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last sign-in" />,
      cell: ({ row }) =>
        row.original.lastLoginAt ? (
          <RelativeTime value={row.original.lastLoginAt} />
        ) : (
          <span className="text-muted-foreground">Never</span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      totalCount={total}
      getRowId={(row) => row.membershipId}
      emptyState={
        <EmptyState
          icon={Users}
          title="No users found"
          description="Try a different search or filter."
          className="border-none"
        />
      }
      toolbar={(table) => (
        <DataTableToolbar table={table} searchPlaceholder="Search name, e-mail, mobile, code…">
          {roles.length > 0 ? (
            <Select
              value={filters.role ?? ALL}
              onValueChange={(value) =>
                void setFilters({ role: value === ALL ? null : value, page: null })
              }
            >
              <SelectTrigger size="sm" className="w-40" aria-label="Filter by role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All roles</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {managers.length > 0 ? (
            <Select
              value={filters.manager ?? ALL}
              onValueChange={(value) =>
                void setFilters({ manager: value === ALL ? null : value, page: null })
              }
            >
              <SelectTrigger size="sm" className="w-44" aria-label="Filter by manager">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any manager</SelectItem>
                {managers.map((manager) => (
                  <SelectItem key={manager.membershipId} value={manager.membershipId}>
                    Reports to {manager.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select
            value={filters.status ?? ALL}
            onValueChange={(value) =>
              void setFilters({ status: value === ALL ? null : value, page: null })
            }
          >
            <SelectTrigger size="sm" className="w-40" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INVITED">Invited</SelectItem>
              <SelectItem value="INACTIVE">Deactivated</SelectItem>
            </SelectContent>
          </Select>
        </DataTableToolbar>
      )}
    />
  );
}
