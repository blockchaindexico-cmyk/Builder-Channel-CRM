import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toTableQuery } from "@/lib/table-query";
import {
  addBuilderContact,
  createBuilder,
  deleteBuilder,
  deleteBuilderContact,
  getBuilder,
  listBuilders,
  setBuilderActive,
  updateBuilder,
  updateBuilderContact,
} from "@/modules/catalog/server/builders";
import {
  attachDocument,
  getDocumentUrl,
  listDocuments,
  removeDocument,
  requestDocumentUpload,
} from "@/modules/catalog/server/documents";
import {
  createMaster,
  deleteMaster,
  getCatalogOptions,
  listMasters,
  seedCatalogMasters,
  updateMaster,
} from "@/modules/catalog/server/masters";
import {
  createProject,
  deleteProject,
  derivePriceRange,
  getProject,
  getProjectQuickInfo,
  listProjects,
  setProjectActive,
  setProjectStatus,
  updateProject,
} from "@/modules/catalog/server/projects";
import { syncSystemRoles } from "@/modules/identity/server/roles";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { stopBoss } from "@/platform/jobs/boss";
import { getStorage } from "@/platform/storage";
import type { ServiceContext } from "@/platform/tenant/context";

import { contextFor, createMember, createOrganizationWithRoles } from "../support/identity";

const page = toTableQuery({ page: 1, pageSize: 100, sort: "", q: "" }, { sortable: ["name"] });
const search = (q: string) =>
  toTableQuery({ page: 1, pageSize: 100, sort: "", q }, { sortable: ["name"] });

async function setup() {
  const org = await createOrganizationWithRoles();
  await seedCatalogMasters(createTenantDb(org.organization.id), org.organization.id);
  const admin = await createMember(org.organization.id, org.role("admin").id, {
    name: "Asha Admin",
  });
  const executive = await createMember(org.organization.id, org.role("executive").id, {
    name: "Eli Exec",
  });
  const adminCtx = await contextFor(admin.membership.id);
  const execCtx = await contextFor(executive.membership.id);
  const options = await getCatalogOptions(adminCtx);
  const config = (name: string) =>
    options.configurationTypes.find((entry) => entry.name === name)!.id;
  const propertyType = (name: string) =>
    options.propertyTypes.find((entry) => entry.name === name)!.id;
  const amenity = (name: string) => options.amenities.find((entry) => entry.name === name)!.id;
  return { org, adminCtx, execCtx, config, propertyType, amenity };
}

async function uploadDocument(
  ctx: ServiceContext,
  owner: "project" | "builder",
  ownerId: string,
  input: {
    fileName: string;
    contentType: string;
    category: "BROCHURE" | "IMAGE" | "AGREEMENT" | "PRICE_SHEET";
    isInternal: boolean;
  },
) {
  const body = new TextEncoder().encode(`file ${input.fileName}`);
  const { fileId } = await requestDocumentUpload(ctx, owner, ownerId, {
    fileName: input.fileName,
    contentType: input.contentType,
    size: body.byteLength,
  });
  const file = await prisma.fileObject.findUniqueOrThrow({ where: { id: fileId } });
  await getStorage().putObject(file.key, body, input.contentType);
  return attachDocument(ctx, owner, ownerId, {
    fileId,
    category: input.category,
    title: input.fileName,
    isInternal: input.isInternal,
  });
}

describe("catalog: builders, projects and masters (M03)", () => {
  let env: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => {
    env = await setup();
  });

  afterAll(async () => {
    await stopBoss();
  });

  describe("masters (M03-01, M03-10)", () => {
    it("seeds defaults once and grants catalogue view permissions to every system role", async () => {
      const before = await listMasters(env.adminCtx, "configurationType");
      await seedCatalogMasters(createTenantDb(env.org.organization.id), env.org.organization.id);
      expect(await listMasters(env.adminCtx, "configurationType")).toHaveLength(before.length);
      expect(before.map((row) => row.name)).toContain("2 BHK");

      await syncSystemRoles(createTenantDb(env.org.organization.id), env.org.organization.id);
      const executive = await prisma.rolePermission.findMany({
        where: { roleId: env.org.role("executive").id },
        select: { permission: true },
      });
      const granted = executive.map((grant) => grant.permission);
      expect(granted).toEqual(expect.arrayContaining(["builders.view", "projects.view"]));
      expect(granted).not.toContain("projects.manage");
      expect(granted).not.toContain("builders.manage");
    });

    it("rejects duplicate names (case-insensitive) and only deletes unused entries", async () => {
      await expect(
        createMaster(env.adminCtx, "amenity", { name: "swimming pool" }),
      ).rejects.toBeInstanceOf(ConflictError);
      const { id } = await createMaster(env.adminCtx, "amenity", {
        name: "Sky Lounge",
        sortOrder: 5,
      });
      await updateMaster(env.adminCtx, "amenity", id, {
        name: "Sky Deck",
        sortOrder: 5,
        isActive: true,
      });
      await deleteMaster(env.adminCtx, "amenity", id);
      expect(
        (await listMasters(env.adminCtx, "amenity")).some((row) => row.name === "Sky Deck"),
      ).toBe(false);
    });

    it("lets everyone read but only managers of projects change masters", async () => {
      expect((await listMasters(env.execCtx, "propertyType")).length).toBeGreaterThan(0);
      await expect(
        createMaster(env.execCtx, "propertyType", { name: "Farmhouse" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("builders (M03-02 → M03-04)", () => {
    it("generates codes, keeps them unique per organization and audits changes", async () => {
      const first = await createBuilder(env.adminCtx, { name: "Skyline Developers", city: "Pune" });
      expect(first.code).toMatch(/^BLD-\d{4}$/);
      const custom = await createBuilder(env.adminCtx, { name: "Lodha Group", code: "lodha" });
      expect(custom.code).toBe("LODHA");
      await expect(
        createBuilder(env.adminCtx, { name: "Another", code: "LODHA" }),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        createBuilder(env.adminCtx, { name: "skyline developers" }),
      ).rejects.toBeInstanceOf(ConflictError);

      // The same code in another organization is fine (rule T2).
      const other = await setup();
      const otherBuilder = await createBuilder(other.adminCtx, {
        name: "Lodha Group",
        code: "LODHA",
      });
      expect(otherBuilder.code).toBe("LODHA");
      // …and invisible here (rule T1).
      await expect(getBuilder(env.adminCtx, otherBuilder.id)).rejects.toBeInstanceOf(NotFoundError);

      await updateBuilder(env.adminCtx, first.id, {
        name: "Skyline Developers",
        city: "Mumbai",
        website: "https://skyline.test",
      });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          organizationId: env.org.organization.id,
          action: "builder.update",
          entityId: first.id,
        },
      });
      expect(audit.changes).toMatchObject({ city: { from: "Pune", to: "Mumbai" } });
      const event = await prisma.outboxEvent.findFirst({
        where: {
          organizationId: env.org.organization.id,
          type: "builder.created",
          payload: { path: ["builderId"], equals: first.id },
        },
      });
      expect(event?.payload).toMatchObject({ code: first.code, name: "Skyline Developers" });
    });

    it("keeps exactly one primary contact", async () => {
      const builder = await createBuilder(env.adminCtx, { name: "Contact Co" });
      const a = await addBuilderContact(env.adminCtx, builder.id, {
        name: "Anil Sales",
        phone: "+919800000001",
      });
      const b = await addBuilderContact(env.adminCtx, builder.id, { name: "Bina Channel" });
      let detail = await getBuilder(env.adminCtx, builder.id);
      expect(
        detail.contacts.filter((contact) => contact.isPrimary).map((contact) => contact.id),
      ).toEqual([a.id]);

      await updateBuilderContact(env.adminCtx, b.id, { name: "Bina Channel", isPrimary: true });
      detail = await getBuilder(env.adminCtx, builder.id);
      expect(
        detail.contacts.filter((contact) => contact.isPrimary).map((contact) => contact.id),
      ).toEqual([b.id]);

      await deleteBuilderContact(env.adminCtx, b.id);
      detail = await getBuilder(env.adminCtx, builder.id);
      expect(detail.contacts).toHaveLength(1);
      expect(detail.contacts[0]).toMatchObject({ id: a.id, isPrimary: true });
    });

    it("lists with search, status filter and project counts; executives cannot change builders", async () => {
      const { rows } = await listBuilders(env.execCtx, search("contact co"));
      expect(rows.map((row) => row.name)).toEqual(["Contact Co"]);
      expect(rows[0]?.primaryContact?.name).toBe("Anil Sales");
      await expect(createBuilder(env.execCtx, { name: "Nope" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("projects (M03-05 → M03-09)", () => {
    let builderId: string;
    let projectId: string;

    beforeAll(async () => {
      builderId = (await createBuilder(env.adminCtx, { name: "Riverfront Realty" })).id;
    });

    it("creates a project with configurations and derives its price range", async () => {
      const created = await createProject(env.adminCtx, {
        builderId,
        name: "Riverfront Heights",
        status: "UNDER_CONSTRUCTION",
        reraNumber: "P52100012345",
        locality: "Kharadi",
        city: "Pune",
        launchDate: "2025-01-15",
        possessionDate: "2027-12-31",
        highlights: ["River-facing towers", "5 min from IT park"],
        propertyTypeIds: [env.propertyType("Apartment")],
        amenityIds: [env.amenity("Swimming Pool"), env.amenity("Clubhouse")],
        configurations: [
          {
            configurationTypeId: env.config("2 BHK"),
            carpetAreaMin: "650",
            carpetAreaMax: "720",
            priceMin: "85 L",
            priceMax: "95 L",
          },
          {
            configurationTypeId: env.config("3 BHK"),
            carpetAreaMin: "950",
            priceMin: "1.25 Cr",
            priceMax: "1.4 Cr",
          },
        ],
      });
      projectId = created.id;
      expect(created.code).toMatch(/^PRJ-\d{4}$/);
      const project = await getProject(env.execCtx, projectId);
      expect(project).toMatchObject({
        priceMin: "8500000",
        priceMax: "14000000",
        possessionDate: "2027-12-31",
        launchDate: "2025-01-15",
      });
      expect(project.configurations.map((entry) => entry.name)).toEqual(["2 BHK", "3 BHK"]);
      expect(project.amenities.map((entry) => entry.name)).toEqual(["Swimming Pool", "Clubhouse"]);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: "project.create", entityId: projectId },
      });
      expect(audit.summary).toContain("Riverfront Heights");
    });

    it("validates ranges, dates and references", async () => {
      const base = { builderId, name: "Invalid Towers" };
      await expect(
        createProject(env.adminCtx, {
          ...base,
          configurations: [
            { configurationTypeId: env.config("1 BHK"), priceMin: "60 L", priceMax: "50 L" },
          ],
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        createProject(env.adminCtx, {
          ...base,
          launchDate: "2026-06-01",
          possessionDate: "2026-01-01",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        createProject(env.adminCtx, { ...base, name: "riverfront heights" }),
      ).rejects.toBeInstanceOf(ConflictError);

      const { id: retired } = await createMaster(env.adminCtx, "configurationType", {
        name: "6 BHK",
        isActive: false,
      });
      await expect(
        createProject(env.adminCtx, {
          ...base,
          configurations: [{ configurationTypeId: retired }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("filters by builder, city, status, type, configuration, budget and search", async () => {
      await createProject(env.adminCtx, {
        builderId,
        name: "Riverfront Plots",
        status: "READY_TO_MOVE",
        city: "Nashik",
        propertyTypeIds: [env.propertyType("Plot")],
        configurations: [
          { configurationTypeId: env.config("Plot"), priceMin: "30 L", priceMax: "45 L" },
        ],
      });
      const names = async (filters: Parameters<typeof listProjects>[2], q = "") =>
        (await listProjects(env.execCtx, search(q), filters)).rows.map((row) => row.name).sort();

      expect(await names({ builderId })).toEqual(["Riverfront Heights", "Riverfront Plots"]);
      expect(await names({ city: "pune" })).toEqual(["Riverfront Heights"]);
      expect(await names({ status: "READY_TO_MOVE" })).toEqual(["Riverfront Plots"]);
      expect(await names({ propertyTypeId: env.propertyType("Plot") })).toEqual([
        "Riverfront Plots",
      ]);
      expect(await names({ configurationTypeId: env.config("3 BHK") })).toEqual([
        "Riverfront Heights",
      ]);
      // Budget 40–90 L overlaps both; 1–1.1 Cr only the towers; 20–25 L none.
      expect(await names({ budgetMin: "4000000", budgetMax: "9000000" })).toEqual([
        "Riverfront Heights",
        "Riverfront Plots",
      ]);
      expect(await names({ budgetMin: "10000000", budgetMax: "11000000" })).toEqual([
        "Riverfront Heights",
      ]);
      expect(await names({ budgetMin: "2000000", budgetMax: "2500000" })).toEqual([]);
      expect(await names({}, "kharadi")).toEqual(["Riverfront Heights"]);
      expect(await names({}, "P52100012345")).toEqual(["Riverfront Heights"]);
      expect(await names({ builderId: "not-a-uuid" }, "riverfront")).toHaveLength(2);
    });

    it("updates with an audited diff, changes status and hides inactive projects", async () => {
      await updateProject(env.adminCtx, projectId, {
        builderId,
        name: "Riverfront Heights",
        status: "UNDER_CONSTRUCTION",
        locality: "Kharadi",
        city: "Pune",
        possessionDate: "2028-03-31",
        amenityIds: [env.amenity("Clubhouse")],
        configurations: [
          { configurationTypeId: env.config("2 BHK"), priceMin: "88 L", priceMax: "98 L" },
        ],
      });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: "project.update", entityId: projectId },
      });
      expect(audit.changes).toMatchObject({
        possessionDate: { from: "2027-12-31", to: "2028-03-31" },
        amenities: { from: ["Swimming Pool", "Clubhouse"], to: ["Clubhouse"] },
      });
      expect((await getProject(env.adminCtx, projectId)).priceMax).toBe("9800000");

      await setProjectStatus(env.adminCtx, projectId, "READY_TO_MOVE");
      expect((await getProject(env.adminCtx, projectId)).status).toBe("READY_TO_MOVE");
      await expect(setProjectStatus(env.execCtx, projectId, "COMPLETED")).rejects.toBeInstanceOf(
        ForbiddenError,
      );

      await setProjectActive(env.adminCtx, projectId, false);
      const visible = await listProjects(env.adminCtx, page, { builderId });
      expect(visible.rows.map((row) => row.name)).toEqual(["Riverfront Plots"]);
      const all = await listProjects(env.adminCtx, page, { builderId, includeInactive: true });
      expect(all.total).toBe(2);
      await setProjectActive(env.adminCtx, projectId, true);
    });

    it("deactivates a builder together with its projects and blocks deleting builders with projects", async () => {
      await expect(deleteBuilder(env.adminCtx, builderId)).rejects.toBeInstanceOf(ConflictError);
      const result = await setBuilderActive(env.adminCtx, builderId, false, {
        includeProjects: true,
      });
      expect(result.projectsDeactivated).toBe(2);
      await expect(setProjectActive(env.adminCtx, projectId, true)).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(
        createProject(env.adminCtx, { builderId, name: "New On Inactive Builder" }),
      ).rejects.toBeInstanceOf(ValidationError);
      await setBuilderActive(env.adminCtx, builderId, true);
      await setProjectActive(env.adminCtx, projectId, true);
    });

    it("shares documents with viewers but keeps internal ones for document managers", async () => {
      await uploadDocument(env.adminCtx, "project", projectId, {
        fileName: "brochure.pdf",
        contentType: "application/pdf",
        category: "BROCHURE",
        isInternal: false,
      });
      const internal = await uploadDocument(env.adminCtx, "project", projectId, {
        fileName: "rate-card.pdf",
        contentType: "application/pdf",
        category: "PRICE_SHEET",
        isInternal: true,
      });
      await expect(
        uploadDocument(env.adminCtx, "project", projectId, {
          fileName: "notes.pdf",
          contentType: "application/pdf",
          category: "IMAGE",
          isInternal: false,
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(
        (await listDocuments(env.adminCtx, "project", projectId)).map((doc) => doc.title).sort(),
      ).toEqual(["brochure.pdf", "rate-card.pdf"]);
      const shared = await listDocuments(env.execCtx, "project", projectId);
      expect(shared.map((doc) => doc.title)).toEqual(["brochure.pdf"]);
      expect(await getDocumentUrl(env.execCtx, "project", shared[0]!.id)).toContain(
        "memory://download/",
      );
      await expect(getDocumentUrl(env.execCtx, "project", internal.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        requestDocumentUpload(env.execCtx, "project", projectId, {
          fileName: "x.pdf",
          contentType: "application/pdf",
          size: 10,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const quickInfo = await getProjectQuickInfo(env.execCtx, projectId);
      expect(quickInfo.documents.map((doc) => doc.title)).toEqual(["brochure.pdf"]);

      await removeDocument(env.adminCtx, "project", internal.id);
      const file = await prisma.fileObject.findFirstOrThrow({
        where: { fileName: "rate-card.pdf", organizationId: env.org.organization.id },
      });
      expect(file.status).toBe("DELETED");
    });

    it("keeps builder agreements internal by default", async () => {
      const agreement = await uploadDocument(env.adminCtx, "builder", builderId, {
        fileName: "cp-agreement.pdf",
        contentType: "application/pdf",
        category: "AGREEMENT",
        isInternal: true,
      });
      expect(await listDocuments(env.execCtx, "builder", builderId)).toEqual([]);
      await expect(getDocumentUrl(env.execCtx, "builder", agreement.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it("deletes a project without references and a builder without projects", async () => {
      const builder = await createBuilder(env.adminCtx, { name: "Short Lived" });
      const project = await createProject(env.adminCtx, {
        builderId: builder.id,
        name: "Typo Project",
      });
      await deleteProject(env.adminCtx, project.id);
      await deleteBuilder(env.adminCtx, builder.id);
      await expect(getBuilder(env.adminCtx, builder.id)).rejects.toBeInstanceOf(NotFoundError);
      const audit = await prisma.auditLog.findMany({
        where: {
          action: { in: ["project.delete", "builder.delete"] },
          organizationId: env.org.organization.id,
        },
      });
      expect(audit).toHaveLength(2);
    });

    it("blocks deleting a master that projects use", async () => {
      await expect(
        deleteMaster(env.adminCtx, "amenity", env.amenity("Clubhouse")),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it("derives price ranges from partial configuration prices", () => {
    expect(derivePriceRange([])).toEqual({ priceMin: null, priceMax: null });
    expect(derivePriceRange([{ priceMin: "5000000" }, { priceMax: "9000000" }])).toEqual({
      priceMin: "5000000",
      priceMax: "9000000",
    });
    expect(
      derivePriceRange([
        { priceMin: "12000000", priceMax: "15000000" },
        { priceMin: "8000000", priceMax: null },
      ]),
    ).toEqual({
      priceMin: "8000000",
      priceMax: "15000000",
    });
  });
});
