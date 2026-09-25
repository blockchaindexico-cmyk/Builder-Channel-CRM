import { generateApiKey } from "@/platform/api/keys";
import { recordAudit } from "@/platform/audit";
import { NotFoundError, ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { LEAD_PERMISSIONS } from "../permissions";
import { type ApiKeyInput, apiKeySchema } from "../schemas";

/**
 * API keys for the lead intake API (M04-20): created with a name and an optional default source, shown once, and
 * revoked when a website or portal no longer needs them. Keys cannot be edited or restored — create a new one.
 */
export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  defaultSourceName: string | null;
  createdByName: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export async function listApiKeys(ctx: ServiceContext): Promise<ApiKeyRow[]> {
  ctx.permissions.assert(LEAD_PERMISSIONS.apiKeysManage);
  const [keys, sources] = await Promise.all([
    ctx.db.apiKey.findMany({ orderBy: { createdAt: "desc" } }),
    ctx.db.leadSource.findMany({ select: { id: true, name: true } }),
  ]);
  const sourceNames = new Map(sources.map((source) => [source.id, source.name]));
  // Active keys first, newest first within each group.
  return keys
    .sort((a, b) => Number(Boolean(a.revokedAt)) - Number(Boolean(b.revokedAt)))
    .map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      defaultSourceName: key.defaultSourceId
        ? (sourceNames.get(key.defaultSourceId) ?? null)
        : null,
      createdByName: key.createdByName,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      revokedAt: key.revokedAt?.toISOString() ?? null,
    }));
}

/** Creates a key and returns it in full — the only time it is ever shown. */
export async function createApiKey(
  ctx: ServiceContext,
  input: ApiKeyInput,
): Promise<{ id: string; key: string; prefix: string }> {
  ctx.permissions.assert(LEAD_PERMISSIONS.apiKeysManage);
  const values = parseInput(apiKeySchema, input);
  if (values.defaultSourceId) {
    const source = await ctx.db.leadSource.findFirst({
      where: { id: values.defaultSourceId, isActive: true },
      select: { id: true },
    });
    if (!source) {
      throw new ValidationError("Choose an active source.", {
        defaultSourceId: ["Unknown or inactive source"],
      });
    }
  }
  const generated = generateApiKey();
  return ctx.db.$transaction(async (tx) => {
    const key = await tx.apiKey.create({
      data: {
        organizationId: ctx.organizationId,
        name: values.name,
        prefix: generated.prefix,
        hashedKey: generated.hashedKey,
        defaultSourceId: values.defaultSourceId ?? null,
        createdById: ctx.actor.type === "USER" ? (ctx.actor.membershipId ?? null) : null,
        createdByName: ctx.actor.name,
      },
    });
    await recordAudit(tx, ctx, {
      action: "api_key.create",
      entityType: "ApiKey",
      entityId: key.id,
      summary: `Created API key "${values.name}" (${generated.prefix}…)`,
      metadata: { prefix: generated.prefix, defaultSourceId: values.defaultSourceId ?? null },
    });
    return { id: key.id, key: generated.key, prefix: generated.prefix };
  });
}

/** Revokes a key immediately; requests using it are refused from then on. */
export async function revokeApiKey(ctx: ServiceContext, keyId: string): Promise<void> {
  ctx.permissions.assert(LEAD_PERMISSIONS.apiKeysManage);
  const key = await ctx.db.apiKey.findFirst({ where: { id: keyId } });
  if (!key) throw new NotFoundError("API key", keyId);
  if (key.revokedAt) return;
  await ctx.db.$transaction(async (tx) => {
    await tx.apiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
    await recordAudit(tx, ctx, {
      action: "api_key.revoke",
      entityType: "ApiKey",
      entityId: keyId,
      summary: `Revoked API key "${key.name}" (${key.prefix}…)`,
    });
  });
}
