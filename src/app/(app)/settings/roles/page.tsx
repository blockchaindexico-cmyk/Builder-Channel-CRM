import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IDENTITY_PERMISSIONS } from "@/modules/identity";
import { CreateRoleDialog } from "@/modules/identity/components/roles/create-role-dialog";
import { listRoles } from "@/modules/identity/server/roles";
import { appRegistry } from "@/modules/registry";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Roles & permissions" };

/** Roles list (M02-09). */
export default async function RolesPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, IDENTITY_PERMISSIONS.rolesManage);
  const roles = await listRoles(ctx);
  const totalPermissions = appRegistry.permissionCatalogue().length;

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="A role decides which screens and actions a person gets, and whose records they can see."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Roles & permissions" }]}
        actions={
          <CreateRoleDialog roles={roles.map((role) => ({ id: role.id, name: role.name }))} />
        }
      />
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-3">Role</TableHead>
              <TableHead className="px-3">Users</TableHead>
              <TableHead className="px-3">Permissions</TableHead>
              <TableHead className="w-10 px-3">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id} className="relative">
                <TableCell className="px-3 py-3 whitespace-normal">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/settings/roles/${role.id}`}
                      className="font-medium after:absolute after:inset-0 hover:underline"
                    >
                      {role.name}
                    </Link>
                    {role.isSystem ? (
                      <Badge variant="muted">System</Badge>
                    ) : (
                      <Badge variant="info">Custom</Badge>
                    )}
                  </div>
                  {role.description ? (
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      {role.description}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="px-3">{role.memberCount}</TableCell>
                <TableCell className="px-3">
                  {role.key === "admin" ? "All" : `${role.permissionCount} of ${totalPermissions}`}
                </TableCell>
                <TableCell className="px-3 text-muted-foreground">
                  <ChevronRight className="size-4" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
