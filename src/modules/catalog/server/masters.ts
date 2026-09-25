import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError } from "@/platform/errors";
import { countReferences, describeReferences } from "@/platform/registry/references";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { CATALOG_PERMISSIONS } from "../permissions";
import {
  amenitySchema,
  configurationTypeSchema,
  type MasterKind,
  propertyTypeSchema,
} from "../schemas";

/** One row of a master list (M03-10). `extra` carries the kind-specific field. */
export interface MasterRow {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  /** Property category (property types) or bedrooms (configuration types). */
  category: string | null;
  bedrooms: string | null;
  /** Projects using the entry. */
  usage: number;
}

const ENTITY: Record<MasterKind, string> = {
  propertyType: "PropertyType",
  configurationType: "ConfigurationType",
  amenity: "Amenity",
};
const LABEL: Record<MasterKind, string> = {
  propertyType: "property type",
  configurationType: "configuration",
  amenity: "amenity",
};

const order = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

export async function listMasters(ctx: ServiceContext, kind: MasterKind): Promise<MasterRow[]> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsView);
  if (kind === "propertyType") {
    const rows = await ctx.db.propertyType.findMany({
      orderBy: order,
      include: { _count: { select: { projects: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      category: row.category,
      bedrooms: null,
      usage: row._count.projects,
    }));
  }
  if (kind === "configurationType") {
    const rows = await ctx.db.configurationType.findMany({
      orderBy: [{ sortOrder: "asc" }, { bedrooms: "asc" }, { name: "asc" }],
      include: { _count: { select: { configurations: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      category: null,
      bedrooms: row.bedrooms?.toString() ?? null,
      usage: row._count.configurations,
    }));
  }
  const rows = await ctx.db.amenity.findMany({
    orderBy: order,
    include: { _count: { select: { projects: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    category: null,
    bedrooms: null,
    usage: row._count.projects,
  }));
}

/** Active entries for forms and filters. */
export async function getCatalogOptions(ctx: ServiceContext) {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsView);
  const [propertyTypes, configurationTypes, amenities] = await Promise.all([
    ctx.db.propertyType.findMany({
      where: { isActive: true },
      orderBy: order,
      select: { id: true, name: true, category: true },
    }),
    ctx.db.configurationType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { bedrooms: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    ctx.db.amenity.findMany({
      where: { isActive: true },
      orderBy: order,
      select: { id: true, name: true },
    }),
  ]);
  return { propertyTypes, configurationTypes, amenities };
}
export type CatalogOptions = Awaited<ReturnType<typeof getCatalogOptions>>;

async function assertUniqueName(
  tx: TenantDbOrTx,
  kind: MasterKind,
  name: string,
  exceptId?: string,
): Promise<void> {
  const where = {
    name: { equals: name, mode: "insensitive" as const },
    ...(exceptId ? { id: { not: exceptId } } : {}),
  };
  const existing =
    kind === "propertyType"
      ? await tx.propertyType.findFirst({ where, select: { id: true } })
      : kind === "configurationType"
        ? await tx.configurationType.findFirst({ where, select: { id: true } })
        : await tx.amenity.findFirst({ where, select: { id: true } });
  if (existing) {
    throw new ConflictError(`A ${LABEL[kind]} named "${name}" already exists.`, { field: "name" });
  }
}

function parseMaster(kind: MasterKind, input: unknown) {
  if (kind === "propertyType")
    return { kind, values: parseInput(propertyTypeSchema, input) } as const;
  if (kind === "configurationType") {
    return { kind, values: parseInput(configurationTypeSchema, input) } as const;
  }
  return { kind, values: parseInput(amenitySchema, input) } as const;
}

export async function createMaster(
  ctx: ServiceContext,
  kind: MasterKind,
  input: unknown,
): Promise<{ id: string }> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsManage);
  const parsed = parseMaster(kind, input);
  return ctx.db.$transaction(async (tx) => {
    await assertUniqueName(tx, kind, parsed.values.name);
    const base = {
      organizationId: ctx.organizationId,
      name: parsed.values.name,
      sortOrder: parsed.values.sortOrder,
      isActive: parsed.values.isActive,
    };
    const created =
      parsed.kind === "propertyType"
        ? await tx.propertyType.create({ data: { ...base, category: parsed.values.category } })
        : parsed.kind === "configurationType"
          ? await tx.configurationType.create({
              data: { ...base, bedrooms: parsed.values.bedrooms ?? null },
            })
          : await tx.amenity.create({ data: base });
    await recordAudit(tx, ctx, {
      action: "catalog.master.create",
      entityType: ENTITY[kind],
      entityId: created.id,
      summary: `Added ${LABEL[kind]} "${created.name}"`,
    });
    return { id: created.id };
  });
}

export async function updateMaster(
  ctx: ServiceContext,
  kind: MasterKind,
  id: string,
  input: unknown,
): Promise<void> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsManage);
  const parsed = parseMaster(kind, input);
  await ctx.db.$transaction(async (tx) => {
    const before = await findMaster(tx, kind, id);
    await assertUniqueName(tx, kind, parsed.values.name, id);
    const base = {
      name: parsed.values.name,
      sortOrder: parsed.values.sortOrder,
      isActive: parsed.values.isActive,
    };
    const after =
      parsed.kind === "propertyType"
        ? await tx.propertyType.update({
            where: { id },
            data: { ...base, category: parsed.values.category },
          })
        : parsed.kind === "configurationType"
          ? await tx.configurationType.update({
              where: { id },
              data: { ...base, bedrooms: parsed.values.bedrooms ?? null },
            })
          : await tx.amenity.update({ where: { id }, data: base });
    await recordAudit(tx, ctx, {
      action: "catalog.master.update",
      entityType: ENTITY[kind],
      entityId: id,
      summary: `Updated ${LABEL[kind]} "${after.name}"`,
      before: snapshot(before),
      after: snapshot(after),
    });
  });
}

/** Deletes an unused entry; entries in use must be deactivated instead (M03-11). */
export async function deleteMaster(
  ctx: ServiceContext,
  kind: MasterKind,
  id: string,
): Promise<void> {
  ctx.permissions.assert(CATALOG_PERMISSIONS.projectsManage);
  const references = await countReferences(ctx, ENTITY[kind], id);
  await ctx.db.$transaction(async (tx) => {
    const entry = await findMaster(tx, kind, id);
    const usedByProjects =
      kind === "propertyType"
        ? await tx.projectPropertyType.count({ where: { propertyTypeId: id } })
        : kind === "configurationType"
          ? await tx.projectConfiguration.count({ where: { configurationTypeId: id } })
          : await tx.projectAmenity.count({ where: { amenityId: id } });
    const all =
      usedByProjects > 0
        ? [{ label: "projects", count: usedByProjects }, ...references]
        : references;
    if (all.length > 0) {
      throw new ConflictError(
        `"${entry.name}" is used by ${describeReferences(all)}. Deactivate it instead so it is no longer offered.`,
      );
    }
    if (kind === "propertyType") await tx.propertyType.delete({ where: { id } });
    else if (kind === "configurationType") await tx.configurationType.delete({ where: { id } });
    else await tx.amenity.delete({ where: { id } });
    await recordAudit(tx, ctx, {
      action: "catalog.master.delete",
      entityType: ENTITY[kind],
      entityId: id,
      summary: `Deleted ${LABEL[kind]} "${entry.name}"`,
      before: snapshot(entry),
      after: null,
    });
  });
}

async function findMaster(tx: TenantDbOrTx, kind: MasterKind, id: string) {
  const entry =
    kind === "propertyType"
      ? await tx.propertyType.findFirst({ where: { id } })
      : kind === "configurationType"
        ? await tx.configurationType.findFirst({ where: { id } })
        : await tx.amenity.findFirst({ where: { id } });
  if (!entry) throw new NotFoundError(ENTITY[kind], id);
  return entry;
}

function snapshot(
  entry: { name: string; sortOrder: number; isActive: boolean } & Record<string, unknown>,
) {
  return {
    name: entry.name,
    sortOrder: entry.sortOrder,
    isActive: entry.isActive,
    ...("category" in entry ? { category: entry.category } : {}),
    ...("bedrooms" in entry ? { bedrooms: entry.bedrooms?.toString() ?? null } : {}),
  };
}

// --- Defaults (M03-01) --------------------------------------------------------------------------------------

const DEFAULT_PROPERTY_TYPES: { name: string; category: "RESIDENTIAL" | "COMMERCIAL" | "LAND" }[] =
  [
    { name: "Apartment", category: "RESIDENTIAL" },
    { name: "Villa", category: "RESIDENTIAL" },
    { name: "Row House", category: "RESIDENTIAL" },
    { name: "Penthouse", category: "RESIDENTIAL" },
    { name: "Plot", category: "LAND" },
    { name: "Office Space", category: "COMMERCIAL" },
    { name: "Retail Shop", category: "COMMERCIAL" },
  ];

const DEFAULT_CONFIGURATIONS: { name: string; bedrooms: number | null }[] = [
  { name: "1 RK", bedrooms: 0.5 },
  { name: "1 BHK", bedrooms: 1 },
  { name: "1.5 BHK", bedrooms: 1.5 },
  { name: "2 BHK", bedrooms: 2 },
  { name: "2.5 BHK", bedrooms: 2.5 },
  { name: "3 BHK", bedrooms: 3 },
  { name: "3.5 BHK", bedrooms: 3.5 },
  { name: "4 BHK", bedrooms: 4 },
  { name: "5 BHK", bedrooms: 5 },
  { name: "Plot", bedrooms: null },
  { name: "Shop", bedrooms: null },
  { name: "Office", bedrooms: null },
];

const DEFAULT_AMENITIES = [
  "Swimming Pool",
  "Gymnasium",
  "Clubhouse",
  "Children's Play Area",
  "Landscaped Garden",
  "Jogging Track",
  "Indoor Games",
  "Multipurpose Hall",
  "24x7 Security",
  "CCTV Surveillance",
  "Power Backup",
  "Lifts",
  "Covered Parking",
  "EV Charging",
  "Rainwater Harvesting",
];

/**
 * Seeds default masters for an organization (M03-01). Each list is filled only while it is empty, so admin
 * deletions are not undone by later seed runs.
 */
export async function seedCatalogMasters(db: TenantDbOrTx, organizationId: string): Promise<void> {
  if ((await db.propertyType.count()) === 0) {
    await db.propertyType.createMany({
      data: DEFAULT_PROPERTY_TYPES.map((entry, index) => ({
        organizationId,
        ...entry,
        sortOrder: (index + 1) * 10,
      })),
      skipDuplicates: true,
    });
  }
  if ((await db.configurationType.count()) === 0) {
    await db.configurationType.createMany({
      data: DEFAULT_CONFIGURATIONS.map((entry, index) => ({
        organizationId,
        name: entry.name,
        bedrooms: entry.bedrooms,
        sortOrder: (index + 1) * 10,
      })) satisfies Prisma.ConfigurationTypeCreateManyInput[],
      skipDuplicates: true,
    });
  }
  if ((await db.amenity.count()) === 0) {
    await db.amenity.createMany({
      data: DEFAULT_AMENITIES.map((name, index) => ({
        organizationId,
        name,
        sortOrder: (index + 1) * 10,
      })),
      skipDuplicates: true,
    });
  }
}
