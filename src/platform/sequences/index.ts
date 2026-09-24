import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import type { ServiceContext } from "@/platform/tenant/context";

/**
 * Per-organization counters for human-readable numbers (rule T7): `LD-000123`, `BK-000045`, `INV/2026-27/0001`.
 *
 * The increment is a single atomic upsert; the row lock serializes concurrent callers. Call it inside the
 * same transaction that creates the numbered record so a rolled-back transaction does not consume a number.
 */
export async function nextSequenceValue(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
  key: string,
): Promise<number> {
  if (!/^[a-z0-9:._/-]{1,100}$/i.test(key)) {
    throw new Error(`Invalid sequence key "${key}".`);
  }
  const rows = await db.$queryRaw<{ last_value: number }[]>`
    INSERT INTO "sequences" ("organization_id", "key", "last_value", "updated_at")
    VALUES (${ctx.organizationId}::uuid, ${key}, 1, now())
    ON CONFLICT ("organization_id", "key")
    DO UPDATE SET "last_value" = "sequences"."last_value" + 1, "updated_at" = now()
    RETURNING "last_value"`;
  const value = rows[0]?.last_value;
  if (typeof value !== "number") {
    throw new Error(`Sequence "${key}" did not return a value.`);
  }
  return value;
}

/** Formats a sequence value, e.g. `formatSequenceNumber("LD", 42)` → `LD-000042`. */
export function formatSequenceNumber(
  prefix: string,
  value: number,
  options: { padding?: number; separator?: string } = {},
): string {
  const { padding = 6, separator = "-" } = options;
  return `${prefix}${separator}${String(value).padStart(padding, "0")}`;
}

/** Convenience: next formatted number for a prefix, e.g. `nextSequenceNumber(tx, ctx, "lead", "LD")`. */
export async function nextSequenceNumber(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
  key: string,
  prefix: string,
  options?: { padding?: number; separator?: string },
): Promise<string> {
  const value = await nextSequenceValue(db, ctx, key);
  return formatSequenceNumber(prefix, value, options);
}
