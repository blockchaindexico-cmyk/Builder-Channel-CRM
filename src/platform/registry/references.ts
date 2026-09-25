import { getServerRegistry } from "@/modules/registry.server";
import type { ServiceContext } from "@/platform/tenant/context";

export interface ReferenceCount {
  label: string;
  count: number;
}

/** Records in other modules that reference `entity` `id` (only non-zero counts). */
export async function countReferences(
  ctx: ServiceContext,
  entity: string,
  id: string,
): Promise<ReferenceCount[]> {
  const checks = getServerRegistry().referenceChecksFor(entity);
  const counts = await Promise.all(
    checks.map(async (check) => ({ label: check.label, count: await check.count(ctx, id) })),
  );
  return counts.filter((entry) => entry.count > 0);
}

/** "12 leads and 3 bookings" */
export function describeReferences(references: readonly ReferenceCount[]): string {
  const parts = references.map((entry) => `${entry.count} ${entry.label}`);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
