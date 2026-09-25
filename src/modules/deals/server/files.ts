import { recordAudit } from "@/platform/audit";
import { ForbiddenError, NotFoundError } from "@/platform/errors";
import { completeUpload, getFileDownloadUrl, requestUpload } from "@/platform/storage/files";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { BOOKING_DOCUMENT_PURPOSE } from "../constants";
import { DEAL_PERMISSIONS } from "../permissions";
import { requestBookingDocumentSchema } from "../schemas";
import { canActOnBooking, findVisibleBookingWhere } from "./scope";

/** Documents of a booking (M08-07): booking form, cheque copy, agreement… Changes go to the booking's history. */

async function loadManageableBooking(ctx: ServiceContext, bookingId: string) {
  const booking = await ctx.db.booking.findFirst({
    where: await findVisibleBookingWhere(ctx, bookingId),
    select: {
      id: true,
      number: true,
      status: true,
      executiveId: true,
      lead: { select: { ownerId: true } },
    },
  });
  if (!booking) throw new NotFoundError("Booking", bookingId);
  if (!(await canActOnBooking(ctx, booking, DEAL_PERMISSIONS.bookingsManage))) {
    throw new ForbiddenError(undefined, DEAL_PERMISSIONS.bookingsManage);
  }
  return booking;
}

/** Step 1 of a document upload: a presigned URL, for people who may manage the booking. */
export async function requestBookingDocument(
  ctx: ServiceContext,
  input: { bookingId: string; fileName: string; contentType: string; size: number },
) {
  const values = parseInput(requestBookingDocumentSchema, input);
  await loadManageableBooking(ctx, values.bookingId);
  return requestUpload(ctx, {
    purpose: BOOKING_DOCUMENT_PURPOSE,
    fileName: values.fileName,
    contentType: values.contentType,
    size: values.size,
  });
}

/** Step 2: verifies the upload and adds it to the booking. */
export async function attachBookingDocument(
  ctx: ServiceContext,
  input: { bookingId: string; fileId: string; title?: string | null },
): Promise<{ id: string }> {
  const booking = await loadManageableBooking(ctx, input.bookingId);
  const file = await completeUpload(ctx, input.fileId);
  if (file.purpose !== BOOKING_DOCUMENT_PURPOSE)
    throw new NotFoundError("Pending upload", input.fileId);
  const title = input.title?.trim().slice(0, 120) || file.fileName;
  return ctx.db.$transaction(async (tx) => {
    const row = await tx.bookingFile.create({
      data: {
        organizationId: ctx.organizationId,
        bookingId: booking.id,
        fileId: file.id,
        title,
        uploadedById: ctx.actor.membershipId ?? null,
        uploadedByName: ctx.actor.name,
      },
    });
    await tx.bookingHistory.create({
      data: {
        organizationId: ctx.organizationId,
        bookingId: booking.id,
        type: "FILE_ADDED",
        note: title,
        actorId: ctx.actor.membershipId ?? null,
        actorName: ctx.actor.name,
      },
    });
    await recordAudit(tx, ctx, {
      action: "deals.booking.file.add",
      entityType: "Booking",
      entityId: booking.id,
      summary: `Added ${file.fileName} to booking ${booking.number}`,
      metadata: { bookingFileId: row.id },
    });
    return { id: row.id };
  });
}

export async function getBookingDocumentUrl(
  ctx: ServiceContext,
  bookingFileId: string,
  disposition: "inline" | "attachment" = "attachment",
) {
  const row = await ctx.db.bookingFile.findFirst({ where: { id: bookingFileId, deletedAt: null } });
  if (!row) throw new NotFoundError("Document", bookingFileId);
  const visible = await ctx.db.booking.findFirst({
    where: await findVisibleBookingWhere(ctx, row.bookingId),
    select: { id: true },
  });
  if (!visible) throw new NotFoundError("Document", bookingFileId);
  return getFileDownloadUrl(ctx, row.fileId, { disposition });
}

/** Soft delete: hidden from the booking, kept in storage and in the booking's history. */
export async function removeBookingDocument(ctx: ServiceContext, bookingFileId: string) {
  const row = await ctx.db.bookingFile.findFirst({ where: { id: bookingFileId, deletedAt: null } });
  if (!row) throw new NotFoundError("Document", bookingFileId);
  const booking = await loadManageableBooking(ctx, row.bookingId);
  await ctx.db.$transaction(async (tx) => {
    await tx.bookingFile.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
    await tx.bookingHistory.create({
      data: {
        organizationId: ctx.organizationId,
        bookingId: booking.id,
        type: "FILE_REMOVED",
        note: row.title,
        actorId: ctx.actor.membershipId ?? null,
        actorName: ctx.actor.name,
      },
    });
    await recordAudit(tx, ctx, {
      action: "deals.booking.file.remove",
      entityType: "Booking",
      entityId: booking.id,
      summary: `Removed ${row.title} from booking ${booking.number}`,
      metadata: { bookingFileId: row.id },
    });
  });
}

/** Read rule for stored booking documents: the booking must be visible to the reader. */
export async function canReadBookingDocument(
  ctx: ServiceContext,
  fileId: string,
): Promise<boolean> {
  if (!ctx.permissions.has(DEAL_PERMISSIONS.bookingsView)) return false;
  const row = await ctx.db.bookingFile.findFirst({
    where: { fileId },
    select: { bookingId: true },
  });
  if (!row) return false;
  const visible = await ctx.db.booking.findFirst({
    where: await findVisibleBookingWhere(ctx, row.bookingId),
    select: { id: true },
  });
  return Boolean(visible);
}
