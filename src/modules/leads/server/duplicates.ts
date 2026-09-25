import type { Prisma } from "@/generated/prisma/client";
import type { TableQuery } from "@/lib/table-query";
import { recordAudit } from "@/platform/audit";
import { ConflictError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import type { ServiceContext } from "@/platform/tenant/context";

import { LEAD_ACTIVITY_TYPES } from "../constants";
import { LEAD_PERMISSIONS } from "../permissions";
import { findVisibleLead, leadScopeWhere } from "./scope";
import { applyStatusChange } from "./status";
import { recordLeadActivity } from "./timeline";

const summarySelect = {
  id: true,
  number: true,
  name: true,
  mobile: true,
  email: true,
  city: true,
  createdAt: true,
  channel: true,
  status: { select: { label: true, color: true } },
  owner: { select: { user: { select: { name: true } } } },
  source: { select: { name: true } },
} satisfies Prisma.LeadSelect;

type Summary = Prisma.LeadGetPayload<{ select: typeof summarySelect }>;

function toSummary(lead: Summary) {
  return {
    id: lead.id,
    number: lead.number,
    name: lead.name,
    mobile: lead.mobile,
    email: lead.email,
    city: lead.city,
    status: lead.status,
    ownerName: lead.owner?.user.name ?? null,
    sourceName: lead.source?.name ?? null,
    channel: lead.channel,
    createdAt: lead.createdAt.toISOString(),
  };
}
export type LeadSummary = ReturnType<typeof toSummary>;

/** Duplicate review queue (M04-17): suspected duplicates in the actor's scope with their original. */
export async function listDuplicateQueue(ctx: ServiceContext, query: TableQuery) {
  const scope = await leadScopeWhere(ctx);
  const where: Prisma.LeadWhereInput = { AND: [scope, { duplicateStatus: "SUSPECTED" }] };
  const [leads, total] = await Promise.all([
    ctx.db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.take,
      select: { ...summarySelect, duplicateOf: { select: summarySelect } },
    }),
    ctx.db.lead.count({ where }),
  ]);
  return {
    total,
    rows: leads.map((lead) => ({
      lead: toSummary(lead),
      original: lead.duplicateOf ? toSummary(lead.duplicateOf) : null,
    })),
  };
}

/** "Not a duplicate": clears the flag (the link is kept for history). */
export async function dismissDuplicate(ctx: ServiceContext, leadId: string) {
  ctx.permissions.assert(LEAD_PERMISSIONS.merge);
  await ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, leadId, { db: tx });
    if (lead.duplicateStatus !== "SUSPECTED")
      throw new ConflictError(`${lead.number} is not waiting for duplicate review.`);
    await tx.lead.update({ where: { id: leadId }, data: { duplicateStatus: "DISMISSED" } });
    await recordLeadActivity(tx, ctx, {
      leadId,
      type: LEAD_ACTIVITY_TYPES.DUPLICATE_RESOLVED,
      summary: "Marked as not a duplicate",
      payload: { resolution: "DISMISSED" },
    });
    await recordAudit(tx, ctx, {
      action: "lead.duplicate.dismiss",
      entityType: "Lead",
      entityId: leadId,
      summary: `${lead.number} is not a duplicate`,
    });
  });
}

/** "Duplicate": links the lead to its original and closes it as Invalid / Duplicate. */
export async function markAsDuplicate(ctx: ServiceContext, leadId: string, originalId: string) {
  ctx.permissions.assert(LEAD_PERMISSIONS.merge);
  if (leadId === originalId) throw new ValidationError("A lead cannot be a duplicate of itself.");
  await ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, leadId, { db: tx });
    const original = await findVisibleLead(ctx, originalId, { db: tx });
    if (original.duplicateStatus === "MERGED" || original.duplicateStatus === "CONFIRMED") {
      throw new ConflictError(
        `${original.number} is itself a duplicate; choose its original instead.`,
      );
    }
    await tx.lead.update({
      where: { id: leadId },
      data: { duplicateStatus: "CONFIRMED", duplicateOfId: originalId },
    });
    const invalid = await tx.leadStatus.findFirstOrThrow({ where: { key: "INVALID" } });
    if (lead.statusId !== invalid.id) {
      await applyStatusChange(
        tx,
        ctx,
        lead,
        { statusId: invalid.id, reason: `Duplicate of ${original.number}` },
        { workflow: true },
      );
    }
    await recordLeadActivity(tx, ctx, {
      leadId,
      type: LEAD_ACTIVITY_TYPES.DUPLICATE_RESOLVED,
      summary: `Confirmed as a duplicate of ${original.number}`,
      payload: { resolution: "CONFIRMED", originalId, originalNumber: original.number },
    });
    await recordAudit(tx, ctx, {
      action: "lead.duplicate.confirm",
      entityType: "Lead",
      entityId: leadId,
      summary: `${lead.number} is a duplicate of ${original.number}`,
    });
  });
}

/**
 * Basic merge (M04-17): moves notes, project interests, timeline entries and attachments of the duplicate to
 * the primary lead, fills contact fields the primary lacks, and closes the duplicate as merged.
 */
export async function mergeLeads(ctx: ServiceContext, primaryId: string, duplicateId: string) {
  ctx.permissions.assert(LEAD_PERMISSIONS.merge);
  if (primaryId === duplicateId) throw new ValidationError("Choose two different leads.");
  return ctx.db.$transaction(async (tx) => {
    const primary = await findVisibleLead(ctx, primaryId, {
      permission: LEAD_PERMISSIONS.update,
      db: tx,
    });
    const duplicate = await findVisibleLead(ctx, duplicateId, {
      permission: LEAD_PERMISSIONS.update,
      db: tx,
    });
    if (primary.duplicateStatus === "MERGED" || duplicate.duplicateStatus === "MERGED") {
      throw new ConflictError("One of these leads has already been merged.");
    }

    const moved = {
      notes: (
        await tx.leadNote.updateMany({
          where: { leadId: duplicateId },
          data: { leadId: primaryId },
        })
      ).count,
      files: (
        await tx.leadFile.updateMany({
          where: { leadId: duplicateId },
          data: { leadId: primaryId },
        })
      ).count,
      activities: (
        await tx.leadActivity.updateMany({
          where: { leadId: duplicateId },
          data: { leadId: primaryId },
        })
      ).count,
      interests: 0,
    };
    const existing = new Set(
      (
        await tx.leadProjectInterest.findMany({
          where: { leadId: primaryId },
          select: { projectId: true },
        })
      ).map((row) => row.projectId),
    );
    const interests = await tx.leadProjectInterest.findMany({ where: { leadId: duplicateId } });
    const newInterests = interests.filter((interest) => !existing.has(interest.projectId));
    if (newInterests.length) {
      await tx.leadProjectInterest.createMany({
        data: newInterests.map((interest) => ({
          organizationId: ctx.organizationId,
          leadId: primaryId,
          projectId: interest.projectId,
          level: interest.level,
        })),
      });
    }
    moved.interests = newInterests.length;
    await tx.leadProjectInterest.deleteMany({ where: { leadId: duplicateId } });

    // Fill blanks on the primary from the duplicate (never overwrite).
    const fill: Prisma.LeadUncheckedUpdateInput = {};
    const filled: string[] = [];
    const take = <
      K extends "alternateMobile" | "email" | "city" | "locality" | "address" | "requirementNotes",
    >(
      key: K,
    ) => {
      if (!primary[key] && duplicate[key]) {
        (fill as Record<string, unknown>)[key] = duplicate[key];
        filled.push(key);
      }
    };
    if (!primary.email && duplicate.email) {
      fill.emailNormalized = duplicate.emailNormalized;
    }
    (["email", "city", "locality", "address", "requirementNotes"] as const).forEach(take);
    if (
      !primary.alternateMobile &&
      duplicate.mobile &&
      duplicate.mobileNormalized !== primary.mobileNormalized
    ) {
      fill.alternateMobile = duplicate.mobile;
      fill.alternateMobileNormalized = duplicate.mobileNormalized;
      filled.push("alternateMobile");
    }
    if (Object.keys(fill).length) await tx.lead.update({ where: { id: primaryId }, data: fill });

    await tx.lead.update({
      where: { id: duplicateId },
      data: { duplicateStatus: "MERGED", duplicateOfId: primaryId },
    });
    const invalid = await tx.leadStatus.findFirstOrThrow({ where: { key: "INVALID" } });
    if (duplicate.statusId !== invalid.id) {
      await applyStatusChange(
        tx,
        ctx,
        duplicate,
        { statusId: invalid.id, reason: `Merged into ${primary.number}` },
        { workflow: true },
      );
    }
    await recordLeadActivity(tx, ctx, {
      leadId: primaryId,
      type: LEAD_ACTIVITY_TYPES.MERGED,
      summary: `Merged ${duplicate.number} into this lead`,
      payload: { mergedLeadId: duplicateId, mergedNumber: duplicate.number, moved, filled },
    });
    await recordLeadActivity(tx, ctx, {
      leadId: duplicateId,
      type: LEAD_ACTIVITY_TYPES.MERGED,
      summary: `Merged into ${primary.number}`,
      payload: { primaryLeadId: primaryId, primaryNumber: primary.number },
      touch: false,
    });
    await recordAudit(tx, ctx, {
      action: "lead.merge",
      entityType: "Lead",
      entityId: primaryId,
      summary: `Merged ${duplicate.number} into ${primary.number}`,
      metadata: { mergedLeadId: duplicateId, moved, filled },
    });
    await publishEvent(tx, ctx, "lead.merged", {
      primaryLeadId: primaryId,
      mergedLeadId: duplicateId,
    });
    return { moved, filled };
  });
}
