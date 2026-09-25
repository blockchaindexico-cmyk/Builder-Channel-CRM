import type { FileObject, Prisma } from "@/generated/prisma/client";
import type { ImportStatus } from "@/generated/prisma/enums";
import { plural } from "@/lib/utils";
import { recordAudit } from "@/platform/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import { enqueueJob } from "@/platform/jobs/enqueue";
import type { Logger } from "@/platform/logger";
import { getStorage } from "@/platform/storage";
import {
  completeUpload,
  getFileDownloadUrl,
  requestUpload,
  storeServerFile,
} from "@/platform/storage/files";
import { createSystemContext, type ServiceContext } from "@/platform/tenant/context";
import { createMemberContext } from "@/platform/tenant/member-context";
import { parseInput } from "@/platform/validation";

import {
  IMPORT_FIELDS,
  type ImportMapping,
  type ImportOptions,
  suggestImportMapping,
} from "../../import-fields";
import { LEAD_PERMISSIONS } from "../../permissions";
import {
  type ImportRequestInput,
  importRequestSchema,
  LEAD_IMPORT_PURPOSE,
  LEAD_IMPORT_REPORT_PURPOSE,
  requestImportUploadSchema,
} from "../../schemas";
import { checkDuplicates, createLead } from "../leads";
import { normalizeEmail, normalizeMobile } from "../normalize";
import { loadLeadLookups, resolveLeadValues, rowValues } from "./resolve";
import { readSheet, type Sheet, writeCsv } from "./spreadsheet";

/**
 * Lead import (M04-18): upload a CSV/XLSX file → map its columns → check the rows → a background job creates the
 * leads as the person who started the import (their permissions and duplicate policy apply) → report with the rows
 * that were not imported, downloadable as a CSV to fix and import again.
 */
export const LEAD_IMPORT_JOB = "leads.import";

export interface ImportRowProblem {
  /** Row number as shown in a spreadsheet (the header is row 1). */
  row: number;
  message: string;
  /** Not an error: the row was skipped on purpose (e.g. the customer already exists). */
  skipped?: boolean;
}

// --- Upload & analysis --------------------------------------------------------------------------------------------

export async function requestImportUpload(
  ctx: ServiceContext,
  input: { fileName: string; contentType: string; size: number },
) {
  ctx.permissions.assert(LEAD_PERMISSIONS.import);
  const values = parseInput(requestImportUploadSchema, input);
  return requestUpload(ctx, { purpose: LEAD_IMPORT_PURPOSE, ...values });
}

async function loadImportFile(
  ctx: ServiceContext,
  fileId: string,
): Promise<{ file: FileObject; sheet: Sheet }> {
  let file = await ctx.db.fileObject.findFirst({
    where: { id: fileId, purpose: LEAD_IMPORT_PURPOSE, status: { in: ["PENDING", "READY"] } },
  });
  if (!file) throw new NotFoundError("Import file", fileId);
  if (file.status === "PENDING") file = await completeUpload(ctx, file.id);
  const bytes = await getStorage().getObject(file.key);
  if (!bytes) throw new ValidationError("The uploaded file is missing. Please upload it again.");
  return { file, sheet: await readSheet(bytes) };
}

export interface AnalyzedImportFile {
  fileId: string;
  fileName: string;
  headers: string[];
  /** First rows, to recognise the columns. */
  samples: string[][];
  totalRows: number;
  suggestedMapping: ImportMapping;
}

/** Reads the uploaded file and suggests a column for every lead field. */
export async function analyzeImportFile(
  ctx: ServiceContext,
  fileId: string,
): Promise<AnalyzedImportFile> {
  ctx.permissions.assert(LEAD_PERMISSIONS.import);
  const { file, sheet } = await loadImportFile(ctx, fileId);
  return {
    fileId: file.id,
    fileName: file.fileName,
    headers: sheet.headers,
    samples: sheet.rows.slice(0, 5),
    totalRows: sheet.rows.length,
    suggestedMapping: suggestImportMapping(sheet.headers),
  };
}

function checkMappingFits(mapping: ImportMapping, sheet: Sheet) {
  for (const [field, column] of Object.entries(mapping)) {
    if (column !== null && column !== undefined && column >= sheet.headers.length) {
      throw new ValidationError("The column mapping does not match the file.", {
        [field]: ["Unknown column"],
      });
    }
  }
}

// --- Preview ------------------------------------------------------------------------------------------------------

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: number;
  /** Valid rows whose mobile or e-mail belongs to an existing lead. */
  existingDuplicates: number;
  /** Valid rows repeating the mobile or e-mail of an earlier row of the file. */
  fileDuplicates: number;
  /** Rows with errors (first 100). */
  problems: { row: number; name: string; errors: string[] }[];
  /** First valid rows as they will be imported. */
  sample: { row: number; values: Record<string, string> }[];
}

/** Checks every row with the chosen mapping without importing anything. */
export async function previewImport(
  ctx: ServiceContext,
  input: ImportRequestInput,
): Promise<ImportPreview> {
  ctx.permissions.assert(LEAD_PERMISSIONS.import);
  const { fileId, mapping, options } = parseInput(importRequestSchema, input);
  const { sheet } = await loadImportFile(ctx, fileId);
  checkMappingFits(mapping, sheet);
  const lookups = await loadLeadLookups(ctx);

  const problems: ImportPreview["problems"] = [];
  const sample: ImportPreview["sample"] = [];
  const seen = new Set<string>();
  const contacts: { mobiles: string[]; emails: string[] }[] = [];
  let validRows = 0;
  let fileDuplicates = 0;
  sheet.rows.forEach((cells, index) => {
    const raw = rowValues(cells, mapping);
    const resolved = resolveLeadValues(raw, lookups, options);
    if (!resolved.ok) {
      if (problems.length < 100) {
        problems.push({ row: index + 2, name: raw.name ?? "", errors: resolved.errors });
      }
      return;
    }
    validRows += 1;
    const mobiles = [resolved.input.mobile, resolved.input.alternateMobile]
      .map((value) => normalizeMobile(value, lookups.country))
      .filter((value): value is string => Boolean(value));
    const emails = [normalizeEmail(resolved.input.email)].filter((value): value is string =>
      Boolean(value),
    );
    const keys = [...mobiles.map((value) => `m:${value}`), ...emails.map((value) => `e:${value}`)];
    if (keys.some((value) => seen.has(value))) fileDuplicates += 1;
    for (const value of keys) seen.add(value);
    contacts.push({ mobiles, emails });
    if (sample.length < 5) {
      const values: Record<string, string> = {};
      for (const field of IMPORT_FIELDS) {
        const value = raw[field.key]?.trim();
        if (value) values[field.label] = value;
      }
      sample.push({ row: index + 2, values });
    }
  });

  // Existing leads with the same numbers or e-mails (in chunks to keep queries small).
  const allMobiles = [...new Set(contacts.flatMap((contact) => contact.mobiles))];
  const allEmails = [...new Set(contacts.flatMap((contact) => contact.emails))];
  const existing = new Set<string>();
  for (let start = 0; start < Math.max(allMobiles.length, allEmails.length); start += 1000) {
    const mobiles = allMobiles.slice(start, start + 1000);
    const emails = allEmails.slice(start, start + 1000);
    const leads = await ctx.db.lead.findMany({
      where: {
        deletedAt: null,
        duplicateStatus: { in: ["NONE", "SUSPECTED", "DISMISSED"] },
        OR: [
          ...(mobiles.length
            ? [
                { mobileNormalized: { in: mobiles } },
                { alternateMobileNormalized: { in: mobiles } },
              ]
            : []),
          ...(emails.length ? [{ emailNormalized: { in: emails } }] : []),
        ],
      },
      select: { mobileNormalized: true, alternateMobileNormalized: true, emailNormalized: true },
    });
    for (const lead of leads) {
      if (lead.mobileNormalized) existing.add(`m:${lead.mobileNormalized}`);
      if (lead.alternateMobileNormalized) existing.add(`m:${lead.alternateMobileNormalized}`);
      if (lead.emailNormalized) existing.add(`e:${lead.emailNormalized}`);
    }
  }
  const existingDuplicates = contacts.filter(
    (contact) =>
      contact.mobiles.some((value) => existing.has(`m:${value}`)) ||
      contact.emails.some((value) => existing.has(`e:${value}`)),
  ).length;

  return {
    totalRows: sheet.rows.length,
    validRows,
    errorRows: sheet.rows.length - validRows,
    existingDuplicates,
    fileDuplicates,
    problems,
    sample,
  };
}

// --- Start --------------------------------------------------------------------------------------------------------

/** Queues the import; the job runs in the background (the page shows its progress). */
export async function startImport(
  ctx: ServiceContext,
  input: ImportRequestInput,
): Promise<{ batchId: string }> {
  ctx.permissions.assert(LEAD_PERMISSIONS.import);
  ctx.permissions.assert(LEAD_PERMISSIONS.create);
  const membershipId = ctx.actor.type === "USER" ? ctx.actor.membershipId : null;
  if (!membershipId) throw new ValidationError("Imports are started by a signed-in member.");
  const { fileId, mapping, options } = parseInput(importRequestSchema, input);
  const { file, sheet } = await loadImportFile(ctx, fileId);
  checkMappingFits(mapping, sheet);
  const running = await ctx.db.leadImportBatch.findFirst({
    where: { fileId: file.id, status: { in: ["QUEUED", "PROCESSING", "COMPLETED"] } },
    select: { id: true },
  });
  if (running) throw new ConflictError("This file has already been imported.");

  return ctx.db.$transaction(async (tx) => {
    const batch = await tx.leadImportBatch.create({
      data: {
        organizationId: ctx.organizationId,
        fileId: file.id,
        fileName: file.fileName,
        mapping: mapping as Prisma.InputJsonValue,
        options: options as unknown as Prisma.InputJsonValue,
        totalRows: sheet.rows.length,
        createdById: membershipId,
        createdByName: ctx.actor.name,
      },
    });
    await recordAudit(tx, ctx, {
      action: "lead.import.start",
      entityType: "LeadImportBatch",
      entityId: batch.id,
      summary: `Started importing ${plural(sheet.rows.length, "row")} from ${file.fileName}`,
      metadata: {
        fileId: file.id,
        mapping,
        skipDuplicates: options.skipDuplicates,
        defaultSourceId: options.defaultSourceId,
      },
    });
    await enqueueJob(
      LEAD_IMPORT_JOB,
      { organizationId: ctx.organizationId, batchId: batch.id },
      { tx, singletonKey: batch.id },
    );
    return { batchId: batch.id };
  });
}

// --- Background job -------------------------------------------------------------------------------------------------

async function recordProblem(
  ctx: ServiceContext,
  batchId: string,
  processedRows: number,
  problem: ImportRowProblem,
) {
  // Guarded by processed_rows so a retried job never counts a row twice.
  await ctx.db.$executeRaw`
    UPDATE "lead_import_batches"
    SET "processed_rows" = ${processedRows},
        "error_rows" = "error_rows" + ${problem.skipped ? 0 : 1},
        "skipped_rows" = "skipped_rows" + ${problem.skipped ? 1 : 0},
        "errors" = "errors" || ${JSON.stringify([problem])}::jsonb
    WHERE "id" = ${batchId}::uuid
      AND "organization_id" = ${ctx.organizationId}::uuid
      AND "processed_rows" < ${processedRows}`;
}

async function failBatch(
  ctx: ServiceContext,
  batch: { id: string; createdById: string; fileName: string },
  message: string,
) {
  const problem: ImportRowProblem = { row: 0, message };
  await ctx.db.$transaction(async (tx) => {
    // Rows handled before the failure stay in the report; the reason is added in front.
    await tx.$executeRaw`
      UPDATE "lead_import_batches"
      SET "status" = 'FAILED',
          "completed_at" = now(),
          "errors" = ${JSON.stringify([problem])}::jsonb || "errors"
      WHERE "id" = ${batch.id}::uuid AND "organization_id" = ${ctx.organizationId}::uuid`;
    await recordAudit(tx, ctx, {
      action: "lead.import.fail",
      entityType: "LeadImportBatch",
      entityId: batch.id,
      summary: `Import failed: ${message}`,
    });
    await publishEvent(tx, ctx, "lead.import_failed", {
      batchId: batch.id,
      createdById: batch.createdById,
      fileName: batch.fileName,
      message,
    });
  });
}

/** Processes one import batch (job handler). Resumes after the last processed row when retried. */
export async function runImportBatch(
  organizationId: string,
  batchId: string,
  logger?: Logger,
): Promise<void> {
  const system = createSystemContext(organizationId, { name: "Lead import" });
  const batch = await system.db.leadImportBatch.findFirst({ where: { id: batchId } });
  if (!batch || batch.status === "COMPLETED" || batch.status === "FAILED") return;

  const ctx = await createMemberContext(organizationId, batch.createdById);
  if (!ctx) {
    return failBatch(
      system,
      batch,
      `${batch.createdByName} is no longer an active user, so the import was stopped.`,
    );
  }
  if (
    !ctx.permissions.has(LEAD_PERMISSIONS.import) ||
    !ctx.permissions.has(LEAD_PERMISSIONS.create)
  ) {
    return failBatch(system, batch, `${batch.createdByName} may no longer import leads.`);
  }

  await ctx.db.leadImportBatch.update({
    where: { id: batch.id },
    data: { status: "PROCESSING", startedAt: batch.startedAt ?? new Date() },
  });

  let sheet: Sheet;
  try {
    const file = await ctx.db.fileObject.findFirst({ where: { id: batch.fileId } });
    const bytes = file ? await getStorage().getObject(file.key) : null;
    if (!bytes) throw new ValidationError("The uploaded file is missing.");
    sheet = await readSheet(bytes);
  } catch (error) {
    if (error instanceof ValidationError) return failBatch(ctx, batch, error.message);
    throw error;
  }

  const mapping = batch.mapping as ImportMapping;
  const options = batch.options as unknown as ImportOptions;
  const lookups = await loadLeadLookups(ctx);

  for (let index = batch.processedRows; index < sheet.rows.length; index += 1) {
    const row = index + 2;
    const processed = index + 1;
    const resolved = resolveLeadValues(rowValues(sheet.rows[index]!, mapping), lookups, options);
    if (!resolved.ok) {
      await recordProblem(ctx, batch.id, processed, { row, message: resolved.errors.join("; ") });
      continue;
    }
    if (options.skipDuplicates) {
      const matches = await checkDuplicates(ctx, resolved.input);
      if (matches.length) {
        await recordProblem(ctx, batch.id, processed, {
          row,
          message: `Already exists as ${matches[0]!.number}`,
          skipped: true,
        });
        continue;
      }
    }
    try {
      await createLead(ctx, resolved.input, {
        channel: "IMPORT",
        ownerId: resolved.ownerId,
        importBatchId: batch.id,
        origin: { importBatchId: batch.id, fileName: batch.fileName, row },
        onCreated: async (tx, lead) => {
          await tx.leadImportBatch.update({
            where: { id: batch.id },
            data: {
              processedRows: processed,
              importedRows: { increment: 1 },
              ...(lead.duplicateOf ? { duplicateRows: { increment: 1 } } : {}),
            },
          });
        },
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        const fields = Object.values(error.fieldErrors).flat();
        await recordProblem(ctx, batch.id, processed, {
          row,
          message: fields.length ? fields.join("; ") : error.message,
        });
      } else if (error instanceof ConflictError) {
        // Duplicate policy "block".
        await recordProblem(ctx, batch.id, processed, {
          row,
          message: error.message,
          skipped: true,
        });
      } else {
        throw error;
      }
    }
  }

  await finishBatch(ctx, batch.id, batch.fileName, sheet);
  logger?.info({ batchId: batch.id }, "lead import completed");
}

async function finishBatch(
  ctx: ServiceContext,
  batchId: string,
  fileName: string,
  sheet: Sheet,
): Promise<void> {
  const batch = await ctx.db.leadImportBatch.findFirstOrThrow({ where: { id: batchId } });
  const problems = (batch.errors as unknown as ImportRowProblem[]).filter(
    (problem) => problem.row > 0,
  );
  let errorFileId: string | null = batch.errorFileId;
  if (problems.length && !errorFileId) {
    const csv = writeCsv(
      ["Row", "Reason", ...sheet.headers],
      problems.map((problem) => [
        problem.row,
        problem.message,
        ...(sheet.rows[problem.row - 2] ?? []),
      ]),
    );
    const base = fileName.replace(/\.[^.]+$/, "");
    const report = await storeServerFile(ctx, {
      purpose: LEAD_IMPORT_REPORT_PURPOSE,
      fileName: `${base}-not-imported.csv`,
      contentType: "text/csv",
      body: csv,
    });
    errorFileId = report.id;
  }
  await ctx.db.$transaction(async (tx) => {
    await tx.leadImportBatch.update({
      where: { id: batchId },
      data: { status: "COMPLETED", completedAt: new Date(), errorFileId },
    });
    await recordAudit(tx, ctx, {
      action: "lead.import",
      entityType: "LeadImportBatch",
      entityId: batchId,
      summary: `Imported ${plural(batch.importedRows, "lead")} from ${fileName}${
        batch.duplicateRows ? ` (${batch.duplicateRows} flagged as possible duplicates)` : ""
      }; ${batch.skippedRows} skipped, ${batch.errorRows} with errors`,
      metadata: {
        totalRows: batch.totalRows,
        imported: batch.importedRows,
        duplicates: batch.duplicateRows,
        skipped: batch.skippedRows,
        errors: batch.errorRows,
      },
    });
    await publishEvent(tx, ctx, "lead.import_completed", {
      batchId,
      createdById: batch.createdById,
      fileName,
      imported: batch.importedRows,
      duplicates: batch.duplicateRows,
      skipped: batch.skippedRows,
      errors: batch.errorRows,
    });
  });
}

// --- History & report ---------------------------------------------------------------------------------------------

export interface ImportBatchRow {
  id: string;
  fileName: string;
  status: ImportStatus;
  totalRows: number;
  processedRows: number;
  importedRows: number;
  duplicateRows: number;
  skippedRows: number;
  errorRows: number;
  createdByName: string;
  createdAt: string;
  completedAt: string | null;
}

const batchSelect = {
  id: true,
  fileName: true,
  status: true,
  totalRows: true,
  processedRows: true,
  importedRows: true,
  duplicateRows: true,
  skippedRows: true,
  errorRows: true,
  createdByName: true,
  createdAt: true,
  completedAt: true,
} as const;

function toBatchRow(batch: Prisma.LeadImportBatchGetPayload<{ select: typeof batchSelect }>) {
  return {
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
  };
}

export async function listImportBatches(ctx: ServiceContext, take = 50): Promise<ImportBatchRow[]> {
  ctx.permissions.assert(LEAD_PERMISSIONS.import);
  const batches = await ctx.db.leadImportBatch.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: batchSelect,
  });
  return batches.map(toBatchRow);
}

export interface ImportBatchDetail extends ImportBatchRow {
  problems: ImportRowProblem[];
  hasErrorFile: boolean;
  options: ImportOptions;
  mappedFields: string[];
}

export async function getImportBatch(
  ctx: ServiceContext,
  batchId: string,
): Promise<ImportBatchDetail> {
  ctx.permissions.assert(LEAD_PERMISSIONS.import);
  const batch = await ctx.db.leadImportBatch.findFirst({
    where: { id: batchId },
    select: { ...batchSelect, errors: true, errorFileId: true, options: true, mapping: true },
  });
  if (!batch) throw new NotFoundError("Import", batchId);
  const mapping = batch.mapping as ImportMapping;
  return {
    ...toBatchRow(batch),
    problems: (batch.errors as unknown as ImportRowProblem[]).slice(0, 500),
    hasErrorFile: Boolean(batch.errorFileId),
    options: batch.options as unknown as ImportOptions,
    mappedFields: IMPORT_FIELDS.filter(
      (field) => mapping[field.key] !== null && mapping[field.key] !== undefined,
    ).map((field) => field.label),
  };
}

/** Download link for the original file or the "not imported" report. */
export async function getImportFileUrl(
  ctx: ServiceContext,
  batchId: string,
  which: "original" | "errors",
): Promise<string> {
  ctx.permissions.assert(LEAD_PERMISSIONS.import);
  const batch = await ctx.db.leadImportBatch.findFirst({
    where: { id: batchId },
    select: { fileId: true, errorFileId: true },
  });
  const fileId = which === "original" ? batch?.fileId : batch?.errorFileId;
  if (!fileId) throw new NotFoundError("File");
  return getFileDownloadUrl(ctx, fileId);
}
