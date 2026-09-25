import type { LeadStatusCategory } from "@/generated/prisma/enums";
import { plural } from "@/lib/utils";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { DEFAULT_LEAD_SOURCES, DEFAULT_LEAD_STATUSES } from "../constants";
import { LEAD_PERMISSIONS } from "../permissions";
import {
  type CampaignInput,
  campaignSchema,
  type LeadSourceInput,
  leadSourceSchema,
  type LeadStatusInput,
  leadStatusSchema,
} from "../schemas";

/**
 * Seeds the default statuses (BUILD_PLAN §1.4) and lead sources for an organization (M04-02). Missing system
 * statuses are always added (business logic depends on their keys); sources only while the list is empty.
 */
export async function seedLeadMasters(db: TenantDbOrTx, organizationId: string): Promise<void> {
  const existing = await db.leadStatus.findMany({ select: { key: true } });
  const keys = new Set(existing.map((status) => status.key));
  const missing = DEFAULT_LEAD_STATUSES.filter((status) => !keys.has(status.key));
  if (missing.length > 0) {
    await db.leadStatus.createMany({
      data: missing.map((status) => ({
        organizationId,
        key: status.key,
        label: status.label,
        color: status.color,
        category: status.category,
        isTerminal: status.isTerminal,
        requiresReason: status.requiresReason,
        isSystem: true,
        sortOrder: (DEFAULT_LEAD_STATUSES.indexOf(status) + 1) * 10,
      })),
      skipDuplicates: true,
    });
  }
  if ((await db.leadSource.count()) === 0) {
    await db.leadSource.createMany({
      data: DEFAULT_LEAD_SOURCES.map((source, index) => ({
        organizationId,
        ...source,
        sortOrder: (index + 1) * 10,
      })),
      skipDuplicates: true,
    });
  }
}

// --- Read ----------------------------------------------------------------------------------------------------

export interface LeadStatusRow {
  id: string;
  key: string;
  label: string;
  color: string;
  category: LeadStatusCategory;
  sortOrder: number;
  isTerminal: boolean;
  requiresReason: boolean;
  isSystem: boolean;
  isActive: boolean;
}

export async function listLeadStatuses(
  ctx: ServiceContext,
  options: { activeOnly?: boolean } = {},
): Promise<LeadStatusRow[]> {
  return ctx.db.leadStatus.findMany({
    where: options.activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      id: true,
      key: true,
      label: true,
      color: true,
      category: true,
      sortOrder: true,
      isTerminal: true,
      requiresReason: true,
      isSystem: true,
      isActive: true,
    },
  });
}

export async function listLeadSources(ctx: ServiceContext, options: { activeOnly?: boolean } = {}) {
  const sources = await ctx.db.leadSource.findMany({
    where: options.activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { leads: true, campaigns: true } } },
  });
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    code: source.code,
    type: source.type,
    isActive: source.isActive,
    sortOrder: source.sortOrder,
    leadCount: source._count.leads,
    campaignCount: source._count.campaigns,
  }));
}

export async function listCampaigns(ctx: ServiceContext, options: { activeOnly?: boolean } = {}) {
  const campaigns = await ctx.db.campaign.findMany({
    where: options.activeOnly ? { isActive: true } : {},
    orderBy: [
      { isActive: "desc" },
      { startDate: { sort: "desc", nulls: "last" } },
      { name: "asc" },
    ],
    include: { source: { select: { id: true, name: true } }, _count: { select: { leads: true } } },
  });
  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    code: campaign.code,
    source: campaign.source,
    startDate: campaign.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: campaign.endDate?.toISOString().slice(0, 10) ?? null,
    cost: campaign.cost?.toString() ?? null,
    notes: campaign.notes,
    isActive: campaign.isActive,
    leadCount: campaign._count.leads,
  }));
}

/** Everything the lead forms and filters need, in one call. */
export async function getLeadFormOptions(ctx: ServiceContext) {
  const [statuses, sources, campaigns] = await Promise.all([
    listLeadStatuses(ctx),
    listLeadSources(ctx, { activeOnly: true }),
    listCampaigns(ctx, { activeOnly: true }),
  ]);
  return {
    statuses,
    sources: sources.map(({ id, name, code, type }) => ({ id, name, code, type })),
    campaigns: campaigns.map(({ id, name, code, source }) => ({
      id,
      name,
      code,
      sourceId: source?.id ?? null,
    })),
  };
}
export type LeadFormOptions = Awaited<ReturnType<typeof getLeadFormOptions>>;

// --- Sources ---------------------------------------------------------------------------------------------------

async function assertUnique(
  tx: TenantDbOrTx,
  model: "leadSource" | "campaign",
  fields: { name?: string; code: string },
  exceptId?: string,
) {
  const not = exceptId ? { id: { not: exceptId } } : {};
  const byCode =
    model === "leadSource"
      ? await tx.leadSource.findFirst({
          where: { code: fields.code, ...not },
          select: { id: true },
        })
      : await tx.campaign.findFirst({ where: { code: fields.code, ...not }, select: { id: true } });
  if (byCode)
    throw new ConflictError(`The code "${fields.code}" is already used.`, { field: "code" });
  if (fields.name && model === "leadSource") {
    const byName = await tx.leadSource.findFirst({
      where: { name: { equals: fields.name, mode: "insensitive" }, ...not },
      select: { id: true },
    });
    if (byName)
      throw new ConflictError(`A source named "${fields.name}" already exists.`, { field: "name" });
  }
}

export async function saveLeadSource(
  ctx: ServiceContext,
  sourceId: string | null,
  input: LeadSourceInput,
) {
  ctx.permissions.assert(LEAD_PERMISSIONS.mastersManage);
  const values = parseInput(leadSourceSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await assertUnique(tx, "leadSource", values, sourceId ?? undefined);
    if (sourceId) {
      const before = await tx.leadSource.findFirst({ where: { id: sourceId } });
      if (!before) throw new NotFoundError("Lead source", sourceId);
      const after = await tx.leadSource.update({ where: { id: sourceId }, data: values });
      await recordAudit(tx, ctx, {
        action: "lead_source.update",
        entityType: "LeadSource",
        entityId: sourceId,
        summary: `Updated lead source "${after.name}"`,
        before: {
          name: before.name,
          code: before.code,
          type: before.type,
          isActive: before.isActive,
          sortOrder: before.sortOrder,
        },
        after: {
          name: after.name,
          code: after.code,
          type: after.type,
          isActive: after.isActive,
          sortOrder: after.sortOrder,
        },
      });
      return { id: sourceId };
    }
    const created = await tx.leadSource.create({
      data: { organizationId: ctx.organizationId, ...values },
    });
    await recordAudit(tx, ctx, {
      action: "lead_source.create",
      entityType: "LeadSource",
      entityId: created.id,
      summary: `Added lead source "${created.name}"`,
    });
    return { id: created.id };
  });
}

export async function deleteLeadSource(ctx: ServiceContext, sourceId: string) {
  ctx.permissions.assert(LEAD_PERMISSIONS.mastersManage);
  await ctx.db.$transaction(async (tx) => {
    const source = await tx.leadSource.findFirst({
      where: { id: sourceId },
      include: { _count: { select: { leads: true, campaigns: true } } },
    });
    if (!source) throw new NotFoundError("Lead source", sourceId);
    if (source._count.leads > 0 || source._count.campaigns > 0) {
      throw new ConflictError(
        `"${source.name}" is used by ${plural(source._count.leads, "lead")} and ${plural(source._count.campaigns, "campaign")}. Deactivate it instead.`,
      );
    }
    await tx.leadSource.delete({ where: { id: sourceId } });
    await recordAudit(tx, ctx, {
      action: "lead_source.delete",
      entityType: "LeadSource",
      entityId: sourceId,
      summary: `Deleted lead source "${source.name}"`,
    });
  });
}

// --- Campaigns -------------------------------------------------------------------------------------------------

export async function saveCampaign(
  ctx: ServiceContext,
  campaignId: string | null,
  input: CampaignInput,
) {
  ctx.permissions.assert(LEAD_PERMISSIONS.mastersManage);
  const values = parseInput(campaignSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await assertUnique(tx, "campaign", { code: values.code }, campaignId ?? undefined);
    if (
      values.sourceId &&
      !(await tx.leadSource.findFirst({ where: { id: values.sourceId }, select: { id: true } }))
    ) {
      throw new NotFoundError("Lead source", values.sourceId);
    }
    const data = {
      name: values.name,
      code: values.code,
      sourceId: values.sourceId ?? null,
      startDate: values.startDate ? new Date(`${values.startDate}T00:00:00.000Z`) : null,
      endDate: values.endDate ? new Date(`${values.endDate}T00:00:00.000Z`) : null,
      cost: values.cost ?? null,
      notes: values.notes ?? null,
      isActive: values.isActive,
    };
    if (campaignId) {
      const before = await tx.campaign.findFirst({ where: { id: campaignId } });
      if (!before) throw new NotFoundError("Campaign", campaignId);
      const after = await tx.campaign.update({ where: { id: campaignId }, data });
      await recordAudit(tx, ctx, {
        action: "campaign.update",
        entityType: "Campaign",
        entityId: campaignId,
        summary: `Updated campaign "${after.name}"`,
        before: { ...before, cost: before.cost?.toString() ?? null },
        after: { ...after, cost: after.cost?.toString() ?? null },
        fields: ["name", "code", "sourceId", "startDate", "endDate", "cost", "notes", "isActive"],
      });
      return { id: campaignId };
    }
    const created = await tx.campaign.create({
      data: { organizationId: ctx.organizationId, ...data },
    });
    await recordAudit(tx, ctx, {
      action: "campaign.create",
      entityType: "Campaign",
      entityId: created.id,
      summary: `Added campaign "${created.name}"`,
    });
    return { id: created.id };
  });
}

export async function deleteCampaign(ctx: ServiceContext, campaignId: string) {
  ctx.permissions.assert(LEAD_PERMISSIONS.mastersManage);
  await ctx.db.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { id: campaignId },
      include: { _count: { select: { leads: true } } },
    });
    if (!campaign) throw new NotFoundError("Campaign", campaignId);
    if (campaign._count.leads > 0) {
      throw new ConflictError(
        `"${campaign.name}" has ${plural(campaign._count.leads, "lead")}. Deactivate it instead.`,
      );
    }
    await tx.campaign.delete({ where: { id: campaignId } });
    await recordAudit(tx, ctx, {
      action: "campaign.delete",
      entityType: "Campaign",
      entityId: campaignId,
      summary: `Deleted campaign "${campaign.name}"`,
    });
  });
}

// --- Statuses ----------------------------------------------------------------------------------------------------

/**
 * Updates a status (M04-03): label, colour, order, category, reason rule and active flag. System statuses keep
 * their key, category and terminal flag, which business logic relies on.
 */
export async function updateLeadStatus(
  ctx: ServiceContext,
  statusId: string,
  input: LeadStatusInput,
) {
  ctx.permissions.assert(LEAD_PERMISSIONS.mastersManage);
  const values = parseInput(leadStatusSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const before = await tx.leadStatus.findFirst({ where: { id: statusId } });
    if (!before) throw new NotFoundError("Lead status", statusId);
    if (before.key === "NEW" && !values.isActive) {
      throw new ConflictError(
        "New / Open is the starting status of every lead and cannot be deactivated.",
      );
    }
    const data = before.isSystem
      ? {
          label: values.label,
          color: values.color,
          sortOrder: values.sortOrder,
          requiresReason: values.requiresReason,
          isActive: values.isActive,
        }
      : values;
    const after = await tx.leadStatus.update({ where: { id: statusId }, data });
    await recordAudit(tx, ctx, {
      action: "lead_status.update",
      entityType: "LeadStatus",
      entityId: statusId,
      summary: `Updated lead status "${after.label}"`,
      before,
      after,
      fields: [
        "label",
        "color",
        "category",
        "sortOrder",
        "isTerminal",
        "requiresReason",
        "isActive",
      ],
    });
  });
}

/** Adds a custom status (e.g. "Documents pending") within a category. */
export async function createLeadStatus(ctx: ServiceContext, input: LeadStatusInput) {
  ctx.permissions.assert(LEAD_PERMISSIONS.mastersManage);
  const values = parseInput(leadStatusSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const base = `CUSTOM_${
      values.label
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 30) || "STATUS"
    }`;
    let key = base;
    for (
      let attempt = 2;
      await tx.leadStatus.findFirst({ where: { key }, select: { id: true } });
      attempt += 1
    ) {
      key = `${base}_${attempt}`;
    }
    const created = await tx.leadStatus.create({
      data: { organizationId: ctx.organizationId, key, isSystem: false, ...values },
    });
    await recordAudit(tx, ctx, {
      action: "lead_status.create",
      entityType: "LeadStatus",
      entityId: created.id,
      summary: `Added lead status "${created.label}"`,
    });
    return { id: created.id };
  });
}

export async function deleteLeadStatus(ctx: ServiceContext, statusId: string) {
  ctx.permissions.assert(LEAD_PERMISSIONS.mastersManage);
  await ctx.db.$transaction(async (tx) => {
    const status = await tx.leadStatus.findFirst({
      where: { id: statusId },
      include: { _count: { select: { leads: true } } },
    });
    if (!status) throw new NotFoundError("Lead status", statusId);
    if (status.isSystem)
      throw new ConflictError("Standard statuses cannot be deleted; deactivate them instead.");
    if (status._count.leads > 0) {
      throw new ConflictError(
        `${plural(status._count.leads, "lead")} ${status._count.leads === 1 ? "has" : "have"} this status. Move them first or deactivate it.`,
      );
    }
    const history = await tx.leadStatusHistory.count({
      where: { OR: [{ fromStatusId: statusId }, { toStatusId: statusId }] },
    });
    if (history > 0)
      throw new ConflictError("This status appears in lead history. Deactivate it instead.");
    await tx.leadStatus.delete({ where: { id: statusId } });
    await recordAudit(tx, ctx, {
      action: "lead_status.delete",
      entityType: "LeadStatus",
      entityId: statusId,
      summary: `Deleted lead status "${status.label}"`,
    });
  });
}

/** Statuses with the number of (non-deleted) leads in each, for the settings screen. */
export async function listLeadStatusesWithUsage(ctx: ServiceContext) {
  ctx.permissions.assert(LEAD_PERMISSIONS.mastersManage);
  const [statuses, counts] = await Promise.all([
    listLeadStatuses(ctx),
    ctx.db.lead.groupBy({ by: ["statusId"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const byStatus = new Map(counts.map((row) => [row.statusId, row._count._all]));
  return statuses.map((status) => ({ ...status, leadCount: byStatus.get(status.id) ?? 0 }));
}
