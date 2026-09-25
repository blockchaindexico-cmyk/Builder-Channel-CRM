import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/platform/db/client";
import type { PermissionSet } from "@/platform/rbac/permissions";
import { createServiceContext, type ServiceContext } from "@/platform/tenant/context";

/**
 * API keys for the public API `/api/v1` (M04-20). A key looks like `crm_<8 hex>_<32 base64url>`: the first part
 * (`crm_<8 hex>`) is stored as a recognisable prefix, the whole key only as a SHA-256 hash — it is shown once.
 */
export const API_KEY_PATTERN = /^crm_[0-9a-f]{8}_[A-Za-z0-9_-]{32}$/;

export interface GeneratedApiKey {
  key: string;
  prefix: string;
  hashedKey: string;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const prefix = `crm_${randomBytes(4).toString("hex")}`;
  const key = `${prefix}_${randomBytes(24).toString("base64url")}`;
  return { key, prefix, hashedKey: hashApiKey(key) };
}

/** Reads the key from `Authorization: Bearer <key>` or `X-API-Key: <key>`. */
export function readApiKey(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (authorization && /^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, "").trim() || null;
  }
  return headers.get("x-api-key")?.trim() || null;
}

export interface AuthenticatedApiKey {
  id: string;
  organizationId: string;
  name: string;
  defaultSourceId: string | null;
}

/** Resolves an active key of an active organization, or null. Records when the key was last used. */
export async function authenticateApiKey(key: string): Promise<AuthenticatedApiKey | null> {
  if (!API_KEY_PATTERN.test(key)) return null;
  const record = await prisma.apiKey.findUnique({
    where: { hashedKey: hashApiKey(key) },
    select: {
      id: true,
      organizationId: true,
      name: true,
      defaultSourceId: true,
      revokedAt: true,
      lastUsedAt: true,
      organization: { select: { status: true } },
    },
  });
  if (!record || record.revokedAt || record.organization.status !== "ACTIVE") return null;
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
    await prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
  return {
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    defaultSourceId: record.defaultSourceId,
  };
}

/** Service context for a request made with an API key: the key is the actor, with only the given permissions. */
export function createApiKeyContext(
  apiKey: AuthenticatedApiKey,
  permissions: PermissionSet,
  request: { requestId?: string; ipAddress?: string | null; userAgent?: string | null },
): ServiceContext {
  return createServiceContext({
    organizationId: apiKey.organizationId,
    actor: { type: "API_KEY", id: apiKey.id, name: `API key "${apiKey.name}"` },
    permissions,
    requestId: request.requestId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
  });
}
