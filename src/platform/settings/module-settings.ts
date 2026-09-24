import type { z } from "zod";

import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import type { ServiceContext } from "@/platform/tenant/context";

/**
 * Module-specific organization settings (rule T6), stored under a namespace in
 * `organization_settings.preferences` and validated by the owning module's zod schema (which should supply
 * defaults for every field). Example: `getModuleSettings(ctx, "leads", leadSettingsSchema)`.
 */
export async function getModuleSettings<TSchema extends z.ZodType>(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
  namespace: string,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  const row = await db.organizationSetting.findUnique({
    where: { organizationId: ctx.organizationId },
    select: { preferences: true },
  });
  const preferences =
    row?.preferences && typeof row.preferences === "object" && !Array.isArray(row.preferences)
      ? (row.preferences as Record<string, unknown>)
      : {};
  return schema.parse(preferences[namespace] ?? {});
}

/**
 * Validates and stores a namespace's settings atomically (single `jsonb_set`, no read-modify-write race).
 * Returns the stored value.
 */
export async function setModuleSettings<TSchema extends z.ZodType>(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
  namespace: string,
  schema: TSchema,
  value: z.input<TSchema>,
): Promise<z.output<TSchema>> {
  if (!/^[a-z][a-z0-9_.-]{0,60}$/.test(namespace))
    throw new Error(`Invalid settings namespace "${namespace}".`);
  const parsed = schema.parse(value);
  const json = JSON.stringify(parsed);
  await db.$executeRaw`
    UPDATE "organization_settings"
    SET "preferences" = jsonb_set(COALESCE("preferences", '{}'::jsonb), ${[namespace]}::text[], ${json}::jsonb, true),
        "updated_at" = now()
    WHERE "organization_id" = ${ctx.organizationId}::uuid`;
  return parsed;
}
