"use client";

import { Camera, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-result";
import { initials } from "@/lib/utils";

import {
  completeAvatarUploadAction,
  removeAvatarAction,
  requestAvatarUploadAction,
} from "../../actions";
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from "../../schemas";

type AvatarType = (typeof AVATAR_TYPES)[number];

/** Profile photo: presigned upload straight to object storage, then confirmation (M02-15). */
export function AvatarUploader({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!AVATAR_TYPES.includes(file.type as AvatarType)) {
      toast.error("Please choose a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("The photo must be 2 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const requested = await requestAvatarUploadAction({
        fileName: file.name,
        contentType: file.type as AvatarType,
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
      if (!response.ok) throw new Error("The photo could not be uploaded to storage.");

      const completeError = actionErrorMessage(await completeAvatarUploadAction({ fileId }));
      if (completeError) throw new Error(completeError);
      toast.success("Profile photo updated");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    const error = actionErrorMessage(await removeAvatarAction());
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success("Profile photo removed");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
      <Avatar className="size-20 text-xl">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} className="object-cover" /> : null}
        <AvatarFallback className="bg-primary/10 text-primary">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col items-center gap-2 sm:items-start">
        <div className="flex flex-wrap justify-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_TYPES.join(",")}
            className="hidden"
            data-testid="avatar-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Camera />}
            {avatarUrl ? "Change photo" : "Upload photo"}
          </Button>
          {avatarUrl ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" size="sm" disabled={busy}>
                  <Trash2 /> Remove
                </Button>
              }
              title="Remove your profile photo?"
              description="Your initials are shown instead."
              confirmLabel="Remove photo"
              destructive
              onConfirm={remove}
            />
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 2 MB.</p>
      </div>
    </div>
  );
}
