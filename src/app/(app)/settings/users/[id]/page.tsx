import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { IDENTITY_PERMISSIONS } from "@/modules/identity";
import { AuditActivityList } from "@/modules/identity/components/audit/audit-activity-list";
import { MemberActions } from "@/modules/identity/components/member-actions";
import { MemberForm } from "@/modules/identity/components/member-form";
import { MemberStatusBadge } from "@/modules/identity/components/member-status-badge";
import { listRecentActivityForUser } from "@/modules/identity/server/audit-log";
import { getMember, listManagerOptions } from "@/modules/identity/server/members";
import { listAssignableRoles } from "@/modules/identity/server/roles";
import { getRegionalSettings } from "@/modules/organization";
import { uiRegistry } from "@/modules/registry.ui";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "User" };

export default async function UserDetailPage({ params }: PageProps<"/settings/users/[id]">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, IDENTITY_PERMISSIONS.usersManage);
  const membershipId = routeId((await params).id);

  const member = await loadOrNotFound(getMember(ctx, membershipId));
  const canViewAudit = ctx.permissions.has(IDENTITY_PERMISSIONS.auditView);
  const [roles, managers, regional, activity] = await Promise.all([
    listAssignableRoles(ctx),
    listManagerOptions(ctx),
    getRegionalSettings(ctx),
    canViewAudit ? listRecentActivityForUser(ctx, member.userId) : Promise.resolve([]),
  ]);
  const when = (value: string | null) =>
    value ? (
      <span>
        {formatDateTime(value, regional)}{" "}
        <RelativeTime value={value} className="text-muted-foreground" />
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {member.name} <MemberStatusBadge status={member.status} />
          </span>
        }
        description={`${member.email} · ${member.roleName}`}
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Users", href: "/settings/users" },
          { label: member.name },
        ]}
        actions={
          <>
            {await Promise.all(
              uiRegistry
                .extensions("member.detail.action")
                .toSorted((a, b) => a.order - b.order)
                .map(async (action) => (
                  <span key={action.key} className="contents">
                    {await action.render({
                      membershipId: member.membershipId,
                      name: member.name,
                      status: member.status,
                    })}
                  </span>
                )),
            )}
            <MemberActions
              membershipId={member.membershipId}
              name={member.name}
              status={member.status}
              isSelf={member.membershipId === ctx.actor.membershipId}
            />
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Role and reporting manager decide what this person can see and do.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MemberForm
              roles={roles}
              managers={managers}
              defaults={{
                membershipId: member.membershipId,
                name: member.name,
                email: member.email,
                phone: member.phone,
                roleId: member.roleId,
                reportsToId: member.reportsToId,
                employeeCode: member.employeeCode,
                designation: member.designation,
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Invited</dt>
              <dd>{when(member.invitedAt)}</dd>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>{when(member.joinedAt)}</dd>
              <dt className="text-muted-foreground">Last sign-in</dt>
              <dd>{when(member.lastLoginAt)}</dd>
              {member.deactivatedAt ? (
                <>
                  <dt className="text-muted-foreground">Deactivated</dt>
                  <dd>{when(member.deactivatedAt)}</dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>
        {canViewAudit ? (
          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Changes to this user and actions they performed.</CardDescription>
              <CardAction>
                <Link
                  href={`/settings/audit-log?actor=${member.userId}`}
                  className="text-sm text-primary hover:underline"
                >
                  Full history
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              <AuditActivityList entries={activity} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
