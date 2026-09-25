"use client";

import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Asks for a reason before an action that is kept in the history (unlock, cancel, void). */
export function ReasonDialog({
  trigger,
  title,
  description,
  label = "Reason",
  confirmLabel,
  destructive,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  label?: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Returns true when done (the dialog closes). */
  onConfirm: (reason: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          id="reason-form"
          className="grid gap-1.5"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            const done = await onConfirm(reason.trim());
            setBusy(false);
            if (done) {
              setOpen(false);
              setReason("");
            }
          }}
        >
          <Label htmlFor="reason-text">{label}</Label>
          <Textarea
            id="reason-text"
            value={reason}
            maxLength={300}
            required
            minLength={3}
            onChange={(event) => setReason(event.target.value)}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Back
          </Button>
          <Button
            type="submit"
            form="reason-form"
            variant={destructive ? "destructive" : "default"}
            disabled={busy || reason.trim().length < 3}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
