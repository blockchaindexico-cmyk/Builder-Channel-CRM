"use client";

import { Download, Eye, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-result";

import { bookingDocumentUrlAction, removeBookingDocumentAction } from "../actions";
import type { BookingFileRow } from "../server/bookings";
import { uploadBookingDocument } from "./upload-document";

function size(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Documents of a booking (M08-07): booking form, cheque copy, agreement… uploaded straight to storage. */
export function BookingDocuments({
  bookingId,
  files,
  canWrite,
}: {
  bookingId: string;
  files: BookingFileRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const format = useFormatters();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(list: File[]) {
    setBusy(true);
    let added = 0;
    for (const file of list) {
      try {
        await uploadBookingDocument(bookingId, file);
        added += 1;
      } catch (error) {
        toast.error((error as Error).message);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (added) {
      toast.success(added === 1 ? "Document added" : `${added} documents added`);
      router.refresh();
    }
  }

  async function open(documentId: string, inline: boolean) {
    const result = await bookingDocumentUrlAction({ documentId, inline });
    const error = actionErrorMessage(result);
    if (error || !result?.data)
      return void toast.error(error ?? "The document could not be opened.");
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex justify-end">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept="application/pdf,image/*,.doc,.docx"
            data-testid="booking-document-input"
            onChange={(event) => {
              const list = [...(event.target.files ?? [])];
              if (list.length) void upload(list);
            }}
          />
          <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Add document
          </Button>
        </div>
      ) : null}
      {files.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents"
          description="Booking form, cheque copy, agreement, KYC…"
        />
      ) : (
        <ul className="divide-y rounded-lg border" aria-label="Documents">
          {files.map((file) => (
            <li key={file.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {size(file.size)} · {file.uploadedByName}, {format.date(file.createdAt)}
                </p>
              </div>
              <div className="flex gap-1">
                {file.contentType === "application/pdf" || file.contentType.startsWith("image/") ? (
                  <Button variant="ghost" size="sm" onClick={() => void open(file.id, true)}>
                    <Eye /> Open
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => void open(file.id, false)}>
                  <Download /> Download
                </Button>
                {canWrite ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${file.title}`}>
                        <Trash2 />
                      </Button>
                    }
                    title={`Remove ${file.title}?`}
                    description="It is hidden from the booking; the file and the removal stay on record."
                    confirmLabel="Remove"
                    destructive
                    onConfirm={async () => {
                      const error = actionErrorMessage(
                        await removeBookingDocumentAction({ documentId: file.id, bookingId }),
                      );
                      if (error) {
                        toast.error(error);
                        return false;
                      }
                      toast.success("Document removed");
                      router.refresh();
                    }}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
