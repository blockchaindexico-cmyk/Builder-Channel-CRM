"use client";

import { Download, Eye, FileText, Lock, Pencil, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/regional-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { actionErrorMessage } from "@/lib/action-result";

import {
  attachDocumentAction,
  getDocumentUrlAction,
  removeDocumentAction,
  requestDocumentUploadAction,
  updateDocumentAction,
} from "../../actions";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  type DocumentCategoryValue,
} from "../../schemas";
import type { DocumentRow } from "../../server/documents";

type Owner = "project" | "builder";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function titleFromFileName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim()
      .slice(0, 160) || name
  );
}

interface DraftDocument {
  file?: File;
  documentId?: string;
  title: string;
  category: DocumentCategoryValue;
  isInternal: boolean;
}

/**
 * Documents of a project or builder (M03-04, M03-08): list with preview/download for everyone who can see
 * them; upload, edit and remove for document managers. Internal documents are marked with a lock.
 */
export function DocumentsPanel({
  owner,
  ownerId,
  documents,
  canManage,
  categories = DOCUMENT_CATEGORIES.map((category) => category.value),
  defaultCategory = "BROCHURE",
  defaultInternal = false,
}: {
  owner: Owner;
  ownerId: string;
  documents: DocumentRow[];
  canManage: boolean;
  categories?: readonly DocumentCategoryValue[];
  defaultCategory?: DocumentCategoryValue;
  defaultInternal?: boolean;
}) {
  const router = useRouter();
  const format = useFormatters();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<DraftDocument | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(documentId: string, disposition: "inline" | "attachment") {
    const result = await getDocumentUrlAction({ owner, documentId, disposition });
    const error = actionErrorMessage(result);
    if (error || !result?.data)
      return void toast.error(error ?? "The document could not be opened.");
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  function pick(file: File) {
    if (!(DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Upload PDF, image, Excel, CSV, Word or PowerPoint files.");
      return;
    }
    if (file.size > DOCUMENT_MAX_BYTES) {
      toast.error("Files must be 25 MB or smaller.");
      return;
    }
    const isImage = file.type.startsWith("image/");
    setDraft({
      file,
      title: titleFromFileName(file.name),
      category: isImage && categories.includes("IMAGE") ? "IMAGE" : defaultCategory,
      isInternal: defaultInternal,
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim()) return void toast.error("Enter a title.");
    setBusy(true);
    try {
      if (draft.documentId) {
        const error = actionErrorMessage(
          await updateDocumentAction({
            owner,
            documentId: draft.documentId,
            title: draft.title,
            category: draft.category,
            isInternal: draft.isInternal,
          }),
        );
        if (error) throw new Error(error);
        toast.success("Document updated");
      } else if (draft.file) {
        const file = draft.file;
        const requested = await requestDocumentUploadAction({
          owner,
          ownerId,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        });
        const requestError = actionErrorMessage(requested);
        if (requestError || !requested?.data)
          throw new Error(requestError ?? "Upload could not start.");
        const { fileId, upload } = requested.data;
        const response = await fetch(upload.url, {
          method: upload.method,
          headers: upload.headers,
          body: file,
        });
        if (!response.ok) throw new Error("The file could not be uploaded to storage.");
        const attachError = actionErrorMessage(
          await attachDocumentAction({
            owner,
            ownerId,
            fileId,
            title: draft.title,
            category: draft.category,
            isInternal: draft.isInternal,
          }),
        );
        if (attachError) throw new Error(attachError);
        toast.success(`${draft.title} uploaded`);
      }
      setDraft(null);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(documentId: string, title: string) {
    const error = actionErrorMessage(await removeDocumentAction({ owner, documentId }));
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`${title} removed`);
    router.refresh();
  }

  const categoryLabel = (value: string) =>
    DOCUMENT_CATEGORIES.find((category) => category.value === value)?.label ?? value;

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            PDF, images, Excel, Word or PowerPoint up to 25 MB.
          </p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={DOCUMENT_TYPES.join(",")}
            data-testid={`${owner}-document-input`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) pick(file);
            }}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <Upload /> Upload document
          </Button>
        </div>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description={
            canManage
              ? "Upload brochures, floor plans, price sheets and approvals so the team can share them."
              : "Documents shared by the admin team appear here."
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
            >
              <FileText className="hidden size-5 shrink-0 text-muted-foreground sm:block" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="truncate">{document.title}</span>
                  <Badge variant="secondary">{categoryLabel(document.category)}</Badge>
                  {document.isInternal ? (
                    <Badge variant="warning" className="gap-1">
                      <Lock /> Internal
                    </Badge>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {document.fileName} · {formatSize(document.size)} · added{" "}
                  {format.date(document.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                {document.contentType === "application/pdf" ||
                document.contentType.startsWith("image/") ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void open(document.id, "inline")}
                  >
                    <Eye /> View
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void open(document.id, "attachment")}
                >
                  <Download /> Download
                </Button>
                {canManage ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${document.title}`}
                      onClick={() =>
                        setDraft({
                          documentId: document.id,
                          title: document.title,
                          category: document.category as DocumentCategoryValue,
                          isInternal: document.isInternal,
                        })
                      }
                    >
                      <Pencil />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${document.title}`}
                        >
                          <Trash2 />
                        </Button>
                      }
                      title={`Remove "${document.title}"?`}
                      description="It is no longer available to the team. The removal is recorded in the audit log."
                      confirmLabel="Remove"
                      destructive
                      onConfirm={() => remove(document.id, document.title)}
                    />
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(next) => !next && !busy && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.documentId ? "Edit document" : "Upload document"}</DialogTitle>
            <DialogDescription>
              {draft?.file
                ? `${draft.file.name} · ${formatSize(draft.file.size)}`
                : "Change how the document is listed."}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="document-title">Title</Label>
                <Input
                  id="document-title"
                  value={draft.title}
                  maxLength={160}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="document-category">Category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(value) =>
                    setDraft({ ...draft, category: value as DocumentCategoryValue })
                  }
                >
                  <SelectTrigger id="document-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((value) => (
                      <SelectItem key={value} value={value}>
                        {categoryLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-1">
                  <Label htmlFor="document-internal">Internal only</Label>
                  <p className="text-xs text-muted-foreground">
                    Hidden from managers and executives, e.g. commission agreements or internal rate
                    cards.
                  </p>
                </div>
                <Switch
                  id="document-internal"
                  checked={draft.isInternal}
                  onCheckedChange={(checked) => setDraft({ ...draft, isInternal: checked })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : draft?.documentId ? "Save" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
