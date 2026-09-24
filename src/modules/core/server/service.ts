import type { Prisma } from "@/generated/prisma/client";
import type { DateRange } from "@/lib/date-range";
import { toUtcBounds } from "@/lib/date-range";
import type { TableQuery } from "@/lib/table-query";
import { runHealthChecks } from "@/platform/health";
import type { ServiceContext } from "@/platform/tenant/context";

import { CORE_PERMISSIONS } from "../permissions";

export interface DomainEventRow {
  id: string;
  type: string;
  occurredAt: string;
  actorType: string;
  actorName: string | null;
  dispatchedTo: string[];
  requestId: string | null;
  payload: unknown;
}

export interface DomainEventFilters {
  type?: string | null;
  range?: DateRange | null;
  timezone: string;
}

const SORTABLE = { occurredAt: "occurredAt", type: "type" } as const;
export const DOMAIN_EVENT_SORTABLE_FIELDS = Object.keys(SORTABLE);

/** System health for the status page (same checks as `/api/health`). */
export async function getSystemHealth(ctx: ServiceContext) {
  ctx.permissions.assert(CORE_PERMISSIONS.systemStatus);
  return runHealthChecks();
}

/** Paginated domain-event log of the current organization (newest first by default). */
export async function listDomainEvents(
  ctx: ServiceContext,
  query: TableQuery,
  filters: DomainEventFilters,
): Promise<{ rows: DomainEventRow[]; total: number }> {
  ctx.permissions.assert(CORE_PERMISSIONS.systemStatus);

  const where: Prisma.OutboxEventWhereInput = {};
  if (filters.type) where.type = filters.type;
  if (query.q)
    where.OR = [
      { type: { contains: query.q, mode: "insensitive" } },
      { actorName: { contains: query.q, mode: "insensitive" } },
    ];
  if (filters.range) {
    const { gte, lt } = toUtcBounds(filters.range, filters.timezone);
    where.occurredAt = { gte, lt };
  }

  const sortField = query.sort?.field === "type" ? "type" : "occurredAt";
  const orderBy: Prisma.OutboxEventOrderByWithRelationInput[] = [
    { [sortField]: query.sort?.direction ?? "desc" },
    { id: "desc" },
  ];

  const [rows, total] = await Promise.all([
    ctx.db.outboxEvent.findMany({ where, orderBy, skip: query.skip, take: query.take }),
    ctx.db.outboxEvent.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      type: row.type,
      occurredAt: row.occurredAt.toISOString(),
      actorType: row.actorType,
      actorName: row.actorName,
      dispatchedTo: row.dispatchedTo,
      requestId: row.requestId,
      payload: row.payload,
    })),
  };
}

/** Distinct event types recorded for the organization (for the filter menu). */
export async function listDomainEventTypes(ctx: ServiceContext): Promise<string[]> {
  ctx.permissions.assert(CORE_PERMISSIONS.systemStatus);
  const types = await ctx.db.outboxEvent.findMany({
    distinct: ["type"],
    select: { type: true },
    orderBy: { type: "asc" },
  });
  return types.map((row) => row.type);
}
