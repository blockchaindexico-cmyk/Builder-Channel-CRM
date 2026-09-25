"use client";

import { actionErrorMessage } from "@/lib/action-result";

import { attachBookingDocumentAction, requestBookingDocumentAction } from "../actions";
import { BOOKING_DOCUMENT_MAX_BYTES, BOOKING_DOCUMENT_TYPES } from "../constants";

/** True when a file is a document bookings accept (PDF, images, Word). */
export function isBookingDocument(file: File): boolean {
  return BOOKING_DOCUMENT_TYPES.some((type) =>
    type.endsWith("/*") ? file.type.startsWith(type.slice(0, -1)) : file.type === type,
  );
}

/** Uploads one document straight to storage and adds it to the booking. Throws with a readable message. */
export async function uploadBookingDocument(bookingId: string, file: File): Promise<void> {
  if (!isBookingDocument(file)) throw new Error(`${file.name}: upload PDF, image or Word files.`);
  if (file.size > BOOKING_DOCUMENT_MAX_BYTES)
    throw new Error(`${file.name}: files can be up to 20 MB.`);
  const requested = await requestBookingDocumentAction({
    bookingId,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });
  const requestError = actionErrorMessage(requested);
  if (requestError || !requested?.data) throw new Error(requestError ?? "Upload could not start.");
  const { fileId, upload } = requested.data;
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: file,
  });
  if (!response.ok) throw new Error(`${file.name} could not be uploaded to storage.`);
  const attachError = actionErrorMessage(
    await attachBookingDocumentAction({ bookingId, fileId, title: file.name }),
  );
  if (attachError) throw new Error(attachError);
}
