"use client";

import { Ban, CalendarClock, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useFormatters, useRegionalSettings } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage, type ClientActionError } from "@/lib/action-result";
import { fromZonedInputValue } from "@/lib/date-range";

import {
  activityDialogOptionsAction,
  cancelFollowUpAction,
  completeFollowUpAction,
  rescheduleFollowUpAction,
} from "../actions";
import { DuePicker } from "./due-picker";
import { emptyFollowUp, type FollowUpDraft, FollowUpFields } from "./follow-up-fields";

export interface FollowUpTarget {
  id: string;
  type: "FOLLOW_UP" | "CALLBACK";
  dueAt: string;
  lead: { id: string; number: string; name: string };
}

type Mode = "done" | "reschedule" | "cancel" | null;

const fieldErrors = (result: { serverError?: unknown } | undefined) =>
  Object.fromEntries(
    Object.entries((result?.serverError as ClientActionError | undefined)?.fieldErrors ?? {}).map(
      ([key, list]) => [key, list[0] ?? ""],
    ),
  );

/** Done / Move / Cancel for an open follow-up or callback (M07-11), used on the lead page, agenda and board. */
export function FollowUpActions({
  followUp,
  compact = false,
}: {
  followUp: FollowUpTarget;
  compact?: boolean;
}) {
  const router = useRouter();
  const format = useFormatters();
  const { timezone } = useRegionalSettings();
  const [mode, setMode] = useState<Mode>(null);
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [reason, setReason] = useState("");
  const [withNext, setWithNext] = useState(false);
  const [next, setNext] = useState<FollowUpDraft>(emptyFollowUp(followUp.type));
  const [purposes, setPurposes] = useState<{ id: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const label = followUp.type === "CALLBACK" ? "callback" : "follow-up";

  function openAs(next: Mode) {
    setMode(next);
    setNotes("");
    setDue("");
    setReason("");
    setWithNext(false);
    setNext(emptyFollowUp(followUp.type));
    setErrors({});
    if (next === "done") {
      void activityDialogOptionsAction({ leadId: followUp.lead.id }).then((result) =>
        setPurposes(result?.data?.purposes ?? []),
      );
    }
  }

  async function submit() {
    setBusy(true);
    let result;
    if (mode === "done") {
      let nextValue: Record<string, unknown> | null = null;
      if (withNext) {
        const dueAt = fromZonedInputValue(next.due, timezone);
        if (!dueAt) {
          setBusy(false);
          setErrors({ dueAt: "Choose when" });
          return;
        }
        nextValue = {
          type: next.type,
          dueAt,
          purposeId: next.purposeId || null,
          notes: next.notes || null,
        };
      }
      result = await completeFollowUpAction({
        leadId: followUp.lead.id,
        values: { followUpId: followUp.id, notes: notes || null, next: nextValue },
      });
    } else if (mode === "reschedule") {
      const dueAt = fromZonedInputValue(due, timezone);
      if (!dueAt) {
        setBusy(false);
        setErrors({ dueAt: "Choose the new time" });
        return;
      }
      result = await rescheduleFollowUpAction({
        leadId: followUp.lead.id,
        values: { followUpId: followUp.id, dueAt, notes: notes || null },
      });
    } else {
      result = await cancelFollowUpAction({
        leadId: followUp.lead.id,
        values: { followUpId: followUp.id, reason },
      });
    }
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) {
      setErrors(fieldErrors(result));
      toast.error(error);
      return;
    }
    toast.success(
      mode === "done"
        ? `${label[0]!.toUpperCase()}${label.slice(1)} done`
        : mode === "reschedule"
          ? `Moved to ${format.dateTime(fromZonedInputValue(due, timezone)!)}`
          : `${label[0]!.toUpperCase()}${label.slice(1)} cancelled`,
    );
    setMode(null);
    router.refresh();
  }

  const who = `${followUp.lead.number} · ${followUp.lead.name}`;
  return (
    <>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openAs("done")}>
          <Check /> {compact ? "Done" : `Mark done`}
          <span className="sr-only">
            : {label} {who}
          </span>
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openAs("reschedule")}>
          <CalendarClock /> Move
          <span className="sr-only">
            : {label} {who}
          </span>
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openAs("cancel")}>
          <Ban /> Cancel
          <span className="sr-only">
            : {label} {who}
          </span>
        </Button>
      </div>
      <Dialog open={mode !== null} onOpenChange={(open) => (!open ? setMode(null) : undefined)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {mode === "done"
                ? `Mark ${label} done`
                : mode === "reschedule"
                  ? `Move ${label}`
                  : `Cancel ${label}`}
            </DialogTitle>
            <DialogDescription>
              {who} — due {format.dateTime(followUp.dueAt)}
            </DialogDescription>
          </DialogHeader>
          <form
            id={`follow-up-${followUp.id}-form`}
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {mode === "reschedule" ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`move-${followUp.id}`}>New time</Label>
                <DuePicker
                  id={`move-${followUp.id}`}
                  value={due}
                  onChange={(value) => {
                    setDue(value);
                    setErrors({});
                  }}
                  invalid={Boolean(errors.dueAt)}
                />
                {errors.dueAt ? <p className="text-sm text-destructive">{errors.dueAt}</p> : null}
              </div>
            ) : null}
            {mode === "cancel" ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`cancel-${followUp.id}`}>Why is it cancelled?</Label>
                <Textarea
                  id={`cancel-${followUp.id}`}
                  rows={2}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-invalid={Boolean(errors.reason)}
                />
                {errors.reason ? <p className="text-sm text-destructive">{errors.reason}</p> : null}
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor={`notes-${followUp.id}`}>
                  {mode === "done" ? "What happened?" : "Note"}
                </Label>
                <Textarea
                  id={`notes-${followUp.id}`}
                  rows={2}
                  maxLength={1000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            )}
            {mode === "done" ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={withNext}
                    onCheckedChange={(checked) => setWithNext(checked === true)}
                  />
                  Schedule the next one
                </label>
                {withNext ? (
                  <FollowUpFields
                    idPrefix={`next-${followUp.id}`}
                    value={next}
                    onChange={(value) => {
                      setNext(value);
                      setErrors({});
                    }}
                    purposes={purposes}
                    errors={errors}
                  />
                ) : null}
              </div>
            ) : null}
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>
              Back
            </Button>
            <Button
              type="submit"
              form={`follow-up-${followUp.id}-form`}
              variant={mode === "cancel" ? "destructive" : "default"}
              disabled={busy}
            >
              {busy
                ? "Saving…"
                : mode === "done"
                  ? "Mark done"
                  : mode === "reschedule"
                    ? "Move"
                    : `Cancel ${label}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
