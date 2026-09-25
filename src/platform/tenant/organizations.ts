import { prisma } from "@/platform/db/client";
import type { Logger } from "@/platform/logger";

import { createSystemContext, type ServiceContext } from "./context";

/** Ids of the active organizations, for scheduled jobs that run once per tenant (digests, alerts, sweeps). */
export async function listActiveOrganizationIds(): Promise<string[]> {
  const organizations = await prisma.organization.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return organizations.map((organization) => organization.id);
}

/**
 * Runs `task` for every active organization with a system context. A failing tenant does not stop the others;
 * the job fails afterwards (and is retried) when any tenant failed, so tasks must be idempotent.
 */
export async function forEachOrganization(
  name: string,
  task: (ctx: ServiceContext) => Promise<void>,
  logger?: Logger,
): Promise<void> {
  let failed = 0;
  for (const organizationId of await listActiveOrganizationIds()) {
    try {
      await task(createSystemContext(organizationId, { name }));
    } catch (error) {
      failed += 1;
      logger?.error({ err: error, organizationId }, `${name} failed for an organization`);
    }
  }
  if (failed > 0) throw new Error(`${name} failed for ${failed} organization(s).`);
}
