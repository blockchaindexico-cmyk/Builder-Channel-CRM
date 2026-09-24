import { randomUUID } from "node:crypto";

import type { FileObject } from "@/generated/prisma/client";
import { getServerRegistry } from "@/modules/registry.server";
import { ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";

import { getStorage } from "./index";
import type { PresignedUpload } from "./provider";
import { type FilePurpose, isAllowedContentType } from "./purposes";

/** Presigned upload URLs are valid for 10 minutes; download URLs for 5 minutes by default. */
const UPLOAD_URL_TTL_SECONDS = 600;
const DOWNLOAD_URL_TTL_SECONDS = 300;

export interface RequestUploadInput {
  purpose: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface RequestedUpload {
  fileId: string;
  upload: PresignedUpload;
}

export function getFilePurpose(key: string): FilePurpose {
  const purpose = getServerRegistry().filePurpose(key);
  if (!purpose) throw new ValidationError(`Unknown file purpose "${key}".`);
  return purpose;
}

/** Keeps a readable, storage-safe file name (letters, digits, dot, dash, underscore); drops any path. */
export function sanitizeFileName(fileName: string): string {
  const basename = fileName.trim().split(/[/\\]/).filter(Boolean).pop() ?? "";
  const match = /^(.*?)(?:\.([A-Za-z0-9]{1,10}))?$/.exec(basename);
  let base = match?.[1] ?? basename;
  let extension = match?.[2]?.toLowerCase() ?? "";
  if (!base && extension) {
    base = extension;
    extension = "";
  }
  const safeBase =
    base
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "file";
  return extension ? `${safeBase}.${extension}` : safeBase;
}

/** Object key layout: `orgs/{organizationId}/{purpose path}/{yyyy}/{mm}/{uuid}/{file name}` (rule T8). */
export function buildObjectKey(
  organizationId: string,
  purposeKey: string,
  fileName: string,
  now = new Date(),
) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const purposePath = purposeKey.replace(/\./g, "/");
  return `orgs/${organizationId}/${purposePath}/${year}/${month}/${randomUUID()}/${sanitizeFileName(fileName)}`;
}

function validateAgainstPurpose(purpose: FilePurpose, contentType: string, size: number) {
  if (!isAllowedContentType(purpose, contentType)) {
    throw new ValidationError(
      `Files of type "${contentType}" are not allowed for ${purpose.label}.`,
      {
        contentType: [`Allowed types: ${purpose.allowedTypes.join(", ")}`],
      },
    );
  }
  if (!Number.isInteger(size) || size <= 0) {
    throw new ValidationError("The file is empty.", { size: ["The file is empty."] });
  }
  if (size > purpose.maxBytes) {
    const limitMb = Math.round((purpose.maxBytes / (1024 * 1024)) * 10) / 10;
    throw new ValidationError(`The file is larger than the ${limitMb} MB limit.`, {
      size: [`Maximum size is ${limitMb} MB.`],
    });
  }
}

/**
 * Step 1 of a browser upload: validates the request, records a PENDING file and returns a presigned PUT URL.
 * The browser then uploads directly to object storage and calls `completeUpload`.
 */
export async function requestUpload(
  ctx: ServiceContext,
  input: RequestUploadInput,
): Promise<RequestedUpload> {
  const purpose = getFilePurpose(input.purpose);
  if (purpose.uploadPermission) ctx.permissions.assert(purpose.uploadPermission);
  validateAgainstPurpose(purpose, input.contentType, input.size);

  const key = buildObjectKey(ctx.organizationId, purpose.key, input.fileName);
  const file = await ctx.db.fileObject.create({
    data: {
      organizationId: ctx.organizationId,
      purpose: purpose.key,
      key,
      fileName: input.fileName.slice(0, 255),
      contentType: input.contentType,
      size: input.size,
      status: "PENDING",
      uploadedById: ctx.actor.type === "USER" ? ctx.actor.id : null,
    },
  });
  const upload = await getStorage().createUploadUrl(key, input.contentType, UPLOAD_URL_TTL_SECONDS);
  return { fileId: file.id, upload };
}

/**
 * Step 2: verifies the uploaded object (exists, within the size limit) and marks the file READY.
 * Oversized or missing uploads are rejected and cleaned up.
 */
export async function completeUpload(ctx: ServiceContext, fileId: string): Promise<FileObject> {
  const file = await ctx.db.fileObject.findFirst({ where: { id: fileId, status: "PENDING" } });
  if (!file) throw new NotFoundError("Pending upload", fileId);
  const purpose = getFilePurpose(file.purpose);

  const storage = getStorage();
  const info = await storage.headObject(file.key);
  if (!info) {
    throw new ValidationError("The upload did not reach storage. Please try again.");
  }
  if (info.size > purpose.maxBytes || info.size <= 0) {
    await storage.deleteObject(file.key);
    await ctx.db.fileObject.update({
      where: { id: file.id },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    throw new ValidationError("The uploaded file exceeds the allowed size.");
  }

  return ctx.db.fileObject.update({
    where: { id: file.id },
    data: { status: "READY", size: info.size },
  });
}

/** Stores a server-generated file (e.g. invoice PDF, export) and returns its READY record. */
export async function storeServerFile(
  ctx: ServiceContext,
  input: { purpose: string; fileName: string; contentType: string; body: Uint8Array | string },
): Promise<FileObject> {
  const purpose = getFilePurpose(input.purpose);
  const size =
    typeof input.body === "string" ? Buffer.byteLength(input.body) : input.body.byteLength;
  validateAgainstPurpose(purpose, input.contentType, size);
  const key = buildObjectKey(ctx.organizationId, purpose.key, input.fileName);
  await getStorage().putObject(key, input.body, input.contentType);
  return ctx.db.fileObject.create({
    data: {
      organizationId: ctx.organizationId,
      purpose: purpose.key,
      key,
      fileName: input.fileName.slice(0, 255),
      contentType: input.contentType,
      size,
      status: "READY",
      uploadedById: ctx.actor.type === "USER" ? ctx.actor.id : null,
    },
  });
}

/** Loads a READY file of the current tenant and checks the purpose's read rule. */
export async function getReadableFile(ctx: ServiceContext, fileId: string): Promise<FileObject> {
  const file = await ctx.db.fileObject.findFirst({ where: { id: fileId, status: "READY" } });
  if (!file) throw new NotFoundError("File", fileId);
  const purpose = getFilePurpose(file.purpose);
  if (purpose.canRead && !(await purpose.canRead(ctx, file))) {
    throw new ForbiddenError("You do not have access to this file.");
  }
  return file;
}

/** Short-lived download URL for a file the actor may read. */
export async function getFileDownloadUrl(
  ctx: ServiceContext,
  fileId: string,
  options: { disposition?: "inline" | "attachment"; expiresInSeconds?: number } = {},
): Promise<string> {
  const file = await getReadableFile(ctx, fileId);
  return getStorage().createDownloadUrl(file.key, {
    expiresInSeconds: options.expiresInSeconds ?? DOWNLOAD_URL_TTL_SECONDS,
    fileName: file.fileName,
    disposition: options.disposition ?? "attachment",
  });
}

/**
 * Soft-deletes a file record (the object is kept for accountability; physical purge follows the data
 * retention policy — open question Q-15).
 */
export async function softDeleteFile(ctx: ServiceContext, fileId: string): Promise<void> {
  await ctx.db.fileObject.updateMany({
    where: { id: fileId, status: { not: "DELETED" } },
    data: { status: "DELETED", deletedAt: new Date() },
  });
}
