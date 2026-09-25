import "./reports";

import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import type { Prisma } from "@/generated/prisma/client";
import { plural } from "@/lib/utils";
import { notify } from "@/modules/notifications";
import { getRegionalSettings } from "@/modules/organization";
import { recordAudit } from "@/platform/audit";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { CSV_TYPE, writeCsv, writeXlsx, XLSX_TYPE } from "@/platform/export/spreadsheet";
import { enqueueJob } from "@/platform/jobs/enqueue";
import type { Logger } from "@/platform/logger";
import { getStorage } from "@/platform/storage";
import { storeServerFile } from "@/platform/storage/files";
import type { ServiceContext } from "@/platform/tenant/context";
import { createMemberContext } from "@/platform/tenant/member-context";

import { ANALYTICS_JOBS } from "../constants";
import { ANALYTICS_PERMISSIONS } from "../permissions";
import { getReportDefinition, type ReportDefinition, type TabularReport } from "./catalog";
import type { ReportFilters } from "./metrics";

/**
 * Report exports (M10-18): CSV or XLSX of exactly what the report shows for the chosen filters. Summary reports are
 * built on request; row-level reports go to the worker and the requester is notified with a download link. Every
 * export is audited and kept in `report_exports`.
 */
export const REPORT_EXPORT_PURPOSE = "analytics.export";
export const REPORT_EXPORT_MAX_BYTES = 50 * 1024 * 1024;

export type ExportFormat = "csv" | "xlsx";

function definitionFor(ctx: ServiceContext, key: string): ReportDefinition {
  const definition = getReportDefinition(key);
  if (!definition?.table) throw new ValidationError("This report cannot be exported.");
  ctx.permissions.assert(ANALYTICS_PERMISSIONS.reportsView);
  ctx.permissions.assert(ANALYTICS_PERMISSIONS.reportsExport);
  if (definition.permission) ctx.permissions.assert(definition.permission);
  return definition;
}

async function render(report: TabularReport, fileType: ExportFormat) {
  const columns = report.columns.map(({ numeric: _numeric, ...column }) => column);
  return fileType === "csv"
    ? writeCsv(
        columns.map((column) => column.header),
        report.rows,
      )
    : await writeXlsx(report.title.slice(0, 31), columns, report.rows);
}

async function fileNameFor(ctx: ServiceContext, key: string, fileType: ExportFormat) {
  const { timezone } = await getRegionalSettings(ctx);
  return `${key}-${format(new TZDate(new Date(), timezone), "yyyy-MM-dd-HHmm")}.${fileType}`;
}

export type ExportRequestResult =
  | { kind: "file"; fileName: string; contentType: string; body: string | Uint8Array; rows: number }
  | { kind: "queued"; exportId: string };

/** Starts an export: small reports come back as a file, large ones are queued (M10-18). */
export async function requestReportExport(
  ctx: ServiceContext,
  input: { report: string; format: string; filters: ReportFilters & Record<string, unknown> },
): Promise<ExportRequestResult> {
  const definition = definitionFor(ctx, input.report);
  const fileType: ExportFormat = input.format === "xlsx" ? "xlsx" : "csv";
  if (!ctx.actor.membershipId) throw new ForbiddenError("Exports are made by members.");
  if (definition.large) {
    const record = await ctx.db.$transaction(async (tx) => {
      const created = await tx.reportExport.create({
        data: {
          organizationId: ctx.organizationId,
          requestedById: ctx.actor.membershipId!,
          report: definition.key,
          format: fileType,
          filters: input.filters as unknown as Prisma.InputJsonValue,
        },
      });
      await recordAudit(tx, ctx, {
        action: "analytics.export.request",
        entityType: "ReportExport",
        entityId: created.id,
        summary: `Requested the ${definition.title} export (${fileType.toUpperCase()})`,
        metadata: { filters: input.filters as unknown as Prisma.InputJsonValue },
      });
      await enqueueJob(
        ANALYTICS_JOBS.runExport,
        { organizationId: ctx.organizationId, exportId: created.id },
        { tx },
      );
      return created;
    });
    return { kind: "queued", exportId: record.id };
  }
  const report = await definition.table!(ctx, input.filters);
  const body = await render(report, fileType);
  const fileName = await fileNameFor(ctx, definition.key, fileType);
  await ctx.db.$transaction(async (tx) => {
    const created = await tx.reportExport.create({
      data: {
        organizationId: ctx.organizationId,
        requestedById: ctx.actor.membershipId!,
        report: definition.key,
        format: fileType,
        filters: input.filters as unknown as Prisma.InputJsonValue,
        status: "READY",
        rowCount: report.rows.length,
        completedAt: new Date(),
      },
    });
    await recordAudit(tx, ctx, {
      action: "analytics.export",
      entityType: "ReportExport",
      entityId: created.id,
      summary: `Exported ${definition.title} (${plural(report.rows.length, "row")}, ${fileType.toUpperCase()})`,
      metadata: { filters: input.filters as unknown as Prisma.InputJsonValue },
    });
  });
  return {
    kind: "file",
    fileName,
    contentType: fileType === "csv" ? CSV_TYPE : XLSX_TYPE,
    body,
    rows: report.rows.length,
  };
}

/** Worker side of a queued export: runs as the requester (their current permissions and scope). */
export async function runReportExport(organizationId: string, exportId: string, logger?: Logger) {
  const db = createTenantDb(organizationId);
  const record = await db.reportExport.findFirst({ where: { id: exportId } });
  if (!record || record.status === "READY") return;
  const ctx = await createMemberContext(organizationId, record.requestedById);
  if (!ctx) {
    await db.reportExport.update({
      where: { id: exportId },
      data: {
        status: "FAILED",
        error: "The member who asked for it is no longer active.",
        completedAt: new Date(),
      },
    });
    return;
  }
  await db.reportExport.update({ where: { id: exportId }, data: { status: "RUNNING" } });
  try {
    const definition = definitionFor(ctx, record.report);
    const filters = record.filters as unknown as ReportFilters & Record<string, unknown>;
    const report = await definition.table!(ctx, filters);
    const fileType = record.format === "xlsx" ? "xlsx" : "csv";
    const body = await render(report, fileType);
    const file = await storeServerFile(ctx, {
      purpose: REPORT_EXPORT_PURPOSE,
      fileName: await fileNameFor(ctx, definition.key, fileType),
      contentType: fileType === "csv" ? CSV_TYPE : XLSX_TYPE,
      body,
    });
    await db.reportExport.update({
      where: { id: exportId },
      data: {
        status: "READY",
        fileId: file.id,
        rowCount: report.rows.length,
        completedAt: new Date(),
      },
    });
    await notify(ctx, {
      type: "report.export_ready",
      recipientIds: [record.requestedById],
      title: `Your ${definition.title} export is ready`,
      body: `${plural(report.rows.length, "row")} · ${fileType.toUpperCase()}`,
      link: "/reports/exports",
      entity: { type: "ReportExport", id: exportId },
      idempotencyKey: `export:${exportId}`,
    });
  } catch (error) {
    logger?.error({ err: error, exportId }, "report export failed");
    await db.reportExport.update({
      where: { id: exportId },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message.slice(0, 500) : "The export failed.",
        completedAt: new Date(),
      },
    });
  }
}

export interface ExportRow {
  id: string;
  report: string;
  title: string;
  format: string;
  status: string;
  rowCount: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  downloadable: boolean;
}

/** The member's own exports, newest first. */
export async function listMyExports(ctx: ServiceContext): Promise<ExportRow[]> {
  const records = await ctx.db.reportExport.findMany({
    where: { requestedById: ctx.actor.membershipId ?? "" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return records.map((record) => ({
    id: record.id,
    report: record.report,
    title: getReportDefinition(record.report)?.title ?? record.report,
    format: record.format,
    status: record.status,
    rowCount: record.rowCount,
    error: record.error,
    createdAt: record.createdAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    downloadable: record.status === "READY" && record.fileId !== null,
  }));
}

/** The file of one of the member's own exports. */
export async function readExportFile(ctx: ServiceContext, exportId: string) {
  const record = await ctx.db.reportExport.findFirst({
    where: { id: exportId, requestedById: ctx.actor.membershipId ?? "" },
    include: { file: true },
  });
  if (!record?.file) throw new NotFoundError("Export", exportId);
  const body = await getStorage().getObject(record.file.key);
  if (!body) throw new NotFoundError("Export file", exportId);
  return { fileName: record.file.fileName, contentType: record.file.contentType, body };
}
