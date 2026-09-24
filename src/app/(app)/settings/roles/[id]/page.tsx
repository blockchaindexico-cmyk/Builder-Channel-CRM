import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IDENTITY_PERMISSIONS } from "@/modules/identity";
import { DeleteRoleButton } from "@/modules/identity/components/roles/delete-role-button";
import { PermissionMatrix } from "@/modules/identity/components/roles/permission-matrix";
import { RoleDetailsForm } from "@/modules/identity/components/roles/role-details-form";
import { getRole } from "@/modules/identity/server/roles";
import { appRegistry } from "@/modules/registry";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Role" };

/** Role editor with the permission matrix (M02-09). */
export default async function RoleDetailPage({ params }: PageProps<"/settings/roles/[id]">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, IDENTITY_PERMISSIONS.rolesManage);
  const role = await loadOrNotFound(getRole(ctx, routeId((await params).id)));
  const permissions = appRegistry.permissionCatalogue().map((permission) => ({
    key: permission.key,
    label: permission.label,
    description: permission.description,
    group: permission.group,
    scoped: Boolean(permission.scoped),
  }));

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {role.name}
            {role.isSystem ? (
              <Badge variant="muted">System</Badge>
            ) : (
              <Badge variant="info">Custom</Badge>
            )}
          </span>
        }
        description={`${role.memberCount} user(s) have this role.`}
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Roles & permissions", href: "/settings/roles" },
          { label: role.name },
        ]}
        actions={
          role.isSystem ? null : (
            <DeleteRoleButton roleId={role.id} name={role.name} memberCount={role.memberCount} />
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:order-2">
          <Card>
            <CardHeader>
              <CardTitle>About this role</CardTitle>
              <CardDescription>
                {role.isSystem
                  ? "System roles can be renamed and their permissions adjusted, but not deleted."
                  : "Name and description shown when assigning roles."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RoleDetailsForm roleId={role.id} name={role.name} description={role.description} />
            </CardContent>
          </Card>
        </div>
        <div className="xl:order-1 xl:col-span-2">
          <PermissionMatrix
            roleId={role.id}
            permissions={permissions}
            initialGrants={role.grants}
            locked={role.locked}
          />
        </div>
      </div>
    </>
  );
}
