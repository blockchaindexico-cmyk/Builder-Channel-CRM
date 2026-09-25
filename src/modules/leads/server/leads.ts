import type { Prisma } from "@/generated/prisma/client";
import type { DuplicateStatus, LeadChannel } from "@/generated/prisma/enums";
import { type DateRange, toUtcBounds } from "@/lib/date-range";
import type { TableQuery } from "@/lib/table-query";
import { plural } from "@/lib/utils";
import { listMemberOptions } from "@/modules/identity";
import { getRegionalSettings } from "@/modules/organization";
import { getServerRegistry } from "@/modules/registry.server";
import { diffRecords, recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import {
  getSubtreeMembershipIds,
  getTeamMembershipIds,
  resolveDataScope,
} from "@/platform/rbac/scope";
import { nextSequenceNumber } from "@/platform/sequences";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput, uuidOrNull } from "@/platform/validation";

import { BUYING_TIMELINES, LEAD_ACTIVITY_TYPES, PURPOSES, TEMPERATURES } from "../constants";
import { LEAD_PERMISSIONS } from "../permissions";
import {
  type CreateLeadInput,
  createLeadSchema,
  type CreateLeadValues,
  type UpdateLeadInput,
  updateLeadSchema,
  type UpdateLeadValues,
} from "../schemas";
import { leadListFilterExtensions } from "./list-filters";
import {
  contactNumberErrors,
  leadNumberSearch,
  mobileSearchDigits,
  normalizeEmail,
  normalizeMobile,
} from "./normalize";
import { findVisibleLead, isLeadInScope, leadScopeWhere } from "./scope";
import { getLeadSettings } from "./settings";
import { recordLeadActivity } from "./timeline";

// --- Duplicates (M04-16) -----------------------------------------------------------------------------------------

export interface DuplicateMatch {
  id: string;
  number: string;
  /** Only when the lead is inside the actor's scope. */
  name: string | null;
  ownerName: string | null;
  statusLabel: string;
  matchedOn: ("mobile" | "email")[];
  visible: boolean;
}

interface NormalizedContact {
  mobileNormalized: string | null;
  alternateMobileNormalized: string | null;
  emailNormalized: string | null;
}

/** Existing leads (organization-wide) with the same mobile — primary or alternate — or e-mail. */
export async function findDuplicateLeads(
  db: TenantDbOrTx,
  ctx: ServiceContext,
  contact: NormalizedContact,
  excludeLeadId?: string | null,
): Promise<DuplicateMatch[]> {
  const mobiles = [contact.mobileNormalized, contact.alternateMobileNormalized].filter(
    (value): value is string => Boolean(value),
  );
  const conditions: Prisma.LeadWhereInput[] = [];
  if (mobiles.length) {
    conditions.push(
      { mobileNormalized: { in: mobiles } },
      { alternateMobileNormalized: { in: mobiles } },
    );
  }
  if (contact.emailNormalized) conditions.push({ emailNormalized: contact.emailNormalized });
  if (conditions.length === 0) return [];
  const leads = await db.lead.findMany({
    where: {
      deletedAt: null,
      duplicateStatus: { in: ["NONE", "SUSPECTED", "DISMISSED"] },
      ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
      OR: conditions,
    },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: {
      id: true,
      number: true,
      name: true,
      ownerId: true,
      mobileNormalized: true,
      alternateMobileNormalized: true,
      emailNormalized: true,
      status: { select: { label: true } },
      owner: { select: { user: { select: { name: true } } } },
    },
  });
  return Promise.all(
    leads.map(async (lead) => {
      const visible = await isLeadInScope(ctx, lead, LEAD_PERMISSIONS.view);
      const matchedOn: ("mobile" | "email")[] = [];
      if (
        mobiles.some(
          (mobile) => mobile === lead.mobileNormalized || mobile === lead.alternateMobileNormalized,
        )
      ) {
        matchedOn.push("mobile");
      }
      if (contact.emailNormalized && lead.emailNormalized === contact.emailNormalized)
        matchedOn.push("email");
      return {
        id: lead.id,
        number: lead.number,
        name: visible ? lead.name : null,
        ownerName: lead.owner?.user.name ?? null,
        statusLabel: lead.status.label,
        matchedOn,
        visible,
      };
    }),
  );
}

async function organizationCountry(ctx: ServiceContext): Promise<string> {
  return (await getRegionalSettings(ctx)).country;
}

function assertValidNumbers(
  values: { mobile?: string | null; alternateMobile?: string | null },
  country: string,
): void {
  const errors = contactNumberErrors(values, country);
  if (Object.keys(errors).length) throw new ValidationError("Enter a valid mobile number.", errors);
}

function normalizeContact(
  values: { mobile?: string | null; alternateMobile?: string | null; email?: string | null },
  country: string,
): NormalizedContact {
  return {
    mobileNormalized: normalizeMobile(values.mobile, country),
    alternateMobileNormalized: normalizeMobile(values.alternateMobile, country),
    emailNormalized: normalizeEmail(values.email),
  };
}

/** Live duplicate check for the create/edit form (M04-05). */
export async function checkDuplicates(
  ctx: ServiceContext,
  input: {
    mobile?: string | null;
    alternateMobile?: string | null;
    email?: string | null;
    excludeLeadId?: string | null;
  },
): Promise<DuplicateMatch[]> {
  if (!ctx.permissions.hasAny([LEAD_PERMISSIONS.create, LEAD_PERMISSIONS.update])) {
    ctx.permissions.assert(LEAD_PERMISSIONS.create);
  }
  const contact = normalizeContact(input, await organizationCountry(ctx));
  return findDuplicateLeads(ctx.db, ctx, contact, input.excludeLeadId ?? null);
}

function describeMatch(match: DuplicateMatch): string {
  return `${match.number}${match.ownerName ? ` (owned by ${match.ownerName})` : " (unassigned)"}`;
}

// --- References ------------------------------------------------------------------------------------------------

interface ExistingRefs {
  sourceId: string | null;
  campaignId: string | null;
  propertyTypeId: string | null;
  configurationTypeIds: string[];
  projectIds: string[];
}

/** Validates master and project references; values already on the lead may stay even if deactivated since. */
async function resolveReferences(
  tx: TenantDbOrTx,
  values: UpdateLeadValues,
  existing?: ExistingRefs,
): Promise<{ sourceId: string | null }> {
  let sourceId = values.sourceId ?? null;
  if (values.campaignId) {
    const campaign = await tx.campaign.findFirst({
      where: { id: values.campaignId },
      select: { id: true, isActive: true, sourceId: true },
    });
    if (!campaign || (!campaign.isActive && existing?.campaignId !== campaign.id)) {
      throw new ValidationError("Choose an active campaign.", {
        campaignId: ["Unknown or inactive campaign"],
      });
    }
    if (campaign.sourceId) {
      if (sourceId && sourceId !== campaign.sourceId) {
        throw new ValidationError("The campaign belongs to another source.", {
          campaignId: ["This campaign runs on a different source"],
        });
      }
      sourceId = campaign.sourceId;
    }
  }
  if (sourceId) {
    const source = await tx.leadSource.findFirst({
      where: { id: sourceId },
      select: { id: true, isActive: true },
    });
    if (!source || (!source.isActive && existing?.sourceId !== source.id)) {
      throw new ValidationError("Choose an active source.", {
        sourceId: ["Unknown or inactive source"],
      });
    }
  }
  if (values.propertyTypeId) {
    const type = await tx.propertyType.findFirst({
      where: { id: values.propertyTypeId },
      select: { id: true, isActive: true },
    });
    if (!type || (!type.isActive && existing?.propertyTypeId !== type.id)) {
      throw new ValidationError("Choose an active property type.", {
        propertyTypeId: ["Unknown or inactive"],
      });
    }
  }
  if (values.configurationTypeIds.length) {
    const found = await tx.configurationType.findMany({
      where: { id: { in: values.configurationTypeIds } },
      select: { id: true, isActive: true },
    });
    for (const id of values.configurationTypeIds) {
      const row = found.find((entry) => entry.id === id);
      if (!row || (!row.isActive && !existing?.configurationTypeIds.includes(id))) {
        throw new ValidationError("Choose active configurations.", {
          configurationTypeIds: ["Unknown or inactive"],
        });
      }
    }
  }
  const projectIds = values.interests.map((interest) => interest.projectId);
  if (projectIds.length) {
    const projects = await tx.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, isActive: true },
    });
    for (const id of projectIds) {
      const row = projects.find((project) => project.id === id);
      if (!row || (!row.isActive && !existing?.projectIds.includes(id))) {
        throw new ValidationError("Choose active projects.", {
          interests: ["A project is unknown or inactive"],
        });
      }
    }
  }
  return { sourceId };
}

function leadData(values: UpdateLeadValues, contact: NormalizedContact, sourceId: string | null) {
  return {
    name: values.name,
    mobile: values.mobile ?? null,
    alternateMobile: values.alternateMobile ?? null,
    email: values.email ?? null,
    ...contact,
    city: values.city ?? null,
    locality: values.locality ?? null,
    address: values.address ?? null,
    sourceId,
    campaignId: values.campaignId ?? null,
    subSource: values.subSource ?? null,
    budgetMin: values.budgetMin ?? null,
    budgetMax: values.budgetMax ?? null,
    propertyTypeId: values.propertyTypeId ?? null,
    configurationTypeIds: values.configurationTypeIds,
    preferredLocations: values.preferredLocations,
    purpose: values.purpose ?? null,
    buyingTimeline: values.buyingTimeline ?? null,
    requirementNotes: values.requirementNotes ?? null,
    temperature: values.temperature ?? null,
    tags: values.tags,
  };
}

// --- Snapshot for history -----------------------------------------------------------------------------------------

const snapshotInclude = {
  source: { select: { name: true } },
  campaign: { select: { name: true } },
  propertyType: { select: { name: true } },
  interests: { include: { project: { select: { name: true } } } },
} satisfies Prisma.LeadInclude;

type SnapshotLead = Prisma.LeadGetPayload<{ include: typeof snapshotInclude }>;

const label = (list: readonly { value: string; label: string }[], value: string | null) =>
  value ? (list.find((entry) => entry.value === value)?.label ?? value) : null;

/** Human-readable version of a lead for the timeline and audit log ("previous values", PRD §28). */
async function historySnapshot(tx: TenantDbOrTx, lead: SnapshotLead) {
  const configurations = lead.configurationTypeIds.length
    ? await tx.configurationType.findMany({
        where: { id: { in: lead.configurationTypeIds } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { name: true },
      })
    : [];
  return {
    name: lead.name,
    mobile: lead.mobile,
    alternateMobile: lead.alternateMobile,
    email: lead.email,
    city: lead.city,
    locality: lead.locality,
    address: lead.address,
    source: lead.source?.name ?? null,
    campaign: lead.campaign?.name ?? null,
    subSource: lead.subSource,
    budgetMin: lead.budgetMin?.toString() ?? null,
    budgetMax: lead.budgetMax?.toString() ?? null,
    propertyType: lead.propertyType?.name ?? null,
    configurations: configurations.map((entry) => entry.name),
    preferredLocations: lead.preferredLocations,
    purpose: label(PURPOSES, lead.purpose),
    buyingTimeline: label(BUYING_TIMELINES, lead.buyingTimeline),
    requirementNotes: lead.requirementNotes,
    temperature: label(TEMPERATURES, lead.temperature),
    tags: lead.tags,
    projects: lead.interests
      .map((interest) => `${interest.project.name} (${interest.level.toLowerCase()})`)
      .sort(),
  };
}

// --- Create (M04-05, M04-06) --------------------------------------------------------------------------------------

export interface CreateLeadOptions {
  channel?: LeadChannel;
  /** Owner chosen by an importer/API caller (validated); by default decided by the creator's scope. */
  ownerId?: string | null;
  /** Suppresses BLOCK (imports report duplicates themselves). */
  duplicatePolicyOverride?: "FLAG" | "BLOCK" | "ALLOW";
  /** Extra timeline payload, e.g. the import batch. */
  origin?: Record<string, unknown>;
  /** Import that creates the lead (M04-18). */
  importBatchId?: string;
  /** Runs inside the creating transaction, e.g. to count the row of an import exactly once. */
  onCreated?: (tx: TenantDbOrTx, lead: CreatedLead) => Promise<void>;
}

export interface CreatedLead {
  id: string;
  number: string;
  duplicateOf: DuplicateMatch | null;
  duplicateStatus: DuplicateStatus;
}

async function defaultOwner(ctx: ServiceContext): Promise<string | null> {
  // Until assignment rules arrive (M05), people who only see their own leads own what they create.
  const scope = await resolveDataScope(ctx, LEAD_PERMISSIONS.view).catch(() => null);
  return scope?.scope === "OWN" ? (ctx.actor.membershipId ?? null) : null;
}

export async function createLead(
  ctx: ServiceContext,
  input: CreateLeadInput,
  options: CreateLeadOptions = {},
): Promise<CreatedLead> {
  ctx.permissions.assert(LEAD_PERMISSIONS.create);
  const values: CreateLeadValues = parseInput(createLeadSchema, input);
  const country = await organizationCountry(ctx);
  assertValidNumbers(values, country);
  const contact = normalizeContact(values, country);
  const settings = await getLeadSettings(ctx.db, ctx);
  const policy = options.duplicatePolicyOverride ?? settings.duplicatePolicy;
  const channel = options.channel ?? "MANUAL";
  // Owner asked for by the creator: the import's owner column or "Assign to" on the form.
  const requestedOwnerId =
    options.ownerId !== undefined ? options.ownerId : values.assigneeId || undefined;
  // With assignment hooks installed (M05) they decide the owner; otherwise the M04 default applies.
  const hooks = getServerRegistry().extensions("lead.created");
  const ownerId = hooks.length
    ? null
    : requestedOwnerId !== undefined
      ? requestedOwnerId
      : await defaultOwner(ctx);

  return ctx.db.$transaction(async (tx) => {
    const { sourceId } = await resolveReferences(tx, values);
    if (ownerId) {
      const owner = await tx.membership.findFirst({
        where: { id: ownerId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!owner)
        throw new ValidationError("Choose an active owner.", { ownerId: ["Not an active member"] });
    }

    const matches = policy === "ALLOW" ? [] : await findDuplicateLeads(tx, ctx, contact);
    if (matches.length && policy === "BLOCK") {
      throw new ConflictError(
        `A lead with this ${matches[0]!.matchedOn.join(" and ")} already exists: ${describeMatch(matches[0]!)}.`,
        { field: matches[0]!.matchedOn[0] === "email" ? "email" : "mobile", duplicates: matches },
      );
    }
    const duplicateOf = matches[0] ?? null;

    const status = await tx.leadStatus.findFirst({
      where: { key: "NEW" },
      select: { id: true, key: true, label: true },
    });
    if (!status) throw new ConflictError("Lead statuses are not set up. Run the database seed.");
    const number = await nextSequenceNumber(tx, ctx, "lead", "LD");
    const createdById = ctx.actor.type === "USER" ? (ctx.actor.membershipId ?? null) : null;

    const lead = await tx.lead.create({
      data: {
        organizationId: ctx.organizationId,
        number,
        ...leadData(values, contact, sourceId),
        channel,
        importBatchId: options.importBatchId ?? null,
        statusId: status.id,
        ownerId,
        createdById,
        duplicateStatus: duplicateOf ? "SUSPECTED" : "NONE",
        duplicateOfId: duplicateOf?.id ?? null,
      },
      include: snapshotInclude,
    });
    if (values.interests.length) {
      await tx.leadProjectInterest.createMany({
        data: values.interests.map((interest) => ({
          organizationId: ctx.organizationId,
          leadId: lead.id,
          projectId: interest.projectId,
          level: interest.level,
        })),
      });
    }
    await tx.leadStatusHistory.create({
      data: {
        organizationId: ctx.organizationId,
        leadId: lead.id,
        fromStatusId: null,
        toStatusId: status.id,
        changedById: ctx.actor.id,
        changedByName: ctx.actor.name,
      },
    });

    const full = await tx.lead.findFirstOrThrow({
      where: { id: lead.id },
      include: snapshotInclude,
    });
    const snapshot = await historySnapshot(tx, full);
    const via =
      channel === "IMPORT"
        ? "from an import"
        : channel === "API"
          ? "via the intake API"
          : "manually";
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: LEAD_ACTIVITY_TYPES.CREATED,
      summary: `Lead ${number} created ${via}`,
      payload: {
        channel,
        source: snapshot.source,
        projects: snapshot.projects,
        ownerId,
        ...options.origin,
      },
    });
    if (values.note) {
      const note = await tx.leadNote.create({
        data: {
          organizationId: ctx.organizationId,
          leadId: lead.id,
          authorId: createdById,
          authorName: ctx.actor.name,
          body: values.note,
        },
      });
      await recordLeadActivity(tx, ctx, {
        leadId: lead.id,
        type: LEAD_ACTIVITY_TYPES.NOTE_ADDED,
        summary: "Added a note",
        payload: { noteId: note.id, excerpt: values.note.slice(0, 200) },
      });
      await publishEvent(tx, ctx, "lead.note_added", { leadId: lead.id, noteId: note.id });
    }
    if (duplicateOf) {
      await recordLeadActivity(tx, ctx, {
        leadId: lead.id,
        type: LEAD_ACTIVITY_TYPES.DUPLICATE_DETECTED,
        summary: `Possible duplicate of ${duplicateOf.number} (same ${duplicateOf.matchedOn.join(" and ")})`,
        payload: {
          matches: matches.map(({ id, number, matchedOn }) => ({ id, number, matchedOn })),
        },
      });
      await publishEvent(tx, ctx, "lead.duplicate_detected", {
        leadId: lead.id,
        matchedLeadIds: matches.map((match) => match.id),
      });
    }
    await recordAudit(tx, ctx, {
      action: "lead.create",
      entityType: "Lead",
      entityId: lead.id,
      summary: `Created lead ${number} (${values.name})${channel === "MANUAL" ? "" : ` via ${channel.toLowerCase()}`}`,
      before: {},
      after: snapshot,
    });
    const projectIds = values.interests.map((interest) => interest.projectId);
    for (const hook of hooks) {
      await hook({
        tx,
        ctx,
        lead: {
          id: lead.id,
          number,
          channel,
          statusKey: status.key,
          sourceId,
          campaignId: values.campaignId ?? null,
          projectIds,
        },
        requestedOwnerId,
        importBatchId: options.importBatchId,
      });
    }
    const finalOwner = hooks.length
      ? ((await tx.lead.findFirst({ where: { id: lead.id }, select: { ownerId: true } }))
          ?.ownerId ?? null)
      : ownerId;
    await publishEvent(tx, ctx, "lead.created", {
      leadId: lead.id,
      number,
      channel,
      ownerId: finalOwner,
      sourceId,
      projectIds,
    });
    const created: CreatedLead = {
      id: lead.id,
      number,
      duplicateOf,
      duplicateStatus: duplicateOf ? "SUSPECTED" : "NONE",
    };
    await options.onCreated?.(tx, created);
    return created;
  });
}

// --- Update (M04-06) -------------------------------------------------------------------------------------------

export async function updateLead(
  ctx: ServiceContext,
  leadId: string,
  input: UpdateLeadInput,
): Promise<{ changed: string[] }> {
  const values = parseInput(updateLeadSchema, input);
  const country = await organizationCountry(ctx);
  assertValidNumbers(values, country);
  const contact = normalizeContact(values, country);
  const settings = await getLeadSettings(ctx.db, ctx);

  return ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, leadId, {
      permission: LEAD_PERMISSIONS.update,
      include: snapshotInclude,
      db: tx,
    });
    const { sourceId } = await resolveReferences(tx, values, {
      sourceId: lead.sourceId,
      campaignId: lead.campaignId,
      propertyTypeId: lead.propertyTypeId,
      configurationTypeIds: lead.configurationTypeIds,
      projectIds: lead.interests.map((interest) => interest.projectId),
    });

    const contactChanged =
      contact.mobileNormalized !== lead.mobileNormalized ||
      contact.alternateMobileNormalized !== lead.alternateMobileNormalized ||
      contact.emailNormalized !== lead.emailNormalized;
    let duplicate: { duplicateStatus: "SUSPECTED"; duplicateOfId: string } | null = null;
    let matches: DuplicateMatch[] = [];
    if (contactChanged && settings.duplicatePolicy !== "ALLOW") {
      matches = await findDuplicateLeads(tx, ctx, contact, leadId);
      if (matches.length && settings.duplicatePolicy === "BLOCK") {
        throw new ConflictError(
          `Another lead already has this ${matches[0]!.matchedOn.join(" and ")}: ${describeMatch(matches[0]!)}.`,
          { field: matches[0]!.matchedOn[0] === "email" ? "email" : "mobile" },
        );
      }
      if (matches.length && lead.duplicateStatus === "NONE") {
        duplicate = { duplicateStatus: "SUSPECTED", duplicateOfId: matches[0]!.id };
      }
    }

    const before = await historySnapshot(tx, lead);
    await tx.lead.update({
      where: { id: leadId },
      data: { ...leadData(values, contact, sourceId), ...(duplicate ?? {}) },
    });
    await tx.leadProjectInterest.deleteMany({ where: { leadId } });
    if (values.interests.length) {
      await tx.leadProjectInterest.createMany({
        data: values.interests.map((interest) => ({
          organizationId: ctx.organizationId,
          leadId,
          projectId: interest.projectId,
          level: interest.level,
        })),
      });
    }
    const after = await historySnapshot(
      tx,
      await tx.lead.findFirstOrThrow({ where: { id: leadId }, include: snapshotInclude }),
    );
    const changes = diffRecords(before, after);
    const changed = Object.keys(changes);
    if (changed.length === 0) return { changed };

    await recordLeadActivity(tx, ctx, {
      leadId,
      type: LEAD_ACTIVITY_TYPES.UPDATED,
      summary: `Updated ${changed.map((field) => FIELD_LABELS[field] ?? field).join(", ")}`,
      payload: { changes },
    });
    if (duplicate) {
      await recordLeadActivity(tx, ctx, {
        leadId,
        type: LEAD_ACTIVITY_TYPES.DUPLICATE_DETECTED,
        summary: `Possible duplicate of ${matches[0]!.number} (same ${matches[0]!.matchedOn.join(" and ")})`,
        payload: {
          matches: matches.map(({ id, number, matchedOn }) => ({ id, number, matchedOn })),
        },
      });
      await publishEvent(tx, ctx, "lead.duplicate_detected", {
        leadId,
        matchedLeadIds: matches.map((match) => match.id),
      });
    }
    await recordAudit(tx, ctx, {
      action: "lead.update",
      entityType: "Lead",
      entityId: leadId,
      summary: `Updated lead ${lead.number} (${changed.join(", ")})`,
      changes,
    });
    await publishEvent(tx, ctx, "lead.updated", { leadId, changedFields: changed });
    return { changed };
  });
}

export const FIELD_LABELS: Record<string, string> = {
  name: "name",
  mobile: "mobile",
  alternateMobile: "alternate mobile",
  email: "e-mail",
  city: "city",
  locality: "locality",
  address: "address",
  source: "source",
  campaign: "campaign",
  subSource: "source detail",
  budgetMin: "budget (from)",
  budgetMax: "budget (to)",
  propertyType: "property type",
  configurations: "configurations",
  preferredLocations: "preferred locations",
  purpose: "purpose",
  buyingTimeline: "buying timeline",
  requirementNotes: "requirement notes",
  temperature: "temperature",
  tags: "tags",
  projects: "projects of interest",
};

// --- Detail (M04-07) -----------------------------------------------------------------------------------------------

export async function getLead(ctx: ServiceContext, leadId: string) {
  const lead = await findVisibleLead(ctx, leadId, {
    include: {
      status: true,
      source: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
      propertyType: { select: { id: true, name: true } },
      owner: { select: { id: true, user: { select: { name: true } } } },
      createdBy: { select: { id: true, user: { select: { name: true } } } },
      duplicateOf: { select: { id: true, number: true, name: true, ownerId: true } },
      interests: {
        orderBy: { createdAt: "asc" },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              code: true,
              status: true,
              isActive: true,
              locality: true,
              city: true,
              priceMin: true,
              priceMax: true,
              builder: { select: { id: true, name: true } },
            },
          },
        },
      },
      _count: {
        select: {
          notes: { where: { deletedAt: null } },
          files: { where: { deletedAt: null } },
          duplicates: true,
        },
      },
    },
  });
  const configurations = lead.configurationTypeIds.length
    ? await ctx.db.configurationType.findMany({
        where: { id: { in: lead.configurationTypeIds } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      })
    : [];
  const duplicateOfVisible = lead.duplicateOf
    ? await isLeadInScope(ctx, lead.duplicateOf, LEAD_PERMISSIONS.view)
    : false;
  return {
    id: lead.id,
    number: lead.number,
    name: lead.name,
    mobile: lead.mobile,
    alternateMobile: lead.alternateMobile,
    email: lead.email,
    city: lead.city,
    locality: lead.locality,
    address: lead.address,
    channel: lead.channel,
    source: lead.source,
    campaign: lead.campaign,
    subSource: lead.subSource,
    status: {
      id: lead.status.id,
      key: lead.status.key,
      label: lead.status.label,
      color: lead.status.color,
      category: lead.status.category,
      isTerminal: lead.status.isTerminal,
    },
    owner: lead.owner ? { membershipId: lead.owner.id, name: lead.owner.user.name } : null,
    createdBy: lead.createdBy
      ? { membershipId: lead.createdBy.id, name: lead.createdBy.user.name }
      : null,
    budgetMin: lead.budgetMin?.toString() ?? null,
    budgetMax: lead.budgetMax?.toString() ?? null,
    propertyType: lead.propertyType,
    configurations,
    preferredLocations: lead.preferredLocations,
    purpose: lead.purpose,
    buyingTimeline: lead.buyingTimeline,
    requirementNotes: lead.requirementNotes,
    temperature: lead.temperature,
    tags: lead.tags,
    duplicateStatus: lead.duplicateStatus,
    duplicateOf: lead.duplicateOf
      ? {
          id: lead.duplicateOf.id,
          number: lead.duplicateOf.number,
          name: duplicateOfVisible ? lead.duplicateOf.name : null,
          visible: duplicateOfVisible,
        }
      : null,
    duplicatesCount: lead._count.duplicates,
    interests: lead.interests.map((interest) => ({
      projectId: interest.projectId,
      level: interest.level,
      project: {
        ...interest.project,
        priceMin: interest.project.priceMin?.toString() ?? null,
        priceMax: interest.project.priceMax?.toString() ?? null,
      },
    })),
    notesCount: lead._count.notes,
    filesCount: lead._count.files,
    statusChangedAt: lead.statusChangedAt.toISOString(),
    lastActivityAt: lead.lastActivityAt.toISOString(),
    nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    lastContactedAt: lead.lastContactedAt?.toISOString() ?? null,
    closedAt: lead.closedAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}
export type LeadDetail = Awaited<ReturnType<typeof getLead>>;

// --- List, search & views (M04-12 → M04-14) --------------------------------------------------------------------------

export const LEAD_VIEWS = ["my", "team", "all", "unassigned", "duplicates"] as const;
export type LeadView = (typeof LEAD_VIEWS)[number];

export interface LeadFilters {
  view?: LeadView | null;
  builderId?: string | null;
  projectId?: string | null;
  statusIds?: string[] | null;
  statusCategory?: string | null;
  sourceId?: string | null;
  campaignId?: string | null;
  /** Membership id, or "unassigned". */
  ownerId?: string | null;
  /** Leads owned by this manager's reporting tree. */
  teamOf?: string | null;
  temperature?: string | null;
  tag?: string | null;
  /** Leads created by one import (M04-18). */
  importBatchId?: string | null;
  /** Open leads without any activity for this many hours since they were assigned (M05 workload drill-down). */
  unworkedHours?: number | null;
  /** Only leads in an open category (open, in progress, booking). */
  openOnly?: boolean;
  created?: DateRange | null;
  updated?: DateRange | null;
  lastActivity?: DateRange | null;
  /** Values of filters contributed by other modules, by key (`lead.list.filter`). */
  extra?: Record<string, string> | null;
  timezone: string;
}

export const LEAD_SORTABLE_FIELDS = [
  "createdAt",
  "lastActivityAt",
  "name",
  "nextFollowUpAt",
  "number",
  "statusChangedAt",
] as const;

export interface LeadRow {
  id: string;
  number: string;
  name: string;
  mobile: string | null;
  email: string | null;
  location: string | null;
  status: { id: string; key: string; label: string; color: string; category: string };
  ownerName: string | null;
  sourceName: string | null;
  projects: string[];
  budgetMin: string | null;
  budgetMax: string | null;
  temperature: string | null;
  tags: string[];
  duplicateStatus: DuplicateStatus;
  lastActivityAt: string;
  /** Earliest open follow-up or callback and the last time the customer was reached (kept by M07). */
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
}

/** Builds the where-clause for lists and exports: scope ∧ view ∧ filters ∧ search. */
export async function buildLeadWhere(
  ctx: ServiceContext,
  query: Pick<TableQuery, "q">,
  filters: LeadFilters,
): Promise<Prisma.LeadWhereInput> {
  const and: Prisma.LeadWhereInput[] = [await leadScopeWhere(ctx)];

  switch (filters.view) {
    case "my":
      and.push({ ownerId: ctx.actor.membershipId ?? "00000000-0000-0000-0000-000000000000" });
      break;
    case "team":
      and.push({ ownerId: { in: await getTeamMembershipIds(ctx) } });
      break;
    case "unassigned":
      and.push({ ownerId: null });
      break;
    case "duplicates":
      and.push({ duplicateStatus: "SUSPECTED" });
      break;
  }
  if (filters.view !== "duplicates") and.push({ duplicateStatus: { not: "MERGED" } });

  const projectId = uuidOrNull(filters.projectId);
  if (projectId) and.push({ interests: { some: { projectId } } });
  const builderId = uuidOrNull(filters.builderId);
  if (builderId) and.push({ interests: { some: { project: { builderId } } } });
  const statusIds = (filters.statusIds ?? [])
    .map(uuidOrNull)
    .filter((id): id is string => Boolean(id));
  if (statusIds.length) and.push({ statusId: { in: statusIds } });
  if (
    filters.statusCategory &&
    ["OPEN", "ACTIVE", "BOOKING", "WON", "LOST", "INVALID"].includes(filters.statusCategory)
  ) {
    and.push({ status: { category: filters.statusCategory as "OPEN" } });
  }
  const sourceId = uuidOrNull(filters.sourceId);
  if (sourceId) and.push({ sourceId });
  const campaignId = uuidOrNull(filters.campaignId);
  if (campaignId) and.push({ campaignId });
  if (filters.ownerId === "unassigned") and.push({ ownerId: null });
  else if (uuidOrNull(filters.ownerId)) and.push({ ownerId: filters.ownerId });
  const teamOf = uuidOrNull(filters.teamOf);
  if (teamOf)
    and.push({
      ownerId: { in: await getSubtreeMembershipIds(ctx.db, ctx.organizationId, teamOf) },
    });
  if (filters.temperature && ["HOT", "WARM", "COLD"].includes(filters.temperature)) {
    and.push({ temperature: filters.temperature as "HOT" });
  }
  if (filters.tag) and.push({ tags: { has: filters.tag } });
  const importBatchId = uuidOrNull(filters.importBatchId);
  if (importBatchId) and.push({ importBatchId });
  if (filters.openOnly) and.push({ status: { category: { in: ["OPEN", "ACTIVE", "BOOKING"] } } });
  if (filters.unworkedHours && filters.unworkedHours > 0) {
    and.push({
      ownerId: { not: null },
      status: { category: { in: ["OPEN", "ACTIVE", "BOOKING"] } },
      ownerAssignedAt: { lt: new Date(Date.now() - filters.unworkedHours * 3600 * 1000) },
      lastActivityAt: { lte: ctx.db.lead.fields.ownerAssignedAt },
    });
  }
  if (filters.created) and.push({ createdAt: toUtcBounds(filters.created, filters.timezone) });
  if (filters.updated) and.push({ updatedAt: toUtcBounds(filters.updated, filters.timezone) });
  if (filters.lastActivity)
    and.push({ lastActivityAt: toUtcBounds(filters.lastActivity, filters.timezone) });
  if (filters.extra) {
    const now = new Date();
    for (const filter of leadListFilterExtensions()) {
      const value = filters.extra[filter.key];
      if (!value) continue;
      const where = await filter.where(value, { ctx, timezone: filters.timezone, now });
      if (where) and.push(where);
    }
  }

  const q = query.q?.trim();
  if (q) {
    const or: Prisma.LeadWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
      { emailNormalized: { contains: q.toLowerCase() } },
    ];
    const digits = mobileSearchDigits(q);
    if (digits) {
      or.push(
        { mobileNormalized: { contains: digits } },
        { alternateMobileNormalized: { contains: digits } },
      );
    }
    const number = leadNumberSearch(q);
    if (number) or.push({ number: { endsWith: number.padStart(6, "0") } });
    and.push({ OR: or });
  }
  return { AND: and };
}

export async function listLeads(
  ctx: ServiceContext,
  query: TableQuery,
  filters: LeadFilters,
): Promise<{ rows: LeadRow[]; total: number }> {
  const where = await buildLeadWhere(ctx, query, filters);
  const direction = query.sort?.direction ?? "desc";
  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    query.sort?.field === "name"
      ? [{ name: direction }]
      : query.sort?.field === "number"
        ? [{ number: direction }]
        : query.sort?.field === "lastActivityAt"
          ? [{ lastActivityAt: direction }]
          : query.sort?.field === "statusChangedAt"
            ? [{ statusChangedAt: direction }]
            : query.sort?.field === "nextFollowUpAt"
              ? [{ nextFollowUpAt: { sort: direction, nulls: "last" } }, { number: direction }]
              : [{ createdAt: direction }, { number: direction }];
  const [leads, total] = await Promise.all([
    ctx.db.lead.findMany({
      where,
      orderBy,
      skip: query.skip,
      take: query.take,
      include: {
        status: { select: { id: true, key: true, label: true, color: true, category: true } },
        owner: { select: { user: { select: { name: true } } } },
        source: { select: { name: true } },
        interests: {
          orderBy: { createdAt: "asc" },
          select: { project: { select: { name: true } } },
        },
      },
    }),
    ctx.db.lead.count({ where }),
  ]);
  return {
    total,
    rows: leads.map((lead) => ({
      id: lead.id,
      number: lead.number,
      name: lead.name,
      mobile: lead.mobile,
      email: lead.email,
      location: [lead.locality, lead.city].filter(Boolean).join(", ") || null,
      status: lead.status,
      ownerName: lead.owner?.user.name ?? null,
      sourceName: lead.source?.name ?? null,
      projects: lead.interests.map((interest) => interest.project.name),
      budgetMin: lead.budgetMin?.toString() ?? null,
      budgetMax: lead.budgetMax?.toString() ?? null,
      temperature: lead.temperature,
      tags: lead.tags,
      duplicateStatus: lead.duplicateStatus,
      lastActivityAt: lead.lastActivityAt.toISOString(),
      nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
      lastContactedAt: lead.lastContactedAt?.toISOString() ?? null,
      createdAt: lead.createdAt.toISOString(),
    })),
  };
}

/** Owners and managers the actor may filter by (their scope), plus the views available to them. */
export async function getLeadListOptions(ctx: ServiceContext) {
  const scope = await resolveDataScope(ctx, LEAD_PERMISSIONS.view);
  const ids = scope.scope === "ALL" ? undefined : scope.membershipIds;
  const [owners, managers] = await Promise.all([
    listMemberOptions(ctx, { ids, includeInactive: true }),
    scope.scope === "OWN"
      ? Promise.resolve([])
      : listMemberOptions(ctx, { ids, managersOnly: true }),
  ]);
  const views: LeadView[] =
    scope.scope === "ALL"
      ? ["all", "my", "team", "unassigned", "duplicates"]
      : scope.scope === "TEAM"
        ? ["team", "my", "unassigned", "duplicates"]
        : ["my"];
  const extraFilters = (
    await Promise.all(
      leadListFilterExtensions().map(async (filter) => ({
        key: filter.key,
        label: filter.label,
        options: await filter.options(ctx),
      })),
    )
  ).filter((filter) => filter.options.length > 0);
  return { owners, managers, views, scope: scope.scope, extraFilters };
}
export type LeadListOptions = Awaited<ReturnType<typeof getLeadListOptions>>;

// --- Delete ---------------------------------------------------------------------------------------------------------

/** Removes a junk/test lead from every list (soft delete, audited). Its number is never reused. */
export async function deleteLead(ctx: ServiceContext, leadId: string): Promise<void> {
  ctx.permissions.assert(LEAD_PERMISSIONS.delete);
  await ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, leadId, { db: tx });
    const references = await tx.lead.count({ where: { duplicateOfId: leadId, deletedAt: null } });
    if (references > 0) {
      throw new ConflictError(
        `${plural(references, "other lead")} ${references === 1 ? "is" : "are"} linked to ${lead.number} as duplicates. Resolve them first.`,
      );
    }
    await tx.lead.update({ where: { id: leadId }, data: { deletedAt: new Date() } });
    await recordLeadActivity(tx, ctx, {
      leadId,
      type: LEAD_ACTIVITY_TYPES.DELETED,
      summary: `Deleted lead ${lead.number}`,
      touch: false,
    });
    await recordAudit(tx, ctx, {
      action: "lead.delete",
      entityType: "Lead",
      entityId: leadId,
      summary: `Deleted lead ${lead.number} (${lead.name})`,
    });
  });
}

/** Guard for pages and other modules: throws NotFoundError when the lead is not visible to the actor. */
export async function assertLeadVisible(ctx: ServiceContext, leadId: string): Promise<void> {
  await findVisibleLead(ctx, leadId);
}
