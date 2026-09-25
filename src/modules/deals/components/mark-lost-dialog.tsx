"use client";

import { CircleSlash } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { ChoiceChips } from "@/components/shared/choice-chips";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage, type ClientActionError } from "@/lib/action-result";

import { lossReasonOptionsAction, markLostAction } from "../actions";

type Outcome = "LOST" | "NOT_INTERESTED";

/** Close a lead as Lost or Not Interested with its reason and a note (M08-11). */
export function MarkLostDialog({
  lead,
  trigger,
  initial = "LOST",
  onDone,
  open: controlledOpen,
  onOpenChange,
}: {
  lead: { id: string; number: string; name: string };
  /** `null` renders no trigger: the dialog is opened through `open` (e.g. from a menu). */
  trigger?: ReactNode | null;
  initial?: Outcome;
  onDone?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [outcome, setOutcome] = useState<Outcome>(initial);
  const [reasons, setReasons] = useState<{ id: string; label: string }[] | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [shownFor, setShownFor] = useState(false);
  if (open !== shownFor) {
    // Opening starts a fresh form (state adjusted while rendering, not in an effect).
    setShownFor(open);
    if (open) {
      setOutcome(initial);
      setReasons(null);
      setReasonId("");
      setNotes("");
      setErrors({});
    }
  }

  useEffect(() => {
    if (!open) return;
    let active = true;
    void lossReasonOptionsAction({ scope: outcome }).then((result) => {
      if (active) setReasons(result?.data ?? []);
    });
    return () => {
      active = false;
    };
  }, [open, outcome]);

  async function save() {
    const next: Record<string, string> = {};
    if (!reasonId) next.lossReasonId = "Choose a reason";
    if (notes.trim().length < 3) next.notes = "Add a short note";
    if (Object.keys(next).length) return void setErrors(next);
    setBusy(true);
    const result = await markLostAction({
      leadId: lead.id,
      statusKey: outcome,
      lossReasonId: reasonId,
      notes,
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) {
      const fields = (result?.serverError as ClientActionError | undefined)?.fieldErrors ?? {};
      setErrors(
        Object.fromEntries(Object.entries(fields).map(([key, list]) => [key, list[0] ?? ""])),
      );
      toast.error(error);
      return;
    }
    toast.success(`${lead.number} closed as ${result?.data?.status ?? "lost"}`);
    setOpen(false);
    onDone?.();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
      }}
    >
      {trigger === null ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="outline" className="text-destructive hover:text-destructive">
              <CircleSlash /> Mark lost
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Close this lead</DialogTitle>
          <DialogDescription>
            {lead.number} · {lead.name} — upcoming visits are cancelled. A manager can reopen it
            later.
          </DialogDescription>
        </DialogHeader>
        <form
          id="mark-lost-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <ChoiceChips
            name="close-as"
            legend="Close as"
            value={outcome}
            onChange={(value) => {
              setOutcome(value);
              setReasons(null);
              setReasonId("");
            }}
            options={[
              { value: "LOST", label: "Lost", tone: "negative" },
              { value: "NOT_INTERESTED", label: "Not interested", tone: "negative" },
            ]}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="mark-lost-reason">Reason</Label>
            <Select
              value={reasonId}
              onValueChange={(value) => {
                setReasonId(value);
                setErrors({});
              }}
              disabled={!reasons}
            >
              <SelectTrigger
                id="mark-lost-reason"
                className="w-full"
                aria-invalid={Boolean(errors.lossReasonId)}
              >
                <SelectValue placeholder={reasons ? "Why?" : "Loading…"} />
              </SelectTrigger>
              <SelectContent>
                {(reasons ?? []).map((reason) => (
                  <SelectItem key={reason.id} value={reason.id}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.lossReasonId ? (
              <p className="text-sm text-destructive">{errors.lossReasonId}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mark-lost-notes">Note</Label>
            <Textarea
              id="mark-lost-notes"
              rows={3}
              maxLength={500}
              value={notes}
              placeholder="What exactly happened?"
              onChange={(event) => {
                setNotes(event.target.value);
                setErrors({});
              }}
              aria-invalid={Boolean(errors.notes)}
            />
            {errors.notes ? <p className="text-sm text-destructive">{errors.notes}</p> : null}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Back
          </Button>
          <Button type="submit" form="mark-lost-form" variant="destructive" disabled={busy}>
            {busy ? "Saving…" : outcome === "LOST" ? "Close as lost" : "Close as not interested"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
