"use client";

import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { actionErrorMessage } from "@/lib/action-result";

import { completeLogoUploadAction, removeLogoAction, requestLogoUploadAction } from "../actions";
import { LOGO_MAX_BYTES, LOGO_TYPES } from "../schemas";

type LogoType = (typeof LOGO_TYPES)[number];

/**
 * Logo upload (M01-14 flow): request a presigned URL → upload directly to object storage → confirm.
 */
export function LogoUploader({ logoUrl, canEdit }: { logoUrl: string | null; canEdit: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!LOGO_TYPES.includes(file.type as LogoType)) {
      toast.error("Please choose a PNG, JPEG, WebP or SVG image.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("The logo must be 2 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const requested = await requestLogoUploadAction({
        fileName: file.name,
        contentType: file.type as LogoType,
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

      const completed = await completeLogoUploadAction({ fileId });
      const completeError = actionErrorMessage(completed);
      if (completeError) throw new Error(completeError);

      toast.success("Logo updated");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    const result = await removeLogoAction();
    const error = actionErrorMessage(result);
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success("Logo removed");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
        <CardDescription>
          PNG, JPEG, WebP or SVG, up to 2 MB. Shown in the sidebar and on e-mails.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- presigned URL from object storage
            <img src={logoUrl} alt="Organization logo" className="size-full object-contain" />
          ) : (
            <ImageUp className="size-6 text-muted-foreground" />
          )}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={LOGO_TYPES.join(",")}
              className="hidden"
              data-testid="logo-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <ImageUp />}
              {logoUrl ? "Replace logo" : "Upload logo"}
            </Button>
            {logoUrl ? (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" disabled={busy}>
                    <Trash2 /> Remove
                  </Button>
                }
                title="Remove the logo?"
                description="The sidebar and e-mails will show the default icon instead."
                confirmLabel="Remove logo"
                destructive
                onConfirm={remove}
              />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
