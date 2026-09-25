import type { DocumentCategory } from "@/generated/prisma/enums";
import { recordAudit } from "@/platform/audit";
import { ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import {
  completeUpload,
  getFileDownloadUrl,
  requestUpload,
  softDeleteFile,
} from "@/platform/storage/files";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { CATALOG_PERMISSIONS } from "../permissions";
import {
  type AttachDocumentInput,
  attachDocumentSchema,
  BUILDER_DOCUMENT_PURPOSE,
  DOCUMENT_CATEGORIES,
  IMAGE_TYPES,
  PROJECT_DOCUMENT_PURPOSE,
  requestDocumentUploadSchema,
} from "../schemas";

/**
 * Project & builder documents (M03-08, PRD §27). Files go straight to object storage through presigned URLs;
 * a document row links the file to its project/builder with a category, a title and an "internal" flag.
 * Shared documents are readable by everyone who can view the project/builder; internal ones only by the
 * people who manage those documents. Downloads are short-lived presigned URLs checked on every request.
 */

type Owner = "project" | "builder";

const RULES = {
  project: {
    purpose: PROJECT_DOCUMENT_PURPOSE,
    view: CATALOG_PERMISSIONS.projectsView,
    manage: CATALOG_PERMISSIONS.projectFilesManage,
    entityType: "Project",
  },
  builder: {
    purpose: BUILDER_DOCUMENT_PURPOSE,
    view: CATALOG_PERMISSIONS.buildersView,
    manage: CATALOG_PERMISSIONS.buildersManage,
    entityType: "Builder",
  },
} as const;

export interface DocumentRow {
  id: string;
  fileId: string;
  title: string;
  category: DocumentCategory;
  isInternal: boolean;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
}

async function ownerName(ctx: ServiceContext, owner: Owner, ownerId: string): Promise<string> {
  const record =
    owner === "project"
      ? await ctx.db.project.findFirst({ where: { id: ownerId }, select: { name: true } })
      : await ctx.db.builder.findFirst({ where: { id: ownerId }, select: { name: true } });
  if (!record) throw new NotFoundError(owner === "project" ? "Project" : "Builder", ownerId);
  return record.name;
}

/** Step 1: presigned upload URL for a new document of a project/builder. */
export async function requestDocumentUpload(
  ctx: ServiceContext,
  owner: Owner,
  ownerId: string,
  input: { fileName: string; contentType: string; size: number },
) {
  const rules = RULES[owner];
  ctx.permissions.assert(rules.manage);
  const values = parseInput(requestDocumentUploadSchema, input);
  await ownerName(ctx, owner, ownerId);
  return requestUpload(ctx, { purpose: rules.purpose, ...values });
}

/** Step 2: verifies the uploaded file and attaches it (audited; the owner's `updated` event is published). */
export async function attachDocument(
  ctx: ServiceContext,
  owner: Owner,
  ownerId: string,
  input: AttachDocumentInput,
): Promise<{ id: string }> {
  const rules = RULES[owner];
  ctx.permissions.assert(rules.manage);
  const values = parseInput(attachDocumentSchema, input);
  const name = await ownerName(ctx, owner, ownerId);
  const file = await completeUpload(ctx, values.fileId);
  if (file.purpose !== rules.purpose)
    throw new ValidationError("This upload does not belong here.");
  const isImage = (IMAGE_TYPES as readonly string[]).includes(file.contentType.toLowerCase());
  if (values.category === "IMAGE" && !isImage) {
    await softDeleteFile(ctx, file.id);
    throw new ValidationError("Images must be PNG, JPEG or WebP files.", {
      category: ["Not an image"],
    });
  }
  const label =
    DOCUMENT_CATEGORIES.find((category) => category.value === values.category)?.label ??
    values.category;
  return ctx.db.$transaction(async (tx) => {
    const data = {
      organizationId: ctx.organizationId,
      fileId: file.id,
      category: values.category,
      title: values.title,
      isInternal: values.isInternal,
      createdById: ctx.actor.type === "USER" ? ctx.actor.id : null,
    };
    const document =
      owner === "project"
        ? await tx.projectFile.create({ data: { ...data, projectId: ownerId } })
        : await tx.builderFile.create({ data: { ...data, builderId: ownerId } });
    await recordAudit(tx, ctx, {
      action: `${owner}.document.add`,
      entityType: rules.entityType,
      entityId: ownerId,
      summary: `Added ${label.toLowerCase()} "${values.title}" to ${name}${values.isInternal ? " (internal)" : ""}`,
      metadata: { documentId: document.id, fileName: file.fileName, size: file.size },
    });
    if (owner === "project") {
      await publishEvent(tx, ctx, "project.updated", {
        projectId: ownerId,
        changedFields: ["documents"],
      });
    } else {
      await publishEvent(tx, ctx, "builder.updated", {
        builderId: ownerId,
        changedFields: ["documents"],
      });
    }
    return { id: document.id };
  });
}

/** Documents of a project/builder the actor may see (internal ones only for document managers). */
export async function listDocuments(
  ctx: ServiceContext,
  owner: Owner,
  ownerId: string,
): Promise<DocumentRow[]> {
  const rules = RULES[owner];
  ctx.permissions.assert(rules.view);
  const seeInternal = ctx.permissions.has(rules.manage);
  const select = {
    id: true,
    fileId: true,
    title: true,
    category: true,
    isInternal: true,
    createdAt: true,
    file: { select: { fileName: true, contentType: true, size: true } },
  } as const;
  const where = {
    ...(seeInternal ? {} : { isInternal: false }),
    file: { status: "READY" as const },
  };
  const rows =
    owner === "project"
      ? await ctx.db.projectFile.findMany({
          where: { projectId: ownerId, ...where },
          orderBy: [{ category: "asc" }, { createdAt: "desc" }],
          select,
        })
      : await ctx.db.builderFile.findMany({
          where: { builderId: ownerId, ...where },
          orderBy: [{ category: "asc" }, { createdAt: "desc" }],
          select,
        });
  return rows.map((row) => ({
    id: row.id,
    fileId: row.fileId,
    title: row.title,
    category: row.category,
    isInternal: row.isInternal,
    fileName: row.file.fileName,
    contentType: row.file.contentType,
    size: row.file.size,
    createdAt: row.createdAt.toISOString(),
  }));
}

async function findDocument(ctx: ServiceContext, owner: Owner, documentId: string) {
  const document =
    owner === "project"
      ? await ctx.db.projectFile.findFirst({
          where: { id: documentId },
          include: { project: { select: { id: true, name: true } } },
        })
      : await ctx.db.builderFile.findFirst({
          where: { id: documentId },
          include: { builder: { select: { id: true, name: true } } },
        });
  if (!document) throw new NotFoundError("Document", documentId);
  const parent = "project" in document ? document.project : document.builder;
  return { document, parent };
}

/** Short-lived download (or inline preview) URL, checked against the document's visibility. */
export async function getDocumentUrl(
  ctx: ServiceContext,
  owner: Owner,
  documentId: string,
  disposition: "inline" | "attachment" = "attachment",
): Promise<string> {
  const rules = RULES[owner];
  ctx.permissions.assert(rules.view);
  const { document } = await findDocument(ctx, owner, documentId);
  if (document.isInternal && !ctx.permissions.has(rules.manage)) {
    throw new ForbiddenError("This document is internal.");
  }
  return getFileDownloadUrl(ctx, document.fileId, { disposition });
}

export async function updateDocument(
  ctx: ServiceContext,
  owner: Owner,
  documentId: string,
  input: { title: string; category: string; isInternal: boolean },
): Promise<void> {
  const rules = RULES[owner];
  ctx.permissions.assert(rules.manage);
  const values = parseInput(attachDocumentSchema.omit({ fileId: true }), input);
  const { document, parent } = await findDocument(ctx, owner, documentId);
  await ctx.db.$transaction(async (tx) => {
    const data = { title: values.title, category: values.category, isInternal: values.isInternal };
    if (owner === "project") await tx.projectFile.update({ where: { id: documentId }, data });
    else await tx.builderFile.update({ where: { id: documentId }, data });
    await recordAudit(tx, ctx, {
      action: `${owner}.document.update`,
      entityType: rules.entityType,
      entityId: parent.id,
      summary: `Updated document "${values.title}" of ${parent.name}`,
      before: {
        title: document.title,
        category: document.category,
        isInternal: document.isInternal,
      },
      after: data,
      metadata: { documentId },
    });
  });
}

export async function removeDocument(
  ctx: ServiceContext,
  owner: Owner,
  documentId: string,
): Promise<void> {
  const rules = RULES[owner];
  ctx.permissions.assert(rules.manage);
  const { document, parent } = await findDocument(ctx, owner, documentId);
  await ctx.db.$transaction(async (tx) => {
    if (owner === "project") await tx.projectFile.delete({ where: { id: documentId } });
    else await tx.builderFile.delete({ where: { id: documentId } });
    await recordAudit(tx, ctx, {
      action: `${owner}.document.remove`,
      entityType: rules.entityType,
      entityId: parent.id,
      summary: `Removed document "${document.title}" from ${parent.name}`,
      metadata: { documentId, fileId: document.fileId },
    });
    if (owner === "project") {
      await publishEvent(tx, ctx, "project.updated", {
        projectId: parent.id,
        changedFields: ["documents"],
      });
    } else {
      await publishEvent(tx, ctx, "builder.updated", {
        builderId: parent.id,
        changedFields: ["documents"],
      });
    }
  });
  await softDeleteFile(ctx, document.fileId);
}

/** Project images with inline preview URLs for the media gallery (valid for an hour). */
export async function listProjectImages(ctx: ServiceContext, projectId: string) {
  const documents = (await listDocuments(ctx, "project", projectId)).filter(
    (document) => document.category === "IMAGE",
  );
  return Promise.all(
    documents.map(async (document) => ({
      ...document,
      url: await getFileDownloadUrl(ctx, document.fileId, {
        disposition: "inline",
        expiresInSeconds: 3600,
      }),
    })),
  );
}

/** Read rule for stored files of the two document purposes (checked by the storage layer). */
export async function canReadDocumentFile(
  ctx: ServiceContext,
  owner: Owner,
  fileId: string,
): Promise<boolean> {
  const rules = RULES[owner];
  const document =
    owner === "project"
      ? await ctx.db.projectFile.findFirst({ where: { fileId }, select: { isInternal: true } })
      : await ctx.db.builderFile.findFirst({ where: { fileId }, select: { isInternal: true } });
  if (!document) return ctx.permissions.has(rules.manage);
  return document.isInternal ? ctx.permissions.has(rules.manage) : ctx.permissions.has(rules.view);
}
