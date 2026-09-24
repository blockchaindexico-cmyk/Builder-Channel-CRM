import type { Prisma } from "@/generated/prisma/client";
import type { ActorType } from "@/generated/prisma/enums";
import { type DateRange, toUtcBounds } from "@/lib/date-range";
import type { TableQuery } from "@/lib/table-query";
import type { ServiceContext } from "@/platform/tenant/context";
import { uuidOrNull } from "@/platform/validation";

import { IDENTITY_PERMISSIONS } from "../permissions";

export interface AuditLogRow {
  id: string;
  createdAt: string;
  actorType: ActorType;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  requestId: string | null;
}

export interface AuditLogFilters {
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  action?: string | null;
  range?: DateRange | null;
  timezone: string;
}

export const AUDIT_SORTABLE_FIELDS = ["createdAt", "action"] as const;

/** Audit log viewer (M02-18, PRD §14 "review important system activities and audit history"). */
export async function listAuditLogs(
  ctx: ServiceContext,
  query: TableQuery,
  filters: AuditLogFilters,
): Promise<{ rows: AuditLogRow[]; total: number }> {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.auditView);
  const where: Prisma.AuditLogWhereInput = {};
  const actorId = uuidOrNull(filters.actorId);
  if (actorId) where.actorId = actorId;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.action) where.action = { startsWith: filters.action };
  if (filters.range) {
    const { gte, lt } = toUtcBounds(filters.range, filters.timezone);
    where.createdAt = { gte, lt };
  }
  if (query.q) {
    where.OR = [
      { summary: { contains: query.q, mode: "insensitive" } },
      { action: { contains: query.q, mode: "insensitive" } },
      { actorName: { contains: query.q, mode: "insensitive" } },
    ];
  }
  const orderBy: Prisma.AuditLogOrderByWithRelationInput[] =
    query.sort?.field === "action"
      ? [{ action: query.sort.direction }, { createdAt: "desc" }]
      : [{ createdAt: query.sort?.direction ?? "desc" }, { id: "desc" }];

  const [rows, total] = await Promise.all([
    ctx.db.auditLog.findMany({ where, orderBy, skip: query.skip, take: query.take }),
    ctx.db.auditLog.count({ where }),
  ]);
  return { total, rows: rows.map(toRow) };
}

/** Latest entries about a user or performed by them (user detail page, M02-11). */
export async function listRecentActivityForUser(
  ctx: ServiceContext,
  userId: string,
  take = 10,
): Promise<AuditLogRow[]> {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.auditView);
  const rows = await ctx.db.auditLog.findMany({
    where: { OR: [{ entityType: "User", entityId: userId }, { actorId: userId }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
  return rows.map(toRow);
}

function toRow(row: {
  id: string;
  createdAt: Date;
  actorType: ActorType;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  changes: unknown;
  metadata: unknown;
  ipAddress: string | null;
  requestId: string | null;
}): AuditLogRow {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actorType: row.actorType,
    actorId: row.actorId,
    actorName: row.actorName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    changes: (row.changes as AuditLogRow["changes"]) ?? null,
    metadata: (row.metadata as AuditLogRow["metadata"]) ?? null,
    ipAddress: row.ipAddress,
    requestId: row.requestId,
  };
}

/** Filter options: entity types, action prefixes and people seen in the log. */
export async function getAuditLogFilterOptions(ctx: ServiceContext) {
  ctx.permissions.assert(IDENTITY_PERMISSIONS.auditView);
  const [entityTypes, actions, actors] = await Promise.all([
    ctx.db.auditLog.findMany({
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
    ctx.db.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    // One row per person, carrying the most recent name they acted under.
    ctx.db.auditLog.findMany({
      where: { actorId: { not: null }, actorType: "USER" },
      distinct: ["actorId"],
      select: { actorId: true, actorName: true },
      orderBy: [{ actorId: "asc" }, { createdAt: "desc" }],
    }),
  ]);
  return {
    entityTypes: entityTypes.map((row) => row.entityType),
    actions: actions.map((row) => row.action),
    actors: actors
      .filter((row): row is { actorId: string; actorName: string | null } => Boolean(row.actorId))
      .map((row) => ({ id: row.actorId, name: row.actorName ?? "Unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
