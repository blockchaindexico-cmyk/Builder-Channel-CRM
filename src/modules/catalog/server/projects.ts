import type { Prisma } from "@/generated/prisma/client";
import type { ProjectStatus } from "@/generated/prisma/enums";
import { compareDecimals } from "@/lib/decimal";
import { toCalendarDateString } from "@/lib/format";
import type { TableQuery } from "@/lib/table-query";
import { diffRecords, recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import { countReferences, describeReferences } from "@/platform/registry/references";
import { softDeleteFile } from "@/platform/storage/files";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput, uuidOrNull } from "@/platform/validation";

import { CATALOG_PERMISSIONS } from "../permissions";
import {
  PROJECT_STATUSES,
  type ProjectInput,
  projectSchema,
  type ProjectStatusValue,
  type ProjectValues,
} from "../schemas";
import { isCodeConflict, resolveCode } from "./codes";

// --- Listing (M03-06) ---------------------------------------------------------------------------------------

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  builderId: string;
  builderName: string;
  status: ProjectStatus;
  isActive: boolean;
  locality: string | null;
  city: string | null;
  possessionDate: string | null;
  priceMin: string | null;
  priceMax: string | null;
  configurations: string[];
  propertyTypes: string[];
}

export interface ProjectFilters {
  builderId?: string | null;
  city?: string | null;
  status?: ProjectStatusValue | null;
  propertyTypeId?: string | null;
  configurationTypeId?: string | null;
  /** Customer budget: projects whose price range overlaps [budgetMin, budgetMax]. Decimal strings. */
  budgetMin?: string | null;
  budgetMax?: string | null;
  includeInactive?: boolean;
}

export const PROJECT_SORTABLE_FIELDS = ["name", "possessionDate", "priceMin", "createdAt"] as const;

function projectWhere(
  query: Pick<TableQuery, "q">,
  filters: ProjectFilters,
): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = {};
  if (!filters.includeInactive) where.isActive = true;
  const builderId = uuidOrNull(filters.builderId);
  if (builderId) where.builderId = builderId;
  if (filters.city) where.city = { equals: filters.city, mode: "insensitive" };
  if (filters.status) where.status = filters.status;
  const propertyTypeId = uuidOrNull(filters.propertyTypeId);
  if (propertyTypeId) where.propertyTypes = { some: { propertyTypeId } };
  const configurationTypeId = uuidOrNull(filters.configurationTypeId);
  if (configurationTypeId) where.configurations = { some: { configurationTypeId } };
  if (filters.budgetMin) where.priceMax = { gte: filters.budgetMin };
  if (filters.budgetMax) where.priceMin = { lte: filters.budgetMax };
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { code: { contains: query.q, mode: "insensitive" } },
      { locality: { contains: query.q, mode: "insensitive" } },
      { city: { contains: query.q, mode: "insensitive" } },
      { reraNumber: { contains: query.q, mode: "insensitive" } },
      { builder: { name: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  return where;
}

export async function listProjects(
  ctx: ServiceContext,
  query: TableQuery,
  filters: ProjectFilters = {},
): Promise<{ rows: ProjectRow[]; total: number }> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsView);
  const where = projectWhere(query, filters);
  const direction = query.sort?.direction ?? "asc";
  const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
    query.sort?.field === "possessionDate"
      ? [{ possessionDate: { sort: direction, nulls: "last" } }, { name: "asc" }]
      : query.sort?.field === "priceMin"
        ? [{ priceMin: { sort: direction, nulls: "last" } }, { name: "asc" }]
        : query.sort?.field === "createdAt"
          ? [{ createdAt: direction }]
          : [{ name: direction }];

  const [projects, total] = await Promise.all([
    ctx.db.project.findMany({
      where,
      orderBy,
      skip: query.skip,
      take: query.take,
      include: {
        builder: { select: { name: true } },
        configurations: {
          select: { configurationType: { select: { name: true, sortOrder: true } } },
        },
        propertyTypes: { select: { propertyType: { select: { name: true, sortOrder: true } } } },
      },
    }),
    ctx.db.project.count({ where }),
  ]);
  return {
    total,
    rows: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      builderId: project.builderId,
      builderName: project.builder.name,
      status: project.status,
      isActive: project.isActive,
      locality: project.locality,
      city: project.city,
      possessionDate: toCalendarDateString(project.possessionDate),
      priceMin: project.priceMin?.toString() ?? null,
      priceMax: project.priceMax?.toString() ?? null,
      configurations: uniqueSorted(project.configurations.map((entry) => entry.configurationType)),
      propertyTypes: uniqueSorted(project.propertyTypes.map((entry) => entry.propertyType)),
    })),
  };
}

function uniqueSorted(entries: { name: string; sortOrder: number }[]): string[] {
  const byName = new Map(entries.map((entry) => [entry.name, entry.sortOrder]));
  return [...byName.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

/** Filter choices for the projects list: builders, cities in use and the masters. */
export async function getProjectFilterOptions(ctx: ServiceContext) {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsView);
  const [builders, cities] = await Promise.all([
    ctx.db.builder.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true },
    }),
    ctx.db.project.findMany({
      where: { city: { not: null } },
      distinct: ["city"],
      select: { city: true },
      orderBy: { city: "asc" },
    }),
  ]);
  return { builders, cities: cities.map((row) => row.city!).filter(Boolean) };
}

// --- Detail (M03-08) ----------------------------------------------------------------------------------------

const detailInclude = {
  builder: { select: { id: true, name: true, code: true, isActive: true } },
  configurations: {
    orderBy: [{ sortOrder: "asc" }],
    include: { configurationType: { select: { id: true, name: true, sortOrder: true } } },
  },
  amenities: { include: { amenity: { select: { id: true, name: true, sortOrder: true } } } },
  propertyTypes: {
    include: { propertyType: { select: { id: true, name: true, sortOrder: true } } },
  },
} satisfies Prisma.ProjectInclude;

type ProjectRecord = Prisma.ProjectGetPayload<{ include: typeof detailInclude }>;

function toDetail(project: ProjectRecord) {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    builder: project.builder,
    status: project.status,
    isActive: project.isActive,
    deactivatedAt: project.deactivatedAt?.toISOString() ?? null,
    reraNumber: project.reraNumber,
    addressLine: project.addressLine,
    locality: project.locality,
    city: project.city,
    state: project.state,
    postalCode: project.postalCode,
    mapUrl: project.mapUrl,
    launchDate: toCalendarDateString(project.launchDate),
    possessionDate: toCalendarDateString(project.possessionDate),
    possessionNote: project.possessionNote,
    priceMin: project.priceMin?.toString() ?? null,
    priceMax: project.priceMax?.toString() ?? null,
    totalTowers: project.totalTowers,
    totalUnits: project.totalUnits,
    projectArea: project.projectArea,
    description: project.description,
    highlights: project.highlights,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    configurations: project.configurations.map((configuration) => ({
      id: configuration.id,
      configurationTypeId: configuration.configurationTypeId,
      name: configuration.configurationType.name,
      carpetAreaMin: configuration.carpetAreaMin?.toString() ?? null,
      carpetAreaMax: configuration.carpetAreaMax?.toString() ?? null,
      priceMin: configuration.priceMin?.toString() ?? null,
      priceMax: configuration.priceMax?.toString() ?? null,
      notes: configuration.notes,
    })),
    amenities: project.amenities
      .map((entry) => entry.amenity)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ id, name })),
    propertyTypes: project.propertyTypes
      .map((entry) => entry.propertyType)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ id, name })),
  };
}
export type ProjectDetail = ReturnType<typeof toDetail>;

export async function getProject(ctx: ServiceContext, projectId: string): Promise<ProjectDetail> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsView);
  const project = await ctx.db.project.findFirst({
    where: { id: projectId },
    include: detailInclude,
  });
  if (!project) throw new NotFoundError("Project", projectId);
  return toDetail(project);
}

/**
 * Compact project summary for the quick-info drawer (M03-09) — reused on the lead page (M04) so executives
 * can answer questions during calls. Includes the shareable documents (not internal ones).
 */
export async function getProjectQuickInfo(ctx: ServiceContext, projectId: string) {
  const project = await getProject(ctx, projectId);
  const documents = await ctx.db.projectFile.findMany({
    where: { projectId, isInternal: false, category: { not: "IMAGE" }, file: { status: "READY" } },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    take: 12,
    select: { id: true, title: true, category: true },
  });
  return { ...project, documents };
}
export type ProjectQuickInfo = Awaited<ReturnType<typeof getProjectQuickInfo>>;

// --- Create / update (M03-05, M03-07) -----------------------------------------------------------------------

/** Lowest and highest configuration price (a single known bound counts for both ends). */
export function derivePriceRange(
  configurations: readonly { priceMin?: string | null; priceMax?: string | null }[],
): { priceMin: string | null; priceMax: string | null } {
  let low: string | null = null;
  let high: string | null = null;
  for (const configuration of configurations) {
    const min = configuration.priceMin ?? configuration.priceMax ?? null;
    const max = configuration.priceMax ?? configuration.priceMin ?? null;
    if (min && (low === null || compareDecimals(min, low) < 0)) low = min;
    if (max && (high === null || compareDecimals(max, high) > 0)) high = max;
  }
  return { priceMin: low, priceMax: high };
}

async function assertReferences(
  tx: TenantDbOrTx,
  values: ProjectValues,
  current?: {
    builderId: string;
    propertyTypeIds: string[];
    amenityIds: string[];
    configurationTypeIds: string[];
  },
) {
  const builder = await tx.builder.findFirst({
    where: { id: values.builderId },
    select: { id: true, isActive: true },
  });
  if (!builder)
    throw new ValidationError("Choose the builder.", { builderId: ["Unknown builder"] });
  if (!builder.isActive && current?.builderId !== values.builderId) {
    throw new ValidationError("This builder is inactive.", {
      builderId: ["Reactivate the builder or choose another one"],
    });
  }

  const check = async (
    ids: string[],
    existing: string[] | undefined,
    load: (ids: string[]) => Promise<{ id: string; isActive: boolean }[]>,
    field: string,
    label: string,
  ) => {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const found = await load(unique);
    const byId = new Map(found.map((row) => [row.id, row]));
    for (const id of unique) {
      const row = byId.get(id);
      // Entries already on the project may stay even if deactivated since; new ones must be active.
      if (!row || (!row.isActive && !existing?.includes(id))) {
        throw new ValidationError(`Choose an active ${label}.`, {
          [field]: [`Unknown or inactive ${label}`],
        });
      }
    }
  };
  await check(
    values.propertyTypeIds,
    current?.propertyTypeIds,
    (ids) =>
      tx.propertyType.findMany({
        where: { id: { in: ids } },
        select: { id: true, isActive: true },
      }),
    "propertyTypeIds",
    "property type",
  );
  await check(
    values.amenityIds,
    current?.amenityIds,
    (ids) =>
      tx.amenity.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true } }),
    "amenityIds",
    "amenity",
  );
  await check(
    values.configurations.map((configuration) => configuration.configurationTypeId),
    current?.configurationTypeIds,
    (ids) =>
      tx.configurationType.findMany({
        where: { id: { in: ids } },
        select: { id: true, isActive: true },
      }),
    "configurations",
    "configuration",
  );
}

function projectData(values: ProjectValues) {
  const range = derivePriceRange(values.configurations);
  return {
    builderId: values.builderId,
    name: values.name,
    status: values.status,
    reraNumber: values.reraNumber ?? null,
    addressLine: values.addressLine ?? null,
    locality: values.locality ?? null,
    city: values.city ?? null,
    state: values.state ?? null,
    postalCode: values.postalCode ?? null,
    mapUrl: values.mapUrl ?? null,
    launchDate: values.launchDate ? new Date(`${values.launchDate}T00:00:00.000Z`) : null,
    possessionDate: values.possessionDate
      ? new Date(`${values.possessionDate}T00:00:00.000Z`)
      : null,
    possessionNote: values.possessionNote ?? null,
    totalTowers: values.totalTowers ?? null,
    totalUnits: values.totalUnits ?? null,
    projectArea: values.projectArea ?? null,
    description: values.description ?? null,
    highlights: values.highlights,
    priceMin: range.priceMin,
    priceMax: range.priceMax,
  };
}

async function writeChildren(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  projectId: string,
  values: ProjectValues,
) {
  await tx.projectConfiguration.deleteMany({ where: { projectId } });
  await tx.projectAmenity.deleteMany({ where: { projectId } });
  await tx.projectPropertyType.deleteMany({ where: { projectId } });
  const organizationId = ctx.organizationId;
  if (values.configurations.length > 0) {
    await tx.projectConfiguration.createMany({
      data: values.configurations.map((configuration, index) => ({
        organizationId,
        projectId,
        configurationTypeId: configuration.configurationTypeId,
        carpetAreaMin: configuration.carpetAreaMin ?? null,
        carpetAreaMax: configuration.carpetAreaMax ?? null,
        priceMin: configuration.priceMin ?? null,
        priceMax: configuration.priceMax ?? null,
        notes: configuration.notes ?? null,
        sortOrder: index,
      })),
    });
  }
  if (values.amenityIds.length > 0) {
    await tx.projectAmenity.createMany({
      data: [...new Set(values.amenityIds)].map((amenityId) => ({
        organizationId,
        projectId,
        amenityId,
      })),
    });
  }
  if (values.propertyTypeIds.length > 0) {
    await tx.projectPropertyType.createMany({
      data: [...new Set(values.propertyTypeIds)].map((propertyTypeId) => ({
        organizationId,
        projectId,
        propertyTypeId,
      })),
    });
  }
}

/** Human-readable version of a project for the audit log (names instead of ids). */
function auditSnapshot(project: ProjectDetail) {
  return {
    code: project.code,
    name: project.name,
    builder: project.builder.name,
    status: project.status,
    reraNumber: project.reraNumber,
    addressLine: project.addressLine,
    locality: project.locality,
    city: project.city,
    state: project.state,
    postalCode: project.postalCode,
    mapUrl: project.mapUrl,
    launchDate: project.launchDate,
    possessionDate: project.possessionDate,
    possessionNote: project.possessionNote,
    totalTowers: project.totalTowers,
    totalUnits: project.totalUnits,
    projectArea: project.projectArea,
    description: project.description,
    highlights: project.highlights,
    propertyTypes: project.propertyTypes.map((entry) => entry.name),
    amenities: project.amenities.map((entry) => entry.name),
    configurations: project.configurations.map(
      (entry) =>
        `${entry.name}${entry.notes ? ` (${entry.notes})` : ""}: ${entry.carpetAreaMin ?? "?"}–${
          entry.carpetAreaMax ?? "?"
        } sq ft, ${entry.priceMin ?? "?"}–${entry.priceMax ?? "?"}`,
    ),
  };
}

export async function createProject(
  ctx: ServiceContext,
  input: ProjectInput,
): Promise<{ id: string; code: string }> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsManage);
  const values = parseInput(projectSchema, input);
  try {
    return await ctx.db.$transaction(async (tx) => {
      await assertReferences(tx, values);
      const duplicate = await tx.project.findFirst({
        where: { builderId: values.builderId, name: { equals: values.name, mode: "insensitive" } },
        select: { code: true },
      });
      if (duplicate) {
        throw new ConflictError(
          `This builder already has a project named "${values.name}" (${duplicate.code}).`,
          {
            field: "name",
          },
        );
      }
      const code = await resolveCode(tx, ctx, "project", values.code);
      const project = await tx.project.create({
        data: {
          organizationId: ctx.organizationId,
          code,
          ...projectData(values),
          createdById: ctx.actor.type === "USER" ? ctx.actor.id : null,
        },
      });
      await writeChildren(tx, ctx, project.id, values);
      const detail = toDetail(
        await tx.project.findFirstOrThrow({ where: { id: project.id }, include: detailInclude }),
      );
      await recordAudit(tx, ctx, {
        action: "project.create",
        entityType: "Project",
        entityId: project.id,
        summary: `Added project ${project.name} (${code}) by ${detail.builder.name}`,
        before: {},
        after: auditSnapshot(detail),
      });
      await publishEvent(tx, ctx, "project.created", {
        projectId: project.id,
        builderId: project.builderId,
        code,
        name: project.name,
      });
      return { id: project.id, code };
    });
  } catch (error) {
    if (isCodeConflict(error))
      throw new ValidationError("This code is already in use.", { code: ["Already in use"] });
    throw error;
  }
}

export async function updateProject(
  ctx: ServiceContext,
  projectId: string,
  input: ProjectInput,
): Promise<void> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsManage);
  const values = parseInput(projectSchema, input);
  try {
    await ctx.db.$transaction(async (tx) => {
      const record = await tx.project.findFirst({
        where: { id: projectId },
        include: detailInclude,
      });
      if (!record) throw new NotFoundError("Project", projectId);
      const before = toDetail(record);
      await assertReferences(tx, values, {
        builderId: record.builderId,
        propertyTypeIds: before.propertyTypes.map((entry) => entry.id),
        amenityIds: before.amenities.map((entry) => entry.id),
        configurationTypeIds: before.configurations.map((entry) => entry.configurationTypeId),
      });
      const duplicate = await tx.project.findFirst({
        where: {
          id: { not: projectId },
          builderId: values.builderId,
          name: { equals: values.name, mode: "insensitive" },
        },
        select: { code: true },
      });
      if (duplicate) {
        throw new ConflictError(
          `This builder already has a project named "${values.name}" (${duplicate.code}).`,
          {
            field: "name",
          },
        );
      }
      const code = values.code
        ? await resolveCode(tx, ctx, "project", values.code, projectId)
        : record.code;
      await tx.project.update({ where: { id: projectId }, data: { code, ...projectData(values) } });
      await writeChildren(tx, ctx, projectId, values);
      const after = toDetail(
        await tx.project.findFirstOrThrow({ where: { id: projectId }, include: detailInclude }),
      );

      const changes = diffRecords(auditSnapshot(before), auditSnapshot(after));
      const changedFields = Object.keys(changes);
      if (changedFields.length === 0) return;
      await recordAudit(tx, ctx, {
        action: "project.update",
        entityType: "Project",
        entityId: projectId,
        summary: `Updated project ${after.name} (${changedFields.join(", ")})`,
        changes,
      });
      await publishEvent(tx, ctx, "project.updated", { projectId, changedFields });
    });
  } catch (error) {
    if (isCodeConflict(error))
      throw new ValidationError("This code is already in use.", { code: ["Already in use"] });
    throw error;
  }
}

/** Lifecycle status (upcoming → … → completed), M03-05. */
export async function setProjectStatus(
  ctx: ServiceContext,
  projectId: string,
  status: ProjectStatusValue,
) {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsManage);
  await ctx.db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId },
      select: { name: true, status: true },
    });
    if (!project) throw new NotFoundError("Project", projectId);
    if (project.status === status) return;
    await tx.project.update({ where: { id: projectId }, data: { status } });
    const label = (value: string) =>
      PROJECT_STATUSES.find((entry) => entry.value === value)?.label ?? value;
    await recordAudit(tx, ctx, {
      action: "project.status_change",
      entityType: "Project",
      entityId: projectId,
      summary: `Changed the status of ${project.name} to ${label(status)}`,
      changes: { status: { from: project.status, to: status } },
    });
    await publishEvent(tx, ctx, "project.updated", { projectId, changedFields: ["status"] });
  });
}

/** What deactivating/deleting a project affects (M03-11); M04 adds leads through a reference check. */
export async function getProjectUsage(ctx: ServiceContext, projectId: string) {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsManage);
  return countReferences(ctx, "Project", projectId);
}

/** Inactive projects are hidden from new-lead forms but remain in history and reports. */
export async function setProjectActive(ctx: ServiceContext, projectId: string, active: boolean) {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsManage);
  await ctx.db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId },
      select: { name: true, isActive: true, builder: { select: { isActive: true, name: true } } },
    });
    if (!project) throw new NotFoundError("Project", projectId);
    if (project.isActive === active) return;
    if (active && !project.builder.isActive) {
      throw new ConflictError(`Reactivate the builder ${project.builder.name} first.`);
    }
    await tx.project.update({
      where: { id: projectId },
      data: { isActive: active, deactivatedAt: active ? null : new Date() },
    });
    await recordAudit(tx, ctx, {
      action: active ? "project.activate" : "project.deactivate",
      entityType: "Project",
      entityId: projectId,
      summary: `${active ? "Reactivated" : "Deactivated"} project ${project.name}`,
      changes: { isActive: { from: !active, to: active } },
    });
    await publishEvent(tx, ctx, "project.updated", { projectId, changedFields: ["isActive"] });
  });
}

/** Deletes a project added by mistake — only while nothing (e.g. leads) references it (M03-11). */
export async function deleteProject(
  ctx: ServiceContext,
  projectId: string,
): Promise<{ builderId: string }> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsManage);
  const references = await countReferences(ctx, "Project", projectId);
  const { builderId, fileIds } = await ctx.db.$transaction(async (tx) => {
    const record = await tx.project.findFirst({
      where: { id: projectId },
      include: { ...detailInclude, files: { select: { fileId: true } } },
    });
    if (!record) throw new NotFoundError("Project", projectId);
    if (references.length > 0) {
      throw new ConflictError(
        `${record.name} has ${describeReferences(references)} and cannot be deleted. Deactivate it instead.`,
      );
    }
    await tx.project.delete({ where: { id: projectId } });
    await recordAudit(tx, ctx, {
      action: "project.delete",
      entityType: "Project",
      entityId: projectId,
      summary: `Deleted project ${record.name} (${record.code})`,
      before: auditSnapshot(toDetail(record)),
      after: null,
    });
    return { builderId: record.builderId, fileIds: record.files.map((file) => file.fileId) };
  });
  for (const fileId of fileIds) await softDeleteFile(ctx, fileId);
  return { builderId };
}

/** Project choices for other modules' forms (lead interests…). Empty when the actor cannot view projects. */
export async function listProjectOptions(
  ctx: ServiceContext,
  options: { includeIds?: readonly string[] } = {},
): Promise<{ id: string; name: string; builderName: string; isActive: boolean }[]> {
  if (!ctx.permissions.has(CATALOG_PERMISSIONS.projectsView)) return [];
  const projects = await ctx.db.project.findMany({
    where: {
      OR: [
        { isActive: true },
        ...(options.includeIds?.length ? [{ id: { in: [...options.includeIds] } }] : []),
      ],
    },
    orderBy: [{ builder: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, isActive: true, builder: { select: { name: true } } },
  });
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    builderName: project.builder.name,
    isActive: project.isActive,
  }));
}
