"use client";

import { ImagePlus, Images, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { actionErrorMessage } from "@/lib/action-result";

import {
  attachDocumentAction,
  removeDocumentAction,
  requestDocumentUploadAction,
} from "../../actions";
import { DOCUMENT_MAX_BYTES, IMAGE_TYPES } from "../../schemas";

export interface GalleryImage {
  id: string;
  title: string;
  url: string;
}

/** Project media gallery (M03-08): image grid with a viewer; upload several images at once. */
export function MediaGallery({
  projectId,
  images,
  canManage,
}: {
  projectId: string;
  images: GalleryImage[];
  canManage: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<GalleryImage | null>(null);

  async function upload(files: File[]) {
    const valid = files.filter(
      (file) =>
        (IMAGE_TYPES as readonly string[]).includes(file.type) && file.size <= DOCUMENT_MAX_BYTES,
    );
    if (valid.length < files.length)
      toast.error("Only PNG, JPEG or WebP images up to 25 MB are uploaded.");
    if (valid.length === 0) return;
    setBusy(true);
    let uploaded = 0;
    for (const file of valid) {
      try {
        const requested = await requestDocumentUploadAction({
          owner: "project",
          ownerId: projectId,
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
        if (!response.ok) throw new Error("The image could not be uploaded to storage.");
        const attachError = actionErrorMessage(
          await attachDocumentAction({
            owner: "project",
            ownerId: projectId,
            fileId,
            category: "IMAGE",
            title: file.name.replace(/\.[^.]+$/, "").slice(0, 160) || "Image",
            isInternal: false,
          }),
        );
        if (attachError) throw new Error(attachError);
        uploaded += 1;
      } catch (error) {
        toast.error(`${file.name}: ${(error as Error).message}`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (uploaded > 0) {
      toast.success(`${uploaded} image(s) added`);
      router.refresh();
    }
  }

  async function remove(image: GalleryImage) {
    const error = actionErrorMessage(
      await removeDocumentAction({ owner: "project", documentId: image.id }),
    );
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success("Image removed");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={IMAGE_TYPES.join(",")}
            className="hidden"
            data-testid="project-image-input"
            onChange={(event) => void upload(Array.from(event.target.files ?? []))}
          />
          <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} Add images
          </Button>
        </div>
      ) : null}
      {images.length === 0 ? (
        <EmptyState
          icon={Images}
          title="No images yet"
          description="Renders, site photos and sample flats appear here."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <figure
              key={image.id}
              className="group relative overflow-hidden rounded-lg border bg-muted"
            >
              <button
                type="button"
                className="block aspect-[4/3] w-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                onClick={() => setViewing(image)}
                aria-label={`View ${image.title}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL from object storage */}
                <img
                  src={image.url}
                  alt={image.title}
                  className="size-full object-cover"
                  loading="lazy"
                />
              </button>
              <figcaption className="truncate px-2 py-1 text-xs text-muted-foreground">
                {image.title}
              </figcaption>
              {canManage ? (
                <div className="absolute top-1 right-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="secondary"
                        size="icon-sm"
                        aria-label={`Remove ${image.title}`}
                      >
                        <Trash2 />
                      </Button>
                    }
                    title="Remove this image?"
                    confirmLabel="Remove"
                    destructive
                    onConfirm={() => remove(image)}
                  />
                </div>
              ) : null}
            </figure>
          ))}
        </div>
      )}
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogTitle>{viewing?.title}</DialogTitle>
          <DialogDescription className="sr-only">Project image</DialogDescription>
          {viewing ? (
            // eslint-disable-next-line @next/next/no-img-element -- presigned URL from object storage
            <img
              src={viewing.url}
              alt={viewing.title}
              className="max-h-[75svh] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
