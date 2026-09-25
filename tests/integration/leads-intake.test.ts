import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as intakePost } from "@/app/api/v1/leads/route";
import { createBuilder } from "@/modules/catalog/server/builders";
import { seedCatalogMasters } from "@/modules/catalog/server/masters";
import { createProject } from "@/modules/catalog/server/projects";
import { createApiKey, listApiKeys, revokeApiKey } from "@/modules/leads/server/api-keys";
import { exportLeads } from "@/modules/leads/server/export";
import {
  analyzeImportFile,
  getImportBatch,
  previewImport,
  requestImportUpload,
  runImportBatch,
  startImport,
} from "@/modules/leads/server/import/service";
import { readSheet } from "@/modules/leads/server/import/spreadsheet";
import { createLead } from "@/modules/leads/server/leads";
import { seedLeadMasters } from "@/modules/leads/server/masters";
import { updateLeadSettings } from "@/modules/leads/server/settings";
import { consumeRateLimit } from "@/platform/api/rate-limit";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { ConflictError, ForbiddenError } from "@/platform/errors";
import { stopBoss } from "@/platform/jobs/boss";
import { PermissionSet } from "@/platform/rbac/permissions";
import { getStorage } from "@/platform/storage";
import { createServiceContext, type ServiceContext } from "@/platform/tenant/context";

import { contextFor, createMember, createOrganizationWithRoles } from "../support/identity";

async function setup() {
  const org = await createOrganizationWithRoles();
  const orgId = org.organization.id;
  const db = createTenantDb(orgId);
  await seedCatalogMasters(db, orgId);
  await seedLeadMasters(db, orgId);
  const admin = await createMember(orgId, org.role("admin").id, { name: "Asha Admin" });
  const manager = await createMember(orgId, org.role("manager").id, {
    name: "Meera Manager",
    reportsToId: admin.membership.id,
  });
  const exec = await createMember(orgId, org.role("executive").id, {
    name: "Esha Exec",
    reportsToId: manager.membership.id,
  });
  const outsider = await createMember(orgId, org.role("executive").id, { name: "Olga Outside" });
  const ctx = {
    admin: await contextFor(admin.membership.id),
    manager: await contextFor(manager.membership.id),
    exec: await contextFor(exec.membership.id),
    outsider: await contextFor(outsider.membership.id),
  };
  const builder = await createBuilder(ctx.admin, { name: "Skyline" });
  const project = await createProject(ctx.admin, { builderId: builder.id, name: "Riverfront" });
  const projectCode = (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).code;
  return { orgId, ctx, members: { admin, manager, exec, outsider }, project, projectCode };
}

/** Uploads a file the way the browser does: presigned request, then the bytes go to storage. */
async function upload(ctx: ServiceContext, fileName: string, content: string | Uint8Array) {
  const body = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const { fileId } = await requestImportUpload(ctx, {
    fileName,
    contentType: fileName.endsWith(".csv")
      ? "text/csv"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: body.byteLength,
  });
  const file = await prisma.fileObject.findUniqueOrThrow({ where: { id: fileId } });
  await getStorage().putObject(file.key, body, file.contentType);
  return fileId;
}

function withPermissions(
  ctx: ServiceContext,
  grants: { permission: string; scope: "OWN" | "TEAM" | "ALL" | null }[],
) {
  return createServiceContext({
    organizationId: ctx.organizationId,
    actor: ctx.actor,
    permissions: PermissionSet.fromGrants(grants),
  });
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return intakePost(
    new Request("http://localhost:3000/api/v1/leads", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("lead import, export and intake API (M04-18 → M04-20)", () => {
  let env: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => {
    env = await setup();
  });

  afterAll(async () => {
    await stopBoss();
  });

  describe("import (M04-18)", () => {
    let csv: string;

    beforeAll(async () => {
      // An existing customer that row 6 repeats.
      await createLead(env.ctx.admin, { name: "Existing Customer", mobile: "9811100005" });
      const execEmail = (
        await prisma.user.findUniqueOrThrow({ where: { id: env.members.exec.user.id } })
      ).email;
      csv = [
        "Customer Name,Phone Number,Email ID,Lead Source,Budget,BHK,Project,Temperature,Assigned To",
        `Kiran Rao,+91 98111 00001,kiran@example.com,99acres,1.2 Cr,2 BHK,${env.projectCode},Hot,${execEmail}`,
        ",98111 00002,,,,,,,",
        "Bad Phone,12,,,,,,,",
        "Unknown Source,9811100004,,NotASource,,,,,",
        "Repeat Customer,098111-00005,,,,,,warm,",
        "Kiran Again,9811100001,,,,,,,",
      ].join("\n");
    });

    it("analyzes the file and suggests the column mapping", async () => {
      const fileId = await upload(env.ctx.admin, "portal-leads.csv", csv);
      const analyzed = await analyzeImportFile(env.ctx.admin, fileId);
      expect(analyzed.totalRows).toBe(6);
      expect(analyzed.suggestedMapping).toEqual({
        name: 0,
        mobile: 1,
        email: 2,
        source: 3,
        budgetMax: 4,
        configurations: 5,
        projects: 6,
        temperature: 7,
        owner: 8,
      });
    });

    it("previews, imports valid rows as the importer and reports the others", async () => {
      const fileId = await upload(env.ctx.admin, "portal-leads.csv", csv);
      const { suggestedMapping: mapping } = await analyzeImportFile(env.ctx.admin, fileId);
      const request = {
        fileId,
        mapping,
        options: { defaultSourceId: null, skipDuplicates: false },
      };

      const preview = await previewImport(env.ctx.admin, request);
      expect(preview).toMatchObject({
        totalRows: 6,
        validRows: 3,
        errorRows: 3,
        existingDuplicates: 1,
        fileDuplicates: 1,
      });
      expect(preview.problems.map((problem) => problem.row)).toEqual([3, 4, 5]);
      expect(preview.problems[1]!.errors).toEqual(["Mobile: Enter a valid mobile number"]);
      expect(preview.problems[2]!.errors[0]).toMatch(/Source: "NotASource" is not a lead source/);

      const { batchId } = await startImport(env.ctx.admin, request);
      await expect(startImport(env.ctx.admin, request)).rejects.toBeInstanceOf(ConflictError);
      await runImportBatch(env.orgId, batchId);

      const batch = await getImportBatch(env.ctx.admin, batchId);
      expect(batch).toMatchObject({
        status: "COMPLETED",
        totalRows: 6,
        processedRows: 6,
        importedRows: 3,
        duplicateRows: 2,
        errorRows: 3,
        skippedRows: 0,
        hasErrorFile: true,
      });

      const leads = await prisma.lead.findMany({
        where: { organizationId: env.orgId, importBatchId: batchId },
        orderBy: { number: "asc" },
        include: { source: true, interests: true },
      });
      expect(leads.map((lead) => lead.name)).toEqual([
        "Kiran Rao",
        "Repeat Customer",
        "Kiran Again",
      ]);
      const kiran = leads[0]!;
      expect(kiran).toMatchObject({
        channel: "IMPORT",
        ownerId: env.members.exec.membership.id,
        mobileNormalized: "+919811100001",
        temperature: "HOT",
      });
      expect(kiran.budgetMax?.toFixed(2)).toBe("12000000.00");
      expect(kiran.source?.code).toBe("99acres");
      expect(kiran.interests.map((interest) => interest.projectId)).toEqual([env.project.id]);
      expect(leads[1]!.duplicateStatus).toBe("SUSPECTED");
      expect(leads[2]!.duplicateOfId).toBe(kiran.id);

      const created = await prisma.leadActivity.findFirstOrThrow({
        where: { leadId: kiran.id, type: "CREATED" },
      });
      expect(created.summary).toMatch(/created from an import/);
      expect(created.actorName).toBe("Asha Admin");

      // The report holds the rows that were left out, with the reason first.
      const report = await prisma.fileObject.findFirstOrThrow({
        where: { organizationId: env.orgId, purpose: "lead.import-report" },
        orderBy: { createdAt: "desc" },
      });
      const sheet = await readSheet((await getStorage().getObject(report.key))!);
      expect(sheet.headers.slice(0, 3)).toEqual(["Row", "Reason", "Customer Name"]);
      expect(sheet.rows.map((row) => row[0])).toEqual(["3", "4", "5"]);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { organizationId: env.orgId, action: "lead.import", entityId: batchId },
      });
      expect(audit.summary).toMatch(/Imported 3 leads from portal-leads\.csv/);
      const event = await prisma.outboxEvent.findFirstOrThrow({
        where: { organizationId: env.orgId, type: "lead.import_completed" },
      });
      expect(event.payload).toMatchObject({ batchId, imported: 3, duplicates: 2, errors: 3 });

      // A second run (e.g. a retried job) changes nothing.
      await runImportBatch(env.orgId, batchId);
      expect(
        await prisma.lead.count({ where: { organizationId: env.orgId, importBatchId: batchId } }),
      ).toBe(3);
    });

    it("skips existing customers on request and resumes after the last processed row", async () => {
      const fileId = await upload(env.ctx.admin, "again.csv", csv);
      const { suggestedMapping: mapping } = await analyzeImportFile(env.ctx.admin, fileId);
      const { batchId } = await startImport(env.ctx.admin, {
        fileId,
        mapping,
        options: { defaultSourceId: null, skipDuplicates: true },
      });
      // Pretend a crashed job already handled the first two rows.
      await prisma.leadImportBatch.update({
        where: { id: batchId },
        data: { processedRows: 2, status: "PROCESSING" },
      });
      await runImportBatch(env.orgId, batchId);
      const batch = await getImportBatch(env.ctx.admin, batchId);
      expect(batch).toMatchObject({
        status: "COMPLETED",
        importedRows: 0,
        errorRows: 2,
        skippedRows: 2,
      });
      expect(batch.problems.filter((problem) => problem.skipped).map((p) => p.row)).toEqual([6, 7]);
      expect(batch.problems.find((problem) => problem.row === 6)?.message).toMatch(
        /Already exists as LD-/,
      );
    });

    it("stops when the importer is deactivated and refuses people without the permission", async () => {
      await expect(
        requestImportUpload(env.ctx.exec, { fileName: "x.csv", contentType: "text/csv", size: 10 }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const temp = await createMember(
        env.orgId,
        (await prisma.role.findFirstOrThrow({ where: { organizationId: env.orgId, key: "admin" } }))
          .id,
        { name: "Temp Admin" },
      );
      const tempCtx = await contextFor(temp.membership.id);
      const fileId = await upload(tempCtx, "temp.csv", "Name,Mobile\nTemp Lead,9811199999\n");
      const { batchId } = await startImport(tempCtx, {
        fileId,
        mapping: { name: 0, mobile: 1 },
        options: { defaultSourceId: null, skipDuplicates: false },
      });
      await prisma.membership.update({
        where: { id: temp.membership.id },
        data: { status: "INACTIVE" },
      });
      await runImportBatch(env.orgId, batchId);
      const batch = await getImportBatch(env.ctx.admin, batchId);
      expect(batch.status).toBe("FAILED");
      expect(batch.problems[0]?.message).toMatch(/no longer an active user/);
    });
  });

  describe("export (M04-19)", () => {
    it("exports what the person sees, within their scope, and audits it", async () => {
      await expect(exportLeads(env.ctx.exec, { format: "csv" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );

      const csv = await exportLeads(env.ctx.admin, { format: "csv", query: "q=Kiran" });
      expect(csv.contentType).toBe("text/csv");
      expect(csv.fileName).toMatch(/^leads-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/);
      const sheet = await readSheet(new TextEncoder().encode(csv.body as string));
      expect(sheet.headers.slice(0, 5)).toEqual([
        "Lead number",
        "Name",
        "Mobile",
        "Alternate mobile",
        "E-mail",
      ]);
      expect(sheet.rows.map((row) => row[1]).sort()).toEqual(["Kiran Again", "Kiran Rao"]);
      const kiran = sheet.rows.find((row) => row[1] === "Kiran Rao")!;
      expect(kiran[2]).toBe("+919811100001");
      expect(kiran[sheet.headers.indexOf("Budget up to")]).toBe("12000000");
      expect(kiran[sheet.headers.indexOf("Owner e-mail")]).toMatch(/@test\.local$/);
      expect(kiran[sheet.headers.indexOf("Projects of interest")]).toBe(env.projectCode);
      expect(kiran[sheet.headers.indexOf("Received via")]).toBe("Import");

      const xlsx = await exportLeads(env.ctx.admin, { format: "xlsx", query: "q=Kiran" });
      const workbook = await readSheet(xlsx.body as Uint8Array);
      expect(workbook.rows).toHaveLength(2);
      expect(
        workbook.rows.find((row) => row[1] === "Kiran Rao")![
          workbook.headers.indexOf("Budget up to")
        ],
      ).toBe("12000000");

      // A manager allowed to export gets only their team (and unassigned) leads, even for chosen ids.
      const managerExport = withPermissions(env.ctx.manager, [
        { permission: "leads.view", scope: "TEAM" },
        { permission: "leads.export", scope: null },
      ]);
      const outsiderLead = await createLead(env.ctx.outsider, {
        name: "Outside Lead",
        mobile: "9811177777",
      });
      const kiranLead = await prisma.lead.findFirstOrThrow({
        where: { organizationId: env.orgId, name: "Kiran Rao" },
      });
      const chosen = await exportLeads(managerExport, {
        format: "csv",
        ids: [kiranLead.id, outsiderLead.id],
      });
      expect(chosen.count).toBe(1);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { organizationId: env.orgId, action: "lead.export" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit.summary).toBe("Exported 1 lead (CSV)");
      expect(audit.metadata).toMatchObject({ count: 1, format: "csv", selected: 2 });
    });
  });

  describe("intake API (M04-20)", () => {
    let key: string;

    beforeAll(async () => {
      await expect(createApiKey(env.ctx.exec, { name: "Nope" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      key = (await createApiKey(env.ctx.admin, { name: "Website form" })).key;
    });

    it("stores only a hash and shows the prefix", async () => {
      const [row] = await listApiKeys(env.ctx.admin);
      expect(key).toMatch(/^crm_[0-9a-f]{8}_[A-Za-z0-9_-]{32}$/);
      expect(key.startsWith(`${row!.prefix}_`)).toBe(true);
      const stored = await prisma.apiKey.findFirstOrThrow({ where: { id: row!.id } });
      expect(stored.hashedKey).not.toContain(key.slice(13));
    });

    it("requires a valid key", async () => {
      const missing = await post({ name: "No Key", mobile: "9811200001" });
      expect(missing.status).toBe(401);
      expect(missing.headers.get("www-authenticate")).toBe("Bearer");
      const wrong = await post(
        { name: "Wrong Key", mobile: "9811200001" },
        { authorization: `Bearer ${key.slice(0, -4)}AAAA` },
      );
      expect(wrong.status).toBe(401);
      expect(await wrong.json()).toMatchObject({ error: { code: "unauthorized" } });
    });

    it("creates leads with codes and names resolved", async () => {
      const response = await post(
        {
          name: "Web Visitor",
          mobile: "+91 98112 00002",
          email: "visitor@example.com",
          sourceDetail: "Contact form",
          budgetMax: 9500000,
          configurations: ["2 BHK"],
          projects: [env.projectCode],
          temperature: "WARM",
          note: "Please call after 6 pm",
        },
        { authorization: `Bearer ${key}` },
      );
      expect(response.status).toBe(201);
      expect(response.headers.get("x-ratelimit-limit")).toBe("60");
      const { data } = (await response.json()) as { data: { id: string; number: string } };
      expect(data).toMatchObject({ number: expect.stringMatching(/^LD-\d{6}$/), status: "NEW" });
      const lead = await prisma.lead.findUniqueOrThrow({
        where: { id: data.id },
        include: { source: true, interests: true, notes: true },
      });
      expect(lead).toMatchObject({
        organizationId: env.orgId,
        channel: "API",
        ownerId: null,
        subSource: "Contact form",
        temperature: "WARM",
      });
      expect(lead.source?.code).toBe("api");
      expect(lead.budgetMax?.toFixed(2)).toBe("9500000.00");
      expect(lead.notes.map((note) => note.body)).toEqual(["Please call after 6 pm"]);
      const activity = await prisma.leadActivity.findFirstOrThrow({
        where: { leadId: lead.id, type: "CREATED" },
      });
      expect(activity.summary).toMatch(/created via the intake API/);
      expect(activity.actorType).toBe("API_KEY");
    });

    it("reports invalid fields per field", async () => {
      const response = await post(
        { mobile: "12", source: "nowhere", temperature: "boiling" },
        { authorization: `Bearer ${key}` },
      );
      expect(response.status).toBe(422);
      const body = (await response.json()) as { error: { fields: Record<string, string[]> } };
      expect(body.error).toMatchObject({ code: "validation_failed" });
      expect(Object.keys(body.error.fields)).toEqual(["name"]);

      const second = await post(
        { name: "Bad Values", mobile: "12", source: "nowhere", temperature: "boiling" },
        { authorization: `Bearer ${key}` },
      );
      const fields = ((await second.json()) as { error: { fields: Record<string, string[]> } })
        .error.fields;
      expect(fields).toMatchObject({
        mobile: ["Enter a valid mobile number"],
        source: ['"nowhere" is not a lead source'],
        temperature: ["use Hot, Warm, Cold"],
      });

      const unknown = await post(
        { name: "X Y", mobile: "9811200009", colour: "blue" },
        {
          authorization: `Bearer ${key}`,
        },
      );
      expect(unknown.status).toBe(422);
      const notJson = await post("{oops", { authorization: `Bearer ${key}` });
      expect(notJson.status).toBe(400);
    });

    it("replays retries with the same Idempotency-Key", async () => {
      const body = { name: "Retry Customer", mobile: "9811200003" };
      const headers = { authorization: `Bearer ${key}`, "idempotency-key": "form-42" };
      const first = await post(body, headers);
      const second = await post(body, headers);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.headers.get("idempotent-replayed")).toBe("true");
      expect(await second.json()).toEqual(await first.json());
      expect(
        await prisma.lead.count({ where: { organizationId: env.orgId, name: "Retry Customer" } }),
      ).toBe(1);

      const reused = await post({ ...body, name: "Someone Else" }, headers);
      expect(reused.status).toBe(422);
      expect(await reused.json()).toMatchObject({ error: { code: "idempotency_key_reused" } });
    });

    it("applies the duplicate policy", async () => {
      const flagged = await post(
        { name: "Retry Customer Twin", mobile: "09811200003" },
        { authorization: `Bearer ${key}` },
      );
      expect(flagged.status).toBe(201);
      expect(
        ((await flagged.json()) as { data: { duplicateOf: unknown } }).data.duplicateOf,
      ).toMatchObject({ number: expect.stringMatching(/^LD-/) });

      await updateLeadSettings(env.ctx.admin, { duplicatePolicy: "BLOCK" });
      const blocked = await post(
        { name: "Blocked Twin", mobile: "9811200003" },
        { authorization: `Bearer ${key}` },
      );
      expect(blocked.status).toBe(409);
      expect(await blocked.json()).toMatchObject({
        error: { code: "duplicate", duplicateOf: { number: expect.stringMatching(/^LD-/) } },
      });
      await updateLeadSettings(env.ctx.admin, { duplicatePolicy: "FLAG" });
    });

    it("rate-limits per key and refuses revoked keys", async () => {
      const bucket = `test:${Date.now()}`;
      expect((await consumeRateLimit(bucket, 2, 60)).allowed).toBe(true);
      expect((await consumeRateLimit(bucket, 2, 60)).remaining).toBe(0);
      const third = await consumeRateLimit(bucket, 2, 60);
      expect(third.allowed).toBe(false);
      expect(third.resetInSeconds).toBeGreaterThan(0);
      expect((await consumeRateLimit(`${bucket}:other`, 2, 60)).allowed).toBe(true);

      const [row] = await listApiKeys(env.ctx.admin);
      await revokeApiKey(env.ctx.admin, row!.id);
      const revoked = await post(
        { name: "After Revoke", mobile: "9811200004" },
        { authorization: `Bearer ${key}` },
      );
      expect(revoked.status).toBe(401);
      expect(
        await prisma.auditLog.count({
          where: {
            organizationId: env.orgId,
            action: { in: ["api_key.create", "api_key.revoke"] },
          },
        }),
      ).toBe(2);
    });
  });
});
