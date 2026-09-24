import { env } from "@/config/env";
import { prisma } from "@/platform/db/client";

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
}

const CACHE_TTL_MS = 60_000;
let cached: { value: TenantInfo; expiresAt: number } | null = null;

/**
 * Single-tenant mode (M01): the active organization is the one identified by `DEFAULT_ORGANIZATION_SLUG`.
 * From M02 the organization comes from the signed-in user's membership instead; this remains the fallback
 * for platform tasks. Multi-tenant resolution by subdomain arrives in phase F1.
 */
export async function resolveDefaultOrganization(): Promise<TenantInfo> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const organization = await prisma.organization.findUnique({
    where: { slug: env.DEFAULT_ORGANIZATION_SLUG },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!organization) {
    throw new Error(
      `Default organization "${env.DEFAULT_ORGANIZATION_SLUG}" not found. Run \`pnpm db:seed\` first.`,
    );
  }
  if (organization.status !== "ACTIVE") {
    throw new Error(`Organization "${organization.slug}" is suspended.`);
  }

  const value = { id: organization.id, name: organization.name, slug: organization.slug };
  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** Clears the cached default organization (used after renaming the organization and in tests). */
export function clearTenantCache(): void {
  cached = null;
}
