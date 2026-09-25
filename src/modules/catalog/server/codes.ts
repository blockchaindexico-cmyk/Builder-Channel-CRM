import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError } from "@/platform/errors";
import { nextSequenceNumber } from "@/platform/sequences";
import type { ServiceContext } from "@/platform/tenant/context";

/**
 * Codes are unique per organization (rule T2). A typed code is checked; a blank one is generated from the
 * organization's sequence (BLD-0001, PRJ-0001), skipping numbers already taken by typed codes.
 */
export async function resolveCode(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  entity: "builder" | "project",
  requested: string | null | undefined,
  exceptId?: string,
): Promise<string> {
  const exists = async (code: string) => {
    const where = { code, ...(exceptId ? { id: { not: exceptId } } : {}) };
    return entity === "builder"
      ? Boolean(await tx.builder.findFirst({ where, select: { id: true } }))
      : Boolean(await tx.project.findFirst({ where, select: { id: true } }));
  };
  if (requested) {
    if (await exists(requested)) {
      throw new ConflictError(`The code ${requested} is already used by another ${entity}.`, {
        field: "code",
      });
    }
    return requested;
  }
  const prefix = entity === "builder" ? "BLD" : "PRJ";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = await nextSequenceNumber(tx, ctx, `catalog.${entity}`, prefix, { padding: 4 });
    if (!(await exists(code))) return code;
  }
  throw new ConflictError(`Could not generate a free ${entity} code. Enter one manually.`);
}

/** Maps a unique-constraint violation on `code` to a friendly field error. */
export function isCodeConflict(error: unknown): boolean {
  const prismaError = error as { code?: string; meta?: unknown };
  return prismaError?.code === "P2002" && JSON.stringify(prismaError.meta ?? {}).includes("code");
}
