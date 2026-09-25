import type { LeadStatusCategory } from "@/generated/prisma/enums";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";

/**
 * Lead counts per owner for workload views and assignment balancing (M05). No permission check: callers pass the
 * owners their own scope allows. Deleted and merged leads never count.
 */
export const OPEN_STATUS_CATEGORIES = ["OPEN", "ACTIVE", "BOOKING"] as const;
/** Statuses of leads nobody has worked on yet. */
const UNTOUCHED_STATUS_KEYS = ["NEW", "ASSIGNED"];

export interface OwnerLeadCounts {
  ownerId: string | null;
  byCategory: Record<LeadStatusCategory, number>;
  /** Leads in an open category (open, in progress or booking). */
  open: number;
  /** Open leads still New or Assigned. */
  untouched: number;
  /** Open leads assigned before `unworkedBefore` with no activity since the assignment. */
  unworked: number;
}

const emptyCategories = (): Record<LeadStatusCategory, number> => ({
  OPEN: 0,
  ACTIVE: 0,
  BOOKING: 0,
  WON: 0,
  LOST: 0,
  INVALID: 0,
});

export async function countLeadsByOwner(
  db: TenantDbOrTx,
  organizationId: string,
  options: { ownerIds?: readonly string[] | null; unworkedBefore: Date },
): Promise<OwnerLeadCounts[]> {
  const ownerIds = options.ownerIds ? [...options.ownerIds] : null;
  const rows = await db.$queryRaw<
    {
      owner_id: string | null;
      category: LeadStatusCategory;
      key: string;
      count: number;
      unworked: number;
    }[]
  >`
    SELECT l."owner_id", s."category", s."key",
           COUNT(*)::int AS "count",
           COUNT(*) FILTER (
             WHERE l."owner_id" IS NOT NULL
               AND l."owner_assigned_at" < ${options.unworkedBefore}
               AND l."last_activity_at" <= l."owner_assigned_at"
           )::int AS "unworked"
    FROM "leads" l
    JOIN "lead_statuses" s ON s."id" = l."status_id" AND s."organization_id" = l."organization_id"
    WHERE l."organization_id" = ${organizationId}::uuid
      AND l."deleted_at" IS NULL
      AND l."duplicate_status" <> 'MERGED'
      AND (${ownerIds}::uuid[] IS NULL OR l."owner_id" = ANY(${ownerIds}::uuid[]) OR l."owner_id" IS NULL)
    GROUP BY l."owner_id", s."category", s."key"`;
  const byOwner = new Map<string | null, OwnerLeadCounts>();
  for (const row of rows) {
    const entry =
      byOwner.get(row.owner_id) ??
      ({
        ownerId: row.owner_id,
        byCategory: emptyCategories(),
        open: 0,
        untouched: 0,
        unworked: 0,
      } satisfies OwnerLeadCounts);
    entry.byCategory[row.category] += row.count;
    if ((OPEN_STATUS_CATEGORIES as readonly string[]).includes(row.category)) {
      entry.open += row.count;
      entry.unworked += row.unworked;
      if (UNTOUCHED_STATUS_KEYS.includes(row.key)) entry.untouched += row.count;
    }
    byOwner.set(row.owner_id, entry);
  }
  return [...byOwner.values()];
}

/** Open leads per owner (for "least loaded" choices and assignee pickers). */
export async function countOpenLeadsByOwner(
  db: TenantDbOrTx,
  ownerIds: readonly string[],
): Promise<Map<string, number>> {
  if (ownerIds.length === 0) return new Map();
  const counts = await db.lead.groupBy({
    by: ["ownerId"],
    where: {
      ownerId: { in: [...ownerIds] },
      deletedAt: null,
      duplicateStatus: { not: "MERGED" },
      status: { category: { in: [...OPEN_STATUS_CATEGORIES] } },
    },
    _count: { _all: true },
  });
  return new Map(
    counts
      .filter((row): row is typeof row & { ownerId: string } => row.ownerId !== null)
      .map((row) => [row.ownerId, row._count._all]),
  );
}

/** Open leads owned by one member (for handing them over when the member leaves). */
export async function listOpenLeadIdsOfOwner(db: TenantDbOrTx, ownerId: string): Promise<string[]> {
  const leads = await db.lead.findMany({
    where: {
      ownerId,
      deletedAt: null,
      duplicateStatus: { not: "MERGED" },
      status: { category: { in: [...OPEN_STATUS_CATEGORIES] } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return leads.map((lead) => lead.id);
}
