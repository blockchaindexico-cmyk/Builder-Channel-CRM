import type { Prisma } from "@/generated/prisma/client";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import type { ServiceContext } from "@/platform/tenant/context";

import { LEAD_PERMISSIONS } from "../permissions";
import { findVisibleLead } from "./scope";

/**
 * Appends a timeline entry (PRD §22) — call it with the transaction of the change so the history always
 * matches the data. Also bumps the lead's `lastActivityAt`. Other modules write entries through the public
 * `recordLeadActivity` export (M05 assignment, M07 calls, M08 visits…).
 */
export async function recordLeadActivity(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  input: {
    leadId: string;
    type: string;
    summary: string;
    payload?: Record<string, unknown>;
    occurredAt?: Date;
    touch?: boolean;
  },
) {
  const occurredAt = input.occurredAt ?? new Date();
  const activity = await tx.leadActivity.create({
    data: {
      organizationId: ctx.organizationId,
      leadId: input.leadId,
      type: input.type,
      actorType: ctx.actor.type,
      actorId: ctx.actor.id,
      actorName: ctx.actor.name,
      summary: input.summary,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      occurredAt,
    },
  });
  if (input.touch !== false) {
    await tx.lead.update({ where: { id: input.leadId }, data: { lastActivityAt: occurredAt } });
  }
  return activity;
}

export interface TimelineEntry {
  id: string;
  type: string;
  actorType: string;
  actorName: string;
  summary: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

/** The lead's timeline, newest first, optionally filtered by entry types (M04-11). */
export async function listLeadTimeline(
  ctx: ServiceContext,
  leadId: string,
  options: { types?: string[]; take?: number; before?: string | null } = {},
): Promise<{ entries: TimelineEntry[]; types: string[]; hasMore: boolean }> {
  await findVisibleLead(ctx, leadId, { permission: LEAD_PERMISSIONS.view });
  const take = Math.min(options.take ?? 50, 200);
  const where: Prisma.LeadActivityWhereInput = { leadId };
  if (options.types?.length) where.type = { in: options.types };
  if (options.before) where.occurredAt = { lt: new Date(options.before) };
  const [rows, types] = await Promise.all([
    ctx.db.leadActivity.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: take + 1,
    }),
    ctx.db.leadActivity.findMany({ where: { leadId }, distinct: ["type"], select: { type: true } }),
  ]);
  return {
    hasMore: rows.length > take,
    types: types.map((row) => row.type).sort(),
    entries: rows.slice(0, take).map((row) => ({
      id: row.id,
      type: row.type,
      actorType: row.actorType,
      actorName: row.actorName,
      summary: row.summary,
      payload: (row.payload as Record<string, unknown>) ?? {},
      occurredAt: row.occurredAt.toISOString(),
    })),
  };
}
