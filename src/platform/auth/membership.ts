import { prisma } from "@/platform/db/client";

/**
 * The membership a user works in: ACTIVE, in an ACTIVE organization — the given one, or (single-tenant
 * default) the oldest. Includes the role's permission grants.
 */
export async function findActiveMembership(userId: string, organizationId?: string | null) {
  return prisma.membership.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      organization: { status: "ACTIVE" },
      ...(organizationId ? { organizationId } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      role: {
        select: {
          id: true,
          key: true,
          name: true,
          permissions: { select: { permission: true, scope: true } },
        },
      },
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
}

export type ActiveMembership = NonNullable<Awaited<ReturnType<typeof findActiveMembership>>>;
