import type { Prisma } from "@/generated/prisma/client";
import type { MembershipStatus } from "@/generated/prisma/enums";
import { resolveDataScope } from "@/platform/rbac/scope";
import type { ServiceContext } from "@/platform/tenant/context";

import { IDENTITY_PERMISSIONS } from "../permissions";

export interface TeamNode {
  membershipId: string;
  name: string;
  email: string;
  roleName: string;
  designation: string | null;
  status: MembershipStatus;
  reportsToId: string | null;
  children: TeamNode[];
}

/**
 * Reporting tree (M02-14): admins see the whole organization, managers their own team (PRD §13 "which
 * executive has which leads" builds on this).
 */
export async function getTeamTree(
  ctx: ServiceContext,
): Promise<{ roots: TeamNode[]; total: number }> {
  const scope = await resolveDataScope(ctx, IDENTITY_PERMISSIONS.usersView);
  const where: Prisma.MembershipWhereInput = { status: { not: "INACTIVE" } };
  if (scope.scope !== "ALL") where.id = { in: scope.membershipIds };

  const members = await ctx.db.membership.findMany({
    where,
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      reportsToId: true,
      designation: true,
      status: true,
      user: { select: { name: true, email: true } },
      role: { select: { name: true } },
    },
  });

  const nodes = new Map<string, TeamNode>(
    members.map((member) => [
      member.id,
      {
        membershipId: member.id,
        name: member.user.name,
        email: member.user.email,
        roleName: member.role.name,
        designation: member.designation,
        status: member.status,
        reportsToId: member.reportsToId,
        children: [],
      },
    ]),
  );
  const roots: TeamNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.reportsToId ? nodes.get(node.reportsToId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return { roots, total: nodes.size };
}
