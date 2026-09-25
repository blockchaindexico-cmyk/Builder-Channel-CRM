import { recordAudit } from "@/platform/audit";
import { NotFoundError } from "@/platform/errors";
import { completeUpload, getFileDownloadUrl, requestUpload } from "@/platform/storage/files";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { LEAD_ACTIVITY_TYPES } from "../constants";
import { LEAD_PERMISSIONS } from "../permissions";
import { LEAD_ATTACHMENT_PURPOSE, requestAttachmentSchema } from "../schemas";
import { findVisibleLead, isLeadInScope } from "./scope";
import { recordLeadActivity } from "./timeline";

export interface LeadFileRow {
  id: string;
  title: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedByName: string;
  createdAt: string;
}

export async function listLeadFiles(ctx: ServiceContext, leadId: string): Promise<LeadFileRow[]> {
  await findVisibleLead(ctx, leadId);
  const files = await ctx.db.leadFile.findMany({
    where: { leadId, deletedAt: null, file: { status: "READY" } },
    orderBy: { createdAt: "desc" },
    include: { file: { select: { fileName: true, contentType: true, size: true } } },
  });
  return files.map((row) => ({
    id: row.id,
    title: row.title,
    fileName: row.file.fileName,
    contentType: row.file.contentType,
    size: row.file.size,
    uploadedByName: row.uploadedByName,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Step 1 of an attachment upload (M04-10): presigned URL, only for leads the actor may edit. */
export async function requestLeadAttachment(
  ctx: ServiceContext,
  leadId: string,
  input: { fileName: string; contentType: string; size: number },
) {
  const values = parseInput(requestAttachmentSchema, input);
  await findVisibleLead(ctx, leadId, { permission: LEAD_PERMISSIONS.update });
  return requestUpload(ctx, { purpose: LEAD_ATTACHMENT_PURPOSE, ...values });
}

/** Step 2: verifies the upload and attaches it (timeline + audit). */
export async function attachLeadFile(
  ctx: ServiceContext,
  leadId: string,
  input: { fileId: string; title?: string | null },
) {
  const lead = await findVisibleLead(ctx, leadId, { permission: LEAD_PERMISSIONS.update });
  const file = await completeUpload(ctx, input.fileId);
  if (file.purpose !== LEAD_ATTACHMENT_PURPOSE)
    throw new NotFoundError("Pending upload", input.fileId);
  const title = input.title?.trim().slice(0, 160) || file.fileName;
  return ctx.db.$transaction(async (tx) => {
    const row = await tx.leadFile.create({
      data: {
        organizationId: ctx.organizationId,
        leadId,
        fileId: file.id,
        title,
        uploadedById: ctx.actor.membershipId ?? null,
        uploadedByName: ctx.actor.name,
      },
    });
    await recordLeadActivity(tx, ctx, {
      leadId,
      type: LEAD_ACTIVITY_TYPES.FILE_ADDED,
      summary: `Attached ${title}`,
      payload: { fileId: row.id, fileName: file.fileName, size: file.size },
    });
    await recordAudit(tx, ctx, {
      action: "lead.file.add",
      entityType: "Lead",
      entityId: leadId,
      summary: `Attached ${file.fileName} to ${lead.number}`,
      metadata: { leadFileId: row.id },
    });
    return { id: row.id };
  });
}

export async function getLeadFileUrl(
  ctx: ServiceContext,
  leadFileId: string,
  disposition: "inline" | "attachment" = "attachment",
) {
  const row = await ctx.db.leadFile.findFirst({ where: { id: leadFileId, deletedAt: null } });
  if (!row) throw new NotFoundError("Attachment", leadFileId);
  await findVisibleLead(ctx, row.leadId);
  return getFileDownloadUrl(ctx, row.fileId, { disposition });
}

/** Soft delete (M04-10): hidden from the lead, kept in storage and history. */
export async function removeLeadFile(ctx: ServiceContext, leadFileId: string) {
  const row = await ctx.db.leadFile.findFirst({ where: { id: leadFileId, deletedAt: null } });
  if (!row) throw new NotFoundError("Attachment", leadFileId);
  await ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, row.leadId, {
      permission: LEAD_PERMISSIONS.update,
      db: tx,
    });
    await tx.leadFile.update({ where: { id: leadFileId }, data: { deletedAt: new Date() } });
    await recordLeadActivity(tx, ctx, {
      leadId: row.leadId,
      type: LEAD_ACTIVITY_TYPES.FILE_REMOVED,
      summary: `Removed ${row.title}`,
      payload: { fileId: leadFileId },
      touch: false,
    });
    await recordAudit(tx, ctx, {
      action: "lead.file.remove",
      entityType: "Lead",
      entityId: row.leadId,
      summary: `Removed attachment ${row.title} from ${lead.number}`,
      metadata: { leadFileId },
    });
  });
}

/** Read rule for stored attachment files: the lead must be in the reader's scope. */
export async function canReadLeadAttachment(ctx: ServiceContext, fileId: string): Promise<boolean> {
  const row = await ctx.db.leadFile.findFirst({
    where: { fileId },
    select: { lead: { select: { ownerId: true, deletedAt: true } } },
  });
  if (!row || row.lead.deletedAt) return false;
  return isLeadInScope(ctx, row.lead, LEAD_PERMISSIONS.view);
}
