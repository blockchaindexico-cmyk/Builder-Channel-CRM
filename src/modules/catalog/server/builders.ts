import type { Prisma } from "@/generated/prisma/client";
import type { TableQuery } from "@/lib/table-query";
import { recordAudit } from "@/platform/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import { countReferences, describeReferences } from "@/platform/registry/references";
import { softDeleteFile } from "@/platform/storage/files";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { CATALOG_PERMISSIONS } from "../permissions";
import {
  type BuilderContactInput,
  builderContactSchema,
  type BuilderInput,
  builderSchema,
  type BuilderValues,
} from "../schemas";
import { isCodeConflict, resolveCode } from "./codes";

export interface BuilderRow {
  id: string;
  code: string;
  name: string;
  city: string | null;
  isActive: boolean;
  activeProjects: number;
  totalProjects: number;
  primaryContact: { name: string; phone: string | null; email: string | null } | null;
  createdAt: string;
}

export type BuilderStatusFilter = "active" | "inactive" | "all";
export const BUILDER_SORTABLE_FIELDS = ["name", "code", "createdAt"] as const;

/** Builders list (M03-03): search, status filter and project counts. */
export async function listBuilders(
  ctx: ServiceContext,
  query: TableQuery,
  filters: { status?: BuilderStatusFilter | null } = {},
): Promise<{ rows: BuilderRow[]; total: number }> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.buildersView);
  const where: Prisma.BuilderWhereInput = {};
  const status = filters.status ?? "active";
  if (status !== "all") where.isActive = status === "active";
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { code: { contains: query.q, mode: "insensitive" } },
      { city: { contains: query.q, mode: "insensitive" } },
      { contacts: { some: { name: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  const direction = query.sort?.direction ?? "asc";
  const orderBy: Prisma.BuilderOrderByWithRelationInput[] =
    query.sort?.field === "code"
      ? [{ code: direction }]
      : query.sort?.field === "createdAt"
        ? [{ createdAt: direction }]
        : [{ name: direction }];

  const [builders, total] = await Promise.all([
    ctx.db.builder.findMany({
      where,
      orderBy,
      skip: query.skip,
      take: query.take,
      include: {
        contacts: {
          where: { isPrimary: true },
          take: 1,
          select: { name: true, phone: true, email: true },
        },
        projects: { select: { isActive: true } },
      },
    }),
    ctx.db.builder.count({ where }),
  ]);
  return {
    total,
    rows: builders.map((builder) => ({
      id: builder.id,
      code: builder.code,
      name: builder.name,
      city: builder.city,
      isActive: builder.isActive,
      activeProjects: builder.projects.filter((project) => project.isActive).length,
      totalProjects: builder.projects.length,
      primaryContact: builder.contacts[0] ?? null,
      createdAt: builder.createdAt.toISOString(),
    })),
  };
}

/** Builder choices for project forms and filters. */
export async function listBuilderOptions(
  ctx: ServiceContext,
  options: { includeInactive?: boolean } = {},
) {
  if (
    !ctx.permissions.hasAny([CATALOG_PERMISSIONS.projectsView, CATALOG_PERMISSIONS.buildersView])
  ) {
    ctx.permissions.assert(CATALOG_PERMISSIONS.projectsView);
  }
  return ctx.db.builder.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, isActive: true },
  });
}

export async function getBuilder(ctx: ServiceContext, builderId: string) {
  ctx.permissions.assert(CATALOG_PERMISSIONS.buildersView);
  const builder = await ctx.db.builder.findFirst({
    where: { id: builderId },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      _count: { select: { projects: true } },
    },
  });
  if (!builder) throw new NotFoundError("Builder", builderId);
  const activeProjects = await ctx.db.project.count({ where: { builderId, isActive: true } });
  return {
    id: builder.id,
    code: builder.code,
    name: builder.name,
    legalName: builder.legalName,
    website: builder.website,
    email: builder.email,
    phone: builder.phone,
    taxId: builder.taxId,
    addressLine: builder.addressLine,
    city: builder.city,
    state: builder.state,
    postalCode: builder.postalCode,
    description: builder.description,
    isActive: builder.isActive,
    deactivatedAt: builder.deactivatedAt?.toISOString() ?? null,
    createdAt: builder.createdAt.toISOString(),
    totalProjects: builder._count.projects,
    activeProjects,
    contacts: builder.contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      designation: contact.designation,
      phone: contact.phone,
      email: contact.email,
      isPrimary: contact.isPrimary,
      notes: contact.notes,
    })),
  };
}
export type BuilderDetail = Awaited<ReturnType<typeof getBuilder>>;

function builderData(values: BuilderValues) {
  return {
    name: values.name,
    legalName: values.legalName ?? null,
    website: values.website ?? null,
    email: values.email ?? null,
    phone: values.phone ?? null,
    taxId: values.taxId ?? null,
    addressLine: values.addressLine ?? null,
    city: values.city ?? null,
    state: values.state ?? null,
    postalCode: values.postalCode ?? null,
    description: values.description ?? null,
  };
}

function snapshot(builder: Record<string, unknown>) {
  const {
    code,
    name,
    legalName,
    website,
    email,
    phone,
    taxId,
    addressLine,
    city,
    state,
    postalCode,
    description,
  } = builder;
  return {
    code,
    name,
    legalName,
    website,
    email,
    phone,
    taxId,
    addressLine,
    city,
    state,
    postalCode,
    description,
  };
}

/** Adds a builder (M03-02) — no code change needed to work with a new developer (PRD §4). */
export async function createBuilder(
  ctx: ServiceContext,
  input: BuilderInput,
): Promise<{ id: string; code: string }> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.buildersManage);
  const values = parseInput(builderSchema, input);
  try {
    return await ctx.db.$transaction(async (tx) => {
      const duplicate = await tx.builder.findFirst({
        where: { name: { equals: values.name, mode: "insensitive" } },
        select: { code: true },
      });
      if (duplicate) {
        throw new ConflictError(
          `A builder named "${values.name}" already exists (${duplicate.code}).`,
          {
            field: "name",
          },
        );
      }
      const code = await resolveCode(tx, ctx, "builder", values.code);
      const builder = await tx.builder.create({
        data: {
          organizationId: ctx.organizationId,
          code,
          ...builderData(values),
          createdById: ctx.actor.type === "USER" ? ctx.actor.id : null,
        },
      });
      await recordAudit(tx, ctx, {
        action: "builder.create",
        entityType: "Builder",
        entityId: builder.id,
        summary: `Added builder ${builder.name} (${builder.code})`,
        before: {},
        after: snapshot(builder),
      });
      await publishEvent(tx, ctx, "builder.created", {
        builderId: builder.id,
        code,
        name: builder.name,
      });
      return { id: builder.id, code };
    });
  } catch (error) {
    if (isCodeConflict(error))
      throw new ValidationError("This code is already in use.", { code: ["Already in use"] });
    throw error;
  }
}

export async function updateBuilder(
  ctx: ServiceContext,
  builderId: string,
  input: BuilderInput,
): Promise<void> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.buildersManage);
  const values = parseInput(builderSchema, input);
  try {
    await ctx.db.$transaction(async (tx) => {
      const before = await tx.builder.findFirst({ where: { id: builderId } });
      if (!before) throw new NotFoundError("Builder", builderId);
      const duplicate = await tx.builder.findFirst({
        where: { id: { not: builderId }, name: { equals: values.name, mode: "insensitive" } },
        select: { code: true },
      });
      if (duplicate) {
        throw new ConflictError(
          `A builder named "${values.name}" already exists (${duplicate.code}).`,
          {
            field: "name",
          },
        );
      }
      const code = values.code
        ? await resolveCode(tx, ctx, "builder", values.code, builderId)
        : before.code;
      const after = await tx.builder.update({
        where: { id: builderId },
        data: { code, ...builderData(values) },
      });
      const beforeSnapshot = snapshot(before);
      const afterSnapshot = snapshot(after);
      const changedFields = Object.keys(afterSnapshot).filter(
        (key) =>
          beforeSnapshot[key as keyof typeof beforeSnapshot] !==
          afterSnapshot[key as keyof typeof afterSnapshot],
      );
      if (changedFields.length === 0) return;
      await recordAudit(tx, ctx, {
        action: "builder.update",
        entityType: "Builder",
        entityId: builderId,
        summary: `Updated builder ${after.name} (${changedFields.join(", ")})`,
        before: beforeSnapshot,
        after: afterSnapshot,
      });
      await publishEvent(tx, ctx, "builder.updated", { builderId, changedFields });
    });
  } catch (error) {
    if (isCodeConflict(error))
      throw new ValidationError("This code is already in use.", { code: ["Already in use"] });
    throw error;
  }
}

/** What a deactivation affects (M03-11): active projects now, leads once M04 registers its reference check. */
export async function getBuilderDeactivationImpact(ctx: ServiceContext, builderId: string) {
  ctx.permissions.assert(CATALOG_PERMISSIONS.buildersManage);
  const [activeProjects, references] = await Promise.all([
    ctx.db.project.count({ where: { builderId, isActive: true } }),
    countReferences(ctx, "Builder", builderId),
  ]);
  return { activeProjects, references };
}

/**
 * Activates or deactivates a builder (M03-02, M03-11). Deactivated builders are hidden from new projects and
 * leads but stay in history. `includeProjects` also deactivates their active projects.
 */
export async function setBuilderActive(
  ctx: ServiceContext,
  builderId: string,
  active: boolean,
  options: { includeProjects?: boolean } = {},
): Promise<{ projectsDeactivated: number }> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.buildersManage);
  return ctx.db.$transaction(async (tx) => {
    const builder = await tx.builder.findFirst({ where: { id: builderId } });
    if (!builder) throw new NotFoundError("Builder", builderId);
    if (builder.isActive === active) return { projectsDeactivated: 0 };
    await tx.builder.update({
      where: { id: builderId },
      data: { isActive: active, deactivatedAt: active ? null : new Date() },
    });

    let projectsDeactivated = 0;
    if (!active && options.includeProjects) {
      const projects = await tx.project.findMany({
        where: { builderId, isActive: true },
        select: { id: true, name: true },
      });
      if (projects.length > 0) {
        if (!ctx.permissions.has(CATALOG_PERMISSIONS.projectsManage)) {
          ctx.permissions.assert(CATALOG_PERMISSIONS.projectsManage);
        }
        await tx.project.updateMany({
          where: { id: { in: projects.map((project) => project.id) } },
          data: { isActive: false, deactivatedAt: new Date() },
        });
        for (const project of projects) {
          await recordAudit(tx, ctx, {
            action: "project.deactivate",
            entityType: "Project",
            entityId: project.id,
            summary: `Deactivated project ${project.name} together with its builder`,
            changes: { isActive: { from: true, to: false } },
          });
          await publishEvent(tx, ctx, "project.updated", {
            projectId: project.id,
            changedFields: ["isActive"],
          });
        }
        projectsDeactivated = projects.length;
      }
    }

    await recordAudit(tx, ctx, {
      action: active ? "builder.activate" : "builder.deactivate",
      entityType: "Builder",
      entityId: builderId,
      summary: `${active ? "Reactivated" : "Deactivated"} builder ${builder.name}${
        projectsDeactivated ? ` and ${projectsDeactivated} project(s)` : ""
      }`,
      changes: { isActive: { from: !active, to: active } },
      metadata: projectsDeactivated ? { projectsDeactivated } : undefined,
    });
    await publishEvent(tx, ctx, "builder.updated", { builderId, changedFields: ["isActive"] });
    return { projectsDeactivated };
  });
}

/** Deletes a builder that was added by mistake: only without projects or other references (M03-11). */
export async function deleteBuilder(ctx: ServiceContext, builderId: string): Promise<void> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.buildersManage);
  const references = await countReferences(ctx, "Builder", builderId);
  const fileIds = await ctx.db.$transaction(async (tx) => {
    const builder = await tx.builder.findFirst({
      where: { id: builderId },
      include: { _count: { select: { projects: true } }, files: { select: { fileId: true } } },
    });
    if (!builder) throw new NotFoundError("Builder", builderId);
    const all = builder._count.projects
      ? [{ label: "projects", count: builder._count.projects }, ...references]
      : references;
    if (all.length > 0) {
      throw new ConflictError(
        `${builder.name} has ${describeReferences(all)} and cannot be deleted. Deactivate the builder instead.`,
      );
    }
    await tx.builder.delete({ where: { id: builderId } });
    await recordAudit(tx, ctx, {
      action: "builder.delete",
      entityType: "Builder",
      entityId: builderId,
      summary: `Deleted builder ${builder.name} (${builder.code})`,
      before: snapshot(builder),
      after: null,
    });
    return builder.files.map((file) => file.fileId);
  });
  for (const fileId of fileIds) await softDeleteFile(ctx, fileId);
}

// --- Contacts (M03-04) --------------------------------------------------------------------------------------

async function touchBuilder(
  tx: Parameters<Parameters<ServiceContext["db"]["$transaction"]>[0]>[0],
  ctx: ServiceContext,
  builderId: string,
  summary: string,
  metadata?: Record<string, unknown>,
) {
  await recordAudit(tx, ctx, {
    action: "builder.contacts.update",
    entityType: "Builder",
    entityId: builderId,
    summary,
    metadata,
  });
  await publishEvent(tx, ctx, "builder.updated", { builderId, changedFields: ["contacts"] });
}

export async function addBuilderContact(
  ctx: ServiceContext,
  builderId: string,
  input: BuilderContactInput,
) {
  ctx.permissions.assert(CATALOG_PERMISSIONS.buildersManage);
  const values = parseInput(builderContactSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const builder = await tx.builder.findFirst({
      where: { id: builderId },
      select: { id: true, name: true },
    });
    if (!builder) throw new NotFoundError("Builder", builderId);
    const existing = await tx.builderContact.count({ where: { builderId } });
    const isPrimary = values.isPrimary || existing === 0;
    if (isPrimary)
      await tx.builderContact.updateMany({ where: { builderId }, data: { isPrimary: false } });
    const contact = await tx.builderContact.create({
      data: {
        organizationId: ctx.organizationId,
        builderId,
        name: values.name,
        designation: values.designation ?? null,
        phone: values.phone ?? null,
        email: values.email ?? null,
        notes: values.notes ?? null,
        isPrimary,
      },
    });
    await touchBuilder(tx, ctx, builderId, `Added contact ${contact.name} to ${builder.name}`, {
      contactId: contact.id,
    });
    return { id: contact.id };
  });
}

export async function updateBuilderContact(
  ctx: ServiceContext,
  contactId: string,
  input: BuilderContactInput,
) {
  ctx.permissions.assert(CATALOG_PERMISSIONS.buildersManage);
  const values = parseInput(builderContactSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const contact = await tx.builderContact.findFirst({
      where: { id: contactId },
      include: { builder: true },
    });
    if (!contact) throw new NotFoundError("Contact", contactId);
    if (values.isPrimary && !contact.isPrimary) {
      await tx.builderContact.updateMany({
        where: { builderId: contact.builderId },
        data: { isPrimary: false },
      });
    }
    // The primary contact stays primary until another one is chosen.
    const isPrimary = values.isPrimary || contact.isPrimary;
    const after = await tx.builderContact.update({
      where: { id: contactId },
      data: {
        name: values.name,
        designation: values.designation ?? null,
        phone: values.phone ?? null,
        email: values.email ?? null,
        notes: values.notes ?? null,
        isPrimary,
      },
    });
    await recordAudit(tx, ctx, {
      action: "builder.contacts.update",
      entityType: "Builder",
      entityId: contact.builderId,
      summary: `Updated contact ${after.name} of ${contact.builder.name}`,
      before: {
        name: contact.name,
        designation: contact.designation,
        phone: contact.phone,
        email: contact.email,
        isPrimary: contact.isPrimary,
      },
      after: {
        name: after.name,
        designation: after.designation,
        phone: after.phone,
        email: after.email,
        isPrimary: after.isPrimary,
      },
      metadata: { contactId },
    });
    await publishEvent(tx, ctx, "builder.updated", {
      builderId: contact.builderId,
      changedFields: ["contacts"],
    });
  });
}

export async function deleteBuilderContact(ctx: ServiceContext, contactId: string): Promise<void> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.buildersManage);
  await ctx.db.$transaction(async (tx) => {
    const contact = await tx.builderContact.findFirst({
      where: { id: contactId },
      include: { builder: true },
    });
    if (!contact) throw new NotFoundError("Contact", contactId);
    await tx.builderContact.delete({ where: { id: contactId } });
    if (contact.isPrimary) {
      // Promote the next contact so the builder keeps a primary contact.
      const next = await tx.builderContact.findFirst({
        where: { builderId: contact.builderId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (next)
        await tx.builderContact.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    await touchBuilder(
      tx,
      ctx,
      contact.builderId,
      `Removed contact ${contact.name} from ${contact.builder.name}`,
      {
        contactId,
      },
    );
  });
}
