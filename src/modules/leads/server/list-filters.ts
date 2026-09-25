import { getServerRegistry } from "@/modules/registry.server";

import type { LeadListFilter } from "../extensions";

/** Lead list filters contributed by other modules (`lead.list.filter`), in display order. */
export function leadListFilterExtensions(): LeadListFilter[] {
  return [...getServerRegistry().extensions("lead.list.filter")].sort((a, b) => a.order - b.order);
}
