import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toTableQuery } from "@/lib/table-query";
import { createBuilder } from "@/modules/catalog/server/builders";
import { getCatalogOptions, seedCatalogMasters } from "@/modules/catalog/server/masters";
import { createProject, deleteProject } from "@/modules/catalog/server/projects";
import {
  dismissDuplicate,
  listDuplicateQueue,
  markAsDuplicate,
  mergeLeads,
} from "@/modules/leads/server/duplicates";
import {
  attachLeadFile,
  listLeadFiles,
  removeLeadFile,
  requestLeadAttachment,
} from "@/modules/leads/server/files";
import {
  checkDuplicates,
  createLead,
  deleteLead,
  getLead,
  type LeadFilters,
  listLeads,
  updateLead,
} from "@/modules/leads/server/leads";
import {
  createLeadStatus,
  deleteLeadSource,
  listLeadStatuses,
  saveCampaign,
  saveLeadSource,
  seedLeadMasters,
  updateLeadStatus,
} from "@/modules/leads/server/masters";
import {
  addLeadNote,
  deleteLeadNote,
  listLeadNotes,
  setLeadNotePinned,
  updateLeadNote,
} from "@/modules/leads/server/notes";
import { updateLeadSettings } from "@/modules/leads/server/settings";
import {
  bulkChangeLeadStatus,
  changeLeadStatus,
  setLeadStatusByKey,
} from "@/modules/leads/server/status";
import { listLeadTimeline } from "@/modules/leads/server/timeline";
import { deleteView, listSavedViews, saveView } from "@/modules/leads/server/views";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { stopBoss } from "@/platform/jobs/boss";
import { getStorage } from "@/platform/storage";

import { contextFor, createMember, createOrganizationWithRoles } from "../support/identity";

const page = toTableQuery({ page: 1, pageSize: 100, sort: "", q: "" }, { sortable: ["createdAt"] });
const search = (q: string) =>
  toTableQuery({ page: 1, pageSize: 100, sort: "", q }, { sortable: ["createdAt"] });
const noFilters: LeadFilters = { timezone: "Asia/Kolkata" };

async function setup() {
  const org = await createOrganizationWithRoles();
  const orgId = org.organization.id;
  const db = createTenantDb(orgId);
  await seedCatalogMasters(db, orgId);
  await seedLeadMasters(db, orgId);
  const { role } = org;
  const admin = await createMember(orgId, role("admin").id, { name: "Asha Admin" });
  const manager = await createMember(orgId, role("manager").id, {
    name: "Meera Manager",
    reportsToId: admin.membership.id,
  });
  const exec1 = await createMember(orgId, role("executive").id, {
    name: "Esha Exec",
    reportsToId: manager.membership.id,
  });
  const exec2 = await createMember(orgId, role("executive").id, {
    name: "Ravi Exec",
    reportsToId: manager.membership.id,
  });
  const otherManager = await createMember(orgId, role("manager").id, {
    name: "Omar Other",
    reportsToId: admin.membership.id,
  });
  const exec3 = await createMember(orgId, role("executive").id, {
    name: "Olga Exec",
    reportsToId: otherManager.membership.id,
  });
  const ctx = {
    admin: await contextFor(admin.membership.id),
    manager: await contextFor(manager.membership.id),
    exec1: await contextFor(exec1.membership.id),
    exec2: await contextFor(exec2.membership.id),
    otherManager: await contextFor(otherManager.membership.id),
    exec3: await contextFor(exec3.membership.id),
  };
  const builder = await createBuilder(ctx.admin, { name: "Skyline" });
  const project = await createProject(ctx.admin, {
    builderId: builder.id,
    name: "Skyline Riverfront",
  });
  const project2 = await createProject(ctx.admin, {
    builderId: builder.id,
    name: "Skyline Greens",
  });
  const options = await getCatalogOptions(ctx.admin);
  const statuses = await listLeadStatuses(ctx.admin);
  const status = (key: string) => statuses.find((entry) => entry.key === key)!.id;
  const sources = await prisma.leadSource.findMany({ where: { organizationId: orgId } });
  const source = (code: string) => sources.find((entry) => entry.code === code)!.id;
  return {
    orgId,
    members: { admin, manager, exec1, exec2, otherManager, exec3 },
    ctx,
    builder,
    project,
    project2,
    options,
    status,
    source,
  };
}

describe("leads (M04)", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  let execLead: Awaited<ReturnType<typeof createLead>>;
  let adminLead: Awaited<ReturnType<typeof createLead>>;
  let otherTeamLead: Awaited<ReturnType<typeof createLead>>;

  beforeAll(async () => {
    env = await setup();
  });

  afterAll(async () => {
    await stopBoss();
  });

  describe("create & ownership (M04-04 → M04-06)", () => {
    it("numbers leads per organization, normalizes contacts and records the timeline", async () => {
      execLead = await createLead(env.ctx.exec1, {
        name: "Priya Sharma",
        mobile: "098200 12345",
        email: "Priya.Sharma@Example.com",
        city: "Pune",
        sourceId: env.source("99acres"),
        budgetMin: "80 L",
        budgetMax: "1.1 Cr",
        configurationTypeIds: [
          env.options.configurationTypes.find((entry) => entry.name === "2 BHK")!.id,
        ],
        interests: [{ projectId: env.project.id, level: "HIGH" }],
        temperature: "HOT",
        tags: ["nri", "nri"],
        note: "Wants a river view",
      });
      expect(execLead.number).toMatch(/^LD-\d{6}$/);
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: execLead.id } });
      expect(lead).toMatchObject({
        mobileNormalized: "+919820012345",
        emailNormalized: "priya.sharma@example.com",
        ownerId: env.members.exec1.membership.id,
        channel: "MANUAL",
        tags: ["nri"],
      });
      expect(lead.budgetMin?.toString()).toBe("8000000");

      const timeline = await listLeadTimeline(env.ctx.exec1, execLead.id);
      // Executives own what they create (M05): the self-assignment moves the lead from New to Assigned.
      expect(timeline.entries.map((entry) => entry.type).sort()).toEqual([
        "ASSIGNED",
        "CREATED",
        "NOTE_ADDED",
        "STATUS_CHANGED",
      ]);
      expect(timeline.entries.every((entry) => entry.actorName === "Esha Exec")).toBe(true);
      const history = await prisma.leadStatusHistory.findMany({ where: { leadId: execLead.id } });
      expect(history).toHaveLength(2);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: "lead.create", entityId: execLead.id },
      });
      expect(audit.actorName).toBe("Esha Exec");
      const event = await prisma.outboxEvent.findFirstOrThrow({
        where: { type: "lead.created", payload: { path: ["leadId"], equals: execLead.id } },
      });
      expect(event.payload).toMatchObject({
        channel: "MANUAL",
        ownerId: env.members.exec1.membership.id,
      });

      adminLead = await createLead(env.ctx.admin, {
        name: "Karan Mehta",
        mobile: "+91 99870 11111",
        sourceId: env.source("walk-in"),
      });
      expect(
        (await prisma.lead.findUniqueOrThrow({ where: { id: adminLead.id } })).ownerId,
      ).toBeNull();
      otherTeamLead = await createLead(env.ctx.exec3, {
        name: "Olivia Nair",
        email: "olivia@example.com",
      });
    });

    it("requires a mobile or an e-mail and a valid budget range", async () => {
      await expect(createLead(env.ctx.exec1, { name: "No Contact" })).rejects.toBeInstanceOf(
        ValidationError,
      );
      await expect(
        createLead(env.ctx.exec1, {
          name: "Bad Budget",
          mobile: "9820000001",
          budgetMin: "1 Cr",
          budgetMax: "50 L",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("duplicates (M04-16, M04-17)", () => {
    it("flags duplicates by default, blocks or allows them per policy", async () => {
      const matches = await checkDuplicates(env.ctx.exec2, { mobile: "+91-98200-12345" });
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        number: execLead.number,
        matchedOn: ["mobile"],
        visible: false,
        name: null,
      });

      const flagged = await createLead(env.ctx.exec2, { name: "Priya S", mobile: "9820012345" });
      expect(flagged.duplicateStatus).toBe("SUSPECTED");
      expect(flagged.duplicateOf?.number).toBe(execLead.number);
      const timeline = await listLeadTimeline(env.ctx.exec2, flagged.id);
      expect(timeline.entries.map((entry) => entry.type)).toContain("DUPLICATE_DETECTED");

      await updateLeadSettings(env.ctx.admin, { duplicatePolicy: "BLOCK" });
      await expect(
        createLead(env.ctx.exec2, { name: "Priya again", email: "priya.sharma@example.com" }),
      ).rejects.toBeInstanceOf(ConflictError);
      await updateLeadSettings(env.ctx.admin, { duplicatePolicy: "ALLOW" });
      const allowed = await createLead(env.ctx.exec2, {
        name: "Priya allowed",
        email: "priya.sharma@example.com",
      });
      expect(allowed.duplicateStatus).toBe("NONE");
      await updateLeadSettings(env.ctx.admin, { duplicatePolicy: "FLAG" });

      const queue = await listDuplicateQueue(env.ctx.manager, page);
      expect(queue.rows.map((row) => row.lead.id)).toContain(flagged.id);

      await expect(dismissDuplicate(env.ctx.exec2, flagged.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await dismissDuplicate(env.ctx.admin, allowed.id).catch(() => undefined); // not suspected → conflict ignored
      await markAsDuplicate(env.ctx.admin, flagged.id, execLead.id);
      const confirmed = await getLead(env.ctx.admin, flagged.id);
      expect(confirmed).toMatchObject({ duplicateStatus: "CONFIRMED", status: { key: "INVALID" } });
    });

    it("merges a duplicate into the primary lead", async () => {
      const duplicate = await createLead(env.ctx.exec1, {
        name: "Priya Sharma (walk-in)",
        mobile: "9820012345",
        alternateMobile: "9765000001",
        interests: [{ projectId: env.project2.id }],
        note: "Came to the site office",
      });
      expect(duplicate.duplicateStatus).toBe("SUSPECTED");
      const result = await mergeLeads(env.ctx.admin, execLead.id, duplicate.id);
      expect(result.moved).toMatchObject({ notes: 1, interests: 1 });
      const primary = await getLead(env.ctx.admin, execLead.id);
      expect(primary.interests.map((interest) => interest.project.name).sort()).toEqual([
        "Skyline Greens",
        "Skyline Riverfront",
      ]);
      const merged = await getLead(env.ctx.admin, duplicate.id);
      expect(merged).toMatchObject({ duplicateStatus: "MERGED", status: { key: "INVALID" } });
      const defaultList = await listLeads(env.ctx.admin, page, noFilters);
      expect(defaultList.rows.some((row) => row.id === duplicate.id)).toBe(false);
      const notes = await listLeadNotes(env.ctx.admin, execLead.id);
      expect(notes.map((note) => note.body)).toContain("Came to the site office");
      const timeline = await listLeadTimeline(env.ctx.admin, execLead.id);
      expect(timeline.entries.map((entry) => entry.type)).toContain("MERGED");
    });
  });

  describe("data scope (M04-21)", () => {
    it("executives see their leads, managers their team and unassigned leads, admins everything", async () => {
      const ids = async (ctx: typeof env.ctx.admin, filters: LeadFilters = noFilters) =>
        (await listLeads(ctx, page, filters)).rows.map((row) => row.id);

      expect(await ids(env.ctx.exec1)).toContain(execLead.id);
      expect(await ids(env.ctx.exec1)).not.toContain(adminLead.id);
      expect(await ids(env.ctx.exec2)).not.toContain(execLead.id);
      const managerIds = await ids(env.ctx.manager);
      expect(managerIds).toEqual(expect.arrayContaining([execLead.id, adminLead.id]));
      expect(managerIds).not.toContain(otherTeamLead.id);
      expect(await ids(env.ctx.otherManager)).toContain(otherTeamLead.id);
      expect(await ids(env.ctx.otherManager)).not.toContain(execLead.id);
      expect(await ids(env.ctx.admin)).toEqual(
        expect.arrayContaining([execLead.id, adminLead.id, otherTeamLead.id]),
      );

      await expect(getLead(env.ctx.exec2, execLead.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        updateLead(env.ctx.exec3, execLead.id, { name: "Hijack", mobile: "9820012345" }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        addLeadNote(env.ctx.otherManager, execLead.id, { body: "nope" }),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(await ids(env.ctx.manager, { ...noFilters, view: "unassigned" })).toEqual([
        adminLead.id,
      ]);
      expect(await ids(env.ctx.exec1, { ...noFilters, view: "my" })).toContain(execLead.id);
      expect(
        await ids(env.ctx.admin, { ...noFilters, teamOf: env.members.otherManager.membership.id }),
      ).toEqual([otherTeamLead.id]);
    });
  });

  describe("search & filters (M04-12, M04-13)", () => {
    it("finds leads by phone in any format, e-mail, number and name", async () => {
      const found = async (q: string) =>
        (await listLeads(env.ctx.admin, search(q), noFilters)).rows.map((row) => row.id);
      expect(await found("+91 98200-12345")).toContain(execLead.id);
      expect(await found("98200 12345")).toContain(execLead.id);
      expect(await found("sharma@exam")).toContain(execLead.id);
      expect(await found("priya")).toContain(execLead.id);
      expect(await found(execLead.number)).toEqual([execLead.id]);
      expect(await found(String(Number(execLead.number.slice(3))))).toContain(execLead.id);
    });

    it("filters by source, project, builder, status category, temperature, tag and owner", async () => {
      const ids = async (filters: Partial<LeadFilters>) =>
        (await listLeads(env.ctx.admin, page, { ...noFilters, ...filters })).rows.map(
          (row) => row.id,
        );
      expect(await ids({ sourceId: env.source("99acres") })).toEqual([execLead.id]);
      expect(await ids({ projectId: env.project.id })).toContain(execLead.id);
      expect(await ids({ builderId: env.builder.id })).toContain(execLead.id);
      expect(await ids({ temperature: "HOT" })).toEqual([execLead.id]);
      expect(await ids({ tag: "nri" })).toEqual([execLead.id]);
      expect(await ids({ ownerId: "unassigned" })).toContain(adminLead.id);
      expect(await ids({ statusCategory: "INVALID" })).not.toContain(execLead.id);
      expect(await ids({ projectId: "not-a-uuid" })).toContain(execLead.id);
    });
  });

  describe("status changes (M04-08)", () => {
    it("validates reasons, workflow statuses and reopening", async () => {
      await changeLeadStatus(env.ctx.exec1, execLead.id, { statusId: env.status("POSITIVE") });
      await expect(
        changeLeadStatus(env.ctx.exec1, execLead.id, { statusId: env.status("POSITIVE") }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        changeLeadStatus(env.ctx.exec1, execLead.id, { statusId: env.status("BOOKING") }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        changeLeadStatus(env.ctx.exec1, execLead.id, { statusId: env.status("LOST") }),
      ).rejects.toBeInstanceOf(ValidationError);
      await changeLeadStatus(env.ctx.exec1, execLead.id, {
        statusId: env.status("LOST"),
        reason: "Bought elsewhere",
      });
      expect((await getLead(env.ctx.exec1, execLead.id)).closedAt).not.toBeNull();
      await expect(
        changeLeadStatus(env.ctx.exec1, execLead.id, { statusId: env.status("POSITIVE") }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      const reopened = await changeLeadStatus(env.ctx.manager, execLead.id, {
        statusId: env.status("FOLLOW_UP"),
      });
      expect(reopened.reopened).toBe(true);
      expect((await getLead(env.ctx.exec1, execLead.id)).closedAt).toBeNull();

      // Workflows set their statuses without the override permission (M05/M08).
      await prisma.$transaction(async () => {
        await createTenantDb(env.orgId).$transaction((tx) =>
          setLeadStatusByKey(tx, env.ctx.exec1, execLead.id, "VISIT"),
        );
      });
      expect((await getLead(env.ctx.exec1, execLead.id)).status.key).toBe("VISIT");

      const history = await prisma.leadStatusHistory.findMany({
        where: { leadId: execLead.id },
        orderBy: { changedAt: "asc" },
      });
      expect(history.map((row) => row.reason)).toContain("Bought elsewhere");
      const timeline = await listLeadTimeline(env.ctx.exec1, execLead.id, {
        types: ["STATUS_CHANGED"],
      });
      expect(timeline.entries[0]?.summary).toContain("→ Visit");
      expect(timeline.entries.some((entry) => entry.summary.startsWith("Reopened"))).toBe(true);
    });

    it("applies bulk status changes lead by lead", async () => {
      const result = await bulkChangeLeadStatus(
        env.ctx.exec1,
        [execLead.id, adminLead.id, otherTeamLead.id],
        {
          statusId: env.status("CONTACTED"),
        },
      );
      expect(result.changed).toBe(1);
      expect(result.skipped).toHaveLength(2);
    });
  });

  describe("update, notes & attachments (M04-06, M04-09, M04-10)", () => {
    it("records changed fields with previous values", async () => {
      await updateLead(env.ctx.exec1, execLead.id, {
        name: "Priya Sharma",
        mobile: "098200 12345",
        email: "Priya.Sharma@Example.com",
        sourceId: env.source("99acres"),
        city: "Mumbai",
        budgetMin: "80 L",
        budgetMax: "1.2 Cr",
        interests: [{ projectId: env.project.id, level: "MEDIUM" }],
      });
      const timeline = await listLeadTimeline(env.ctx.exec1, execLead.id, { types: ["UPDATED"] });
      const changes = timeline.entries[0]!.payload.changes as Record<
        string,
        { from: unknown; to: unknown }
      >;
      expect(changes.city).toEqual({ from: "Pune", to: "Mumbai" });
      expect(changes.budgetMax).toEqual({ from: "11000000", to: "12000000" });
      expect(changes.projects).toBeDefined();
      expect(changes.source).toBeUndefined();
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: "lead.update", entityId: execLead.id },
      });
      expect(audit.changes).toMatchObject({ city: { from: "Pune", to: "Mumbai" } });
    });

    it("lets authors edit their notes, keeps deleted notes and pins", async () => {
      const { id } = await addLeadNote(env.ctx.exec1, execLead.id, { body: "Call after 6 pm" });
      await expect(updateLeadNote(env.ctx.manager, id, { body: "changed" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await updateLeadNote(env.ctx.exec1, id, { body: "Call after 7 pm" });
      await setLeadNotePinned(env.ctx.manager, id, true);
      expect((await listLeadNotes(env.ctx.exec1, execLead.id))[0]).toMatchObject({
        id,
        isPinned: true,
        body: "Call after 7 pm",
      });
      await deleteLeadNote(env.ctx.exec1, id);
      expect((await listLeadNotes(env.ctx.exec1, execLead.id)).some((note) => note.id === id)).toBe(
        false,
      );
      expect(await prisma.leadNote.findUniqueOrThrow({ where: { id } })).toMatchObject({
        deletedAt: expect.any(Date),
      });
      const types = (await listLeadTimeline(env.ctx.exec1, execLead.id)).entries.map(
        (entry) => entry.type,
      );
      expect(types).toEqual(expect.arrayContaining(["NOTE_ADDED", "NOTE_UPDATED", "NOTE_DELETED"]));
    });

    it("attaches files only to leads in scope and soft-deletes them", async () => {
      const body = new TextEncoder().encode("pdf");
      const { fileId } = await requestLeadAttachment(env.ctx.exec1, execLead.id, {
        fileName: "kyc.pdf",
        contentType: "application/pdf",
        size: body.byteLength,
      });
      const file = await prisma.fileObject.findUniqueOrThrow({ where: { id: fileId } });
      await getStorage().putObject(file.key, body, "application/pdf");
      const { id } = await attachLeadFile(env.ctx.exec1, execLead.id, { fileId });
      expect((await listLeadFiles(env.ctx.manager, execLead.id)).map((row) => row.id)).toEqual([
        id,
      ]);
      await expect(listLeadFiles(env.ctx.exec3, execLead.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        requestLeadAttachment(env.ctx.exec2, execLead.id, {
          fileName: "x.pdf",
          contentType: "application/pdf",
          size: 3,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await removeLeadFile(env.ctx.exec1, id);
      expect(await listLeadFiles(env.ctx.exec1, execLead.id)).toEqual([]);
    });
  });

  describe("masters & references (M04-02, M04-03)", () => {
    it("protects system statuses and used masters", async () => {
      const statuses = await listLeadStatuses(env.ctx.admin);
      expect(statuses).toHaveLength(15);
      const lost = statuses.find((status) => status.key === "LOST")!;
      await updateLeadStatus(env.ctx.admin, lost.id, {
        label: "Lost deal",
        color: "#dc2626",
        category: "ACTIVE",
        isTerminal: false,
        requiresReason: true,
        isActive: true,
      });
      expect(
        (await listLeadStatuses(env.ctx.admin)).find((status) => status.key === "LOST"),
      ).toMatchObject({
        label: "Lost deal",
        category: "LOST",
        isTerminal: true,
      });
      const newStatus = statuses.find((status) => status.key === "NEW")!;
      await expect(
        updateLeadStatus(env.ctx.admin, newStatus.id, { ...newStatus, isActive: false }),
      ).rejects.toBeInstanceOf(ConflictError);
      const custom = await createLeadStatus(env.ctx.admin, {
        label: "Docs pending",
        color: "#0ea5e9",
        category: "BOOKING",
      });
      expect(await prisma.leadStatus.findUniqueOrThrow({ where: { id: custom.id } })).toMatchObject(
        {
          key: "CUSTOM_DOCS_PENDING",
          isSystem: false,
        },
      );

      await expect(
        saveLeadSource(env.ctx.admin, null, { name: "Portal X", code: "99acres", type: "PORTAL" }),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(deleteLeadSource(env.ctx.admin, env.source("99acres"))).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(
        saveCampaign(env.ctx.admin, null, {
          name: "Diwali",
          code: "diwali",
          startDate: "2026-11-10",
          endDate: "2026-10-01",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        saveLeadSource(env.ctx.exec1, null, { name: "X", code: "xx", type: "OTHER" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("keeps projects with leads from being deleted", async () => {
      await expect(deleteProject(env.ctx.admin, env.project.id)).rejects.toThrow(/lead/);
    });
  });

  describe("saved views & deletion (M04-14)", () => {
    it("shares views and deletes leads softly", async () => {
      const mine = await saveView(env.ctx.exec1, null, {
        name: "Hot NRI",
        query: "?temperature=HOT&tag=nri&evil=1",
      });
      const shared = await saveView(env.ctx.manager, null, {
        name: "Team hot",
        query: "temperature=HOT",
        isShared: true,
      });
      const visible = await listSavedViews(env.ctx.exec2);
      expect(visible.map((view) => view.id)).toContain(shared.id);
      expect(visible.map((view) => view.id)).not.toContain(mine.id);
      expect((await listSavedViews(env.ctx.exec1)).find((view) => view.id === mine.id)?.query).toBe(
        "temperature=HOT&tag=nri",
      );
      await expect(deleteView(env.ctx.exec1, shared.id)).rejects.toBeInstanceOf(ForbiddenError);

      await expect(deleteLead(env.ctx.manager, adminLead.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await deleteLead(env.ctx.admin, adminLead.id);
      await expect(getLead(env.ctx.admin, adminLead.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
