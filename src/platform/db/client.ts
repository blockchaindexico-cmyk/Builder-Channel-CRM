import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Raw (unscoped) Prisma client — PLATFORM CODE ONLY.
 *
 * Feature modules must use the tenant-scoped client (`ctx.db`), never this one (rule T3, enforced by ESLint).
 * Legitimate uses: tenant resolution, seeding, background-job infrastructure and cross-tenant platform tasks.
 */
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export type RawPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { __crmPrisma?: RawPrismaClient };

export const prisma: RawPrismaClient = globalForPrisma.__crmPrisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  // Reuse the client across hot reloads in development.
  globalForPrisma.__crmPrisma = prisma;
}
