import type { Metadata } from "next";
import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { toTableQuery } from "@/lib/table-query";
import { IDENTITY_PERMISSIONS } from "@/modules/identity";
import { InviteMemberDialog } from "@/modules/identity/components/invite-member-dialog";
import { MembersTable } from "@/modules/identity/components/members-table";
import {
  listManagerOptions,
  listMembers,
  MEMBER_SORTABLE_FIELDS,
} from "@/modules/identity/server/members";
import { listAssignableRoles } from "@/modules/identity/server/roles";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Users" };

const loadSearchParams = createLoader({
  ...tableSearchParams,
  role: parseAsString,
  manager: parseAsString,
  status: parseAsStringLiteral(["ACTIVE", "INVITED", "INACTIVE"] as const),
});

/** Users administration (M02-10 → M02-13). */
export default async function UsersPage({ searchParams }: PageProps<"/settings/users">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, IDENTITY_PERMISSIONS.usersManage);

  const params = await loadSearchParams(searchParams);
  const query = toTableQuery(params, {
    sortable: MEMBER_SORTABLE_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  const [members, roles, managers] = await Promise.all([
    listMembers(ctx, query, {
      roleId: params.role,
      status: params.status,
      reportsToId: params.manager,
    }),
    listAssignableRoles(ctx),
    listManagerOptions(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who can sign in to the CRM, their role and who they report to."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Users" }]}
        actions={<InviteMemberDialog roles={roles} managers={managers} />}
      />
      <MembersTable
        rows={members.rows}
        total={members.total}
        roles={roles}
        managers={managers}
        linkBase="/settings/users"
      />
    </>
  );
}
