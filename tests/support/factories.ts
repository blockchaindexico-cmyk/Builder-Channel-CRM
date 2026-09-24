import { randomUUID } from "node:crypto";

import { prisma } from "@/platform/db/client";
import { PermissionSet } from "@/platform/rbac/permissions";
import { type Actor, createServiceContext, type ServiceContext } from "@/platform/tenant/context";

/** Test data builders (M01-25). Every test creates its own organization, so tests never share data. */
export async function createTestOrganization(overrides: { name?: string; slug?: string } = {}) {
  const suffix = randomUUID().slice(0, 8);
  const organization = await prisma.organization.create({
    data: {
      name: overrides.name ?? `Test Org ${suffix}`,
      slug: overrides.slug ?? `test-${suffix}`,
      settings: { create: {} },
    },
  });
  return organization;
}

export function createTestContext(
  organizationId: string,
  options: { permissions?: string[]; actor?: Partial<Actor> } = {},
): ServiceContext {
  return createServiceContext({
    organizationId,
    actor: {
      type: options.actor?.type ?? "USER",
      id: options.actor?.id ?? randomUUID(),
      name: options.actor?.name ?? "Test User",
    },
    permissions: options.permissions ? new PermissionSet(options.permissions) : PermissionSet.all(),
    requestId: randomUUID(),
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  });
}
