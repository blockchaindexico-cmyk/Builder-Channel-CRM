import { List, Network, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createLoader, parseAsStringLiteral } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { toTableQuery } from "@/lib/table-query";
import { cn } from "@/lib/utils";
import { IDENTITY_PERMISSIONS } from "@/modules/identity";
import { MembersTable } from "@/modules/identity/components/members-table";
import { TeamTree } from "@/modules/identity/components/team-tree";
import { listMembers, MEMBER_SORTABLE_FIELDS } from "@/modules/identity/server/members";
import { getTeamTree } from "@/modules/identity/server/team";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "My team" };

const loadSearchParams = createLoader({
  ...tableSearchParams,
  view: parseAsStringLiteral(["structure", "list"] as const).withDefault("structure"),
  status: parseAsStringLiteral(["ACTIVE", "INVITED", "INACTIVE"] as const),
});

/** Team structure (M02-14): admins see the organization, managers their own reporting tree (read-only). */
export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, IDENTITY_PERMISSIONS.usersView);
  const params = await loadSearchParams(searchParams);
  const canManage = ctx.permissions.has(IDENTITY_PERMISSIONS.usersManage);
  const scope = ctx.permissions.scope(IDENTITY_PERMISSIONS.usersView);
  const linkBase = canManage ? "/settings/users" : undefined;

  const views = [
    { value: "structure", label: "Structure", icon: Network },
    { value: "list", label: "List", icon: List },
  ] as const;

  return (
    <>
      <PageHeader
        title="My team"
        description={
          scope === "ALL"
            ? "Everyone in the organization and who they report to."
            : "You and the people who report to you, directly or through their managers."
        }
        actions={
          <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="View">
            {views.map((view) => {
              const Icon = view.icon;
              const active = params.view === view.value;
              return (
                <Link
                  key={view.value}
                  role="tab"
                  aria-selected={active}
                  href={view.value === "structure" ? "/team" : "/team?view=list"}
                  className={cn(
                    "flex items-center gap-1.5 rounded-sm px-3 py-1 text-sm",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" /> {view.label}
                </Link>
              );
            })}
          </div>
        }
      />
      {params.view === "list" ? (
        <TeamList ctx={ctx} params={params} linkBase={linkBase} />
      ) : (
        <TeamStructure ctx={ctx} linkBase={linkBase} />
      )}
    </>
  );
}

async function TeamStructure({
  ctx,
  linkBase,
}: {
  ctx: Awaited<ReturnType<typeof getRequestContext>>;
  linkBase?: string;
}) {
  const { roots, total } = await getTeamTree(ctx);
  if (total <= 1 && roots[0]?.children.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        title="No one reports to you yet"
        description="When an administrator sets you as someone's reporting manager, they appear here."
      />
    );
  }
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">{total} active or invited member(s)</p>
        <TeamTree roots={roots} linkBase={linkBase} />
      </CardContent>
    </Card>
  );
}

async function TeamList({
  ctx,
  params,
  linkBase,
}: {
  ctx: Awaited<ReturnType<typeof getRequestContext>>;
  params: Awaited<ReturnType<typeof loadSearchParams>>;
  linkBase?: string;
}) {
  const query = toTableQuery(params, {
    sortable: MEMBER_SORTABLE_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  const members = await listMembers(ctx, query, { status: params.status });
  return <MembersTable rows={members.rows} total={members.total} linkBase={linkBase} />;
}
