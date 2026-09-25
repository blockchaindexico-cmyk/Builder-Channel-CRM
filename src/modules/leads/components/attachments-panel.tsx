"use client";

import { Download, Eye, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-result";

import {
  attachFileAction,
  fileUrlAction,
  removeFileAction,
  requestAttachmentAction,
} from "../actions";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from "../schemas";
import type { LeadFileRow } from "../server/files";

function size(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Lead attachments (M04-10): KYC copies, cost sheets, call recordings… uploaded straight to storage. */
export function AttachmentsPanel({
  leadId,
  files,
  canWrite,
}: {
  leadId: string;
  files: LeadFileRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const format = useFormatters();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
      return void toast.error("Upload PDF, images, Office documents, CSV or audio files.");
    }
    if (file.size > ATTACHMENT_MAX_BYTES)
      return void toast.error("Attachments must be 20 MB or smaller.");
    setBusy(true);
    try {
      const requested = await requestAttachmentAction({
        leadId,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });
      const requestError = actionErrorMessage(requested);
      if (requestError || !requested?.data)
        throw new Error(requestError ?? "Upload could not start.");
      const { fileId, upload: target } = requested.data;
      const response = await fetch(target.url, {
        method: target.method,
        headers: target.headers,
        body: file,
      });
      if (!response.ok) throw new Error("The file could not be uploaded to storage.");
      const attachError = actionErrorMessage(await attachFileAction({ leadId, fileId }));
      if (attachError) throw new Error(attachError);
      toast.success(`${file.name} attached`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function open(fileId: string, disposition: "inline" | "attachment") {
    const result = await fileUrlAction({ fileId, disposition });
    const error = actionErrorMessage(result);
    if (error || !result?.data) return void toast.error(error ?? "The file could not be opened.");
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex justify-end">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={ATTACHMENT_TYPES.join(",")}
            data-testid="lead-attachment-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Attach file
          </Button>
        </div>
      ) : null}
      {files.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="No attachments"
          description="KYC copies, cost sheets or call recordings."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {files.map((file) => (
            <li key={file.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {file.fileName} · {size(file.size)} · {file.uploadedByName},{" "}
                  {format.date(file.createdAt)}
                </p>
              </div>
              <div className="flex gap-1">
                {file.contentType === "application/pdf" ||
                file.contentType.startsWith("image/") ||
                file.contentType.startsWith("audio/") ? (
                  <Button variant="ghost" size="sm" onClick={() => void open(file.id, "inline")}>
                    <Eye /> Open
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => void open(file.id, "attachment")}>
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
                    description="It is hidden from the lead; the file and the removal stay on record."
                    confirmLabel="Remove"
                    destructive
                    onConfirm={async () => {
                      const error = actionErrorMessage(await removeFileAction({ fileId: file.id }));
                      if (error) {
                        toast.error(error);
                        return false;
                      }
                      toast.success("Attachment removed");
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
