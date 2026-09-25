"use client";

import {
  Ban,
  CalendarClock,
  CalendarPlus,
  Check,
  CircleSlash,
  Loader2,
  MapPinned,
  ThumbsUp,
  Trophy,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ChoiceChips } from "@/components/shared/choice-chips";
import { DuePicker, visitPicks } from "@/components/shared/due-picker";
import { useFormatters, useRegionalSettings } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import type { VisitNextStep } from "@/generated/prisma/enums";
import { actionErrorMessage, type ClientActionError } from "@/lib/action-result";
import { fromZonedInputValue } from "@/lib/date-range";
import { ScheduleFollowUpDialog } from "@/modules/activities/client";

import {
  cancelVisitAction,
  completeVisitAction,
  confirmVisitAction,
  noShowVisitAction,
  rescheduleVisitAction,
  visitDialogOptionsAction,
} from "../actions";
import { MarkLostDialog } from "./mark-lost-dialog";
import { ScheduleVisitDialog } from "./schedule-visit-dialog";

export interface VisitTarget {
  id: string;
  label: string;
  status: string;
  scheduledAt: string;
  assignedToId: string | null;
  project: { id: string; name: string };
  lead: { id: string; number: string; name: string };
}

/** What the person may do next after a visit (UI hints; the server checks again). */
export interface VisitAbilities {
  canBook: boolean;
  canMarkLost: boolean;
  canFollowUp: boolean;
}

type Mode = "done" | "next" | "no-show" | "move" | "cancel" | null;
type Options = NonNullable<Awaited<ReturnType<typeof visitDialogOptionsAction>>["data"]>;

const fieldErrors = (result: { serverError?: unknown } | undefined) =>
  Object.fromEntries(
    Object.entries((result?.serverError as ClientActionError | undefined)?.fieldErrors ?? {}).map(
      ([key, list]) => [key, list[0] ?? ""],
    ),
  );

/**
 * Confirm / Done / No-show / Move / Cancel for an open visit (M08-04). "Done" records the outcome, the customer's
 * feedback and who went, then offers the next step the outcome suggests (revisit, follow-up, booking, close).
 */
export function VisitActions({
  visit,
  abilities,
  now,
}: {
  visit: VisitTarget;
  abilities: VisitAbilities;
  /** Rendering time from the server (a visit in the past can be a no-show). */
  now: string;
}) {
  const router = useRouter();
  const format = useFormatters();
  const { timezone } = useRegionalSettings();
  const [mode, setMode] = useState<Mode>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const [conductedById, setConductedById] = useState("");
  const [text, setText] = useState("");
  const [when, setWhen] = useState("");
  const [nextStep, setNextStep] = useState<VisitNextStep | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const started = new Date(visit.scheduledAt).getTime() <= new Date(now).getTime();

  function openAs(next: Mode) {
    setMode(next);
    setText("");
    setWhen("");
    setOutcomeId(null);
    setErrors({});
    if (next === "done") {
      setOptions(null);
      void visitDialogOptionsAction({ leadId: visit.lead.id }).then((result) => {
        const data = result?.data;
        if (!data) {
          toast.error(actionErrorMessage(result) ?? "Could not open the form.");
          setMode(null);
          return;
        }
        setOptions(data);
        setConductedById(
          visit.assignedToId && data.members.some((member) => member.id === visit.assignedToId)
            ? visit.assignedToId
            : "",
        );
      });
    }
  }

  async function confirm() {
    setBusy(true);
    const result = await confirmVisitAction({ leadId: visit.lead.id, visitId: visit.id });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(`${visit.label} confirmed`);
    router.refresh();
  }

  async function submit() {
    let result;
    if (mode === "done") {
      if (!outcomeId) return void setErrors({ outcomeId: "Choose how the visit went" });
      setBusy(true);
      result = await completeVisitAction({
        leadId: visit.lead.id,
        values: {
          visitId: visit.id,
          outcomeId,
          feedback: text || null,
          conductedById: conductedById || null,
        },
      });
    } else if (mode === "move") {
      const scheduledAt = fromZonedInputValue(when, timezone);
      if (!scheduledAt) return void setErrors({ scheduledAt: "Choose the new time" });
      setBusy(true);
      result = await rescheduleVisitAction({
        leadId: visit.lead.id,
        values: { visitId: visit.id, scheduledAt, notes: text || null },
      });
    } else if (mode === "no-show") {
      setBusy(true);
      result = await noShowVisitAction({
        leadId: visit.lead.id,
        values: { visitId: visit.id, notes: text || null },
      });
    } else {
      setBusy(true);
      result = await cancelVisitAction({
        leadId: visit.lead.id,
        values: { visitId: visit.id, reason: text },
      });
    }
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) {
      setErrors(fieldErrors(result));
      toast.error(error);
      return;
    }
    router.refresh();
    if (mode === "done") {
      toast.success(`${visit.label} recorded`);
      setNextStep(
        (result?.data as { nextStep?: VisitNextStep | null } | undefined)?.nextStep ?? null,
      );
      setMode("next");
      return;
    }
    toast.success(
      mode === "move"
        ? `${visit.label} moved to ${format.dateTime(fromZonedInputValue(when, timezone)!)}`
        : mode === "no-show"
          ? `${visit.label} marked as a no-show`
          : `${visit.label} cancelled`,
    );
    setMode(null);
  }

  const who = `${visit.label} of ${visit.lead.number} · ${visit.lead.name}`;
  const close = () => setMode(null);
  const title = {
    done: `How did ${visit.label.toLowerCase()} go?`,
    next: "What's next?",
    "no-show": "The customer did not come",
    move: `Move ${visit.label.toLowerCase()}`,
    cancel: `Cancel ${visit.label.toLowerCase()}`,
  } as const;

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {visit.status === "SCHEDULED" && !started ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            disabled={busy}
            title="The customer confirmed they are coming"
            onClick={() => void confirm()}
          >
            <ThumbsUp /> Confirm
            <span className="sr-only">: {who}</span>
          </Button>
        ) : null}
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openAs("done")}>
          <Check /> Done
          <span className="sr-only">: {who}</span>
        </Button>
        {started ? (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openAs("no-show")}>
            <UserX /> No-show
            <span className="sr-only">: {who}</span>
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openAs("move")}>
          <CalendarClock /> Move
          <span className="sr-only">: {who}</span>
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openAs("cancel")}>
          <Ban /> Cancel
          <span className="sr-only">: {who}</span>
        </Button>
      </div>
      <Dialog open={mode !== null} onOpenChange={(open) => (!open && !busy ? close() : undefined)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{mode ? title[mode] : ""}</DialogTitle>
            <DialogDescription>
              {visit.lead.number} · {visit.lead.name} — {visit.project.name},{" "}
              {format.dateTime(visit.scheduledAt)}
            </DialogDescription>
          </DialogHeader>
          {mode === "next" ? (
            <NextSteps visit={visit} suggested={nextStep} abilities={abilities} onDone={close} />
          ) : mode === "done" && !options ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form
              id={`visit-${visit.id}-form`}
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {mode === "done" && options ? (
                <>
                  <ChoiceChips
                    name={`visit-outcome-${visit.id}`}
                    legend="Outcome"
                    value={outcomeId}
                    onChange={(value) => {
                      setOutcomeId(value);
                      setErrors({});
                    }}
                    options={options.outcomes.map((outcome) => ({
                      value: outcome.id,
                      label: outcome.label,
                      tone:
                        outcome.category === "NEGATIVE"
                          ? "negative"
                          : outcome.category === "NEUTRAL"
                            ? "neutral"
                            : "positive",
                    }))}
                  />
                  {errors.outcomeId ? (
                    <p className="text-sm text-destructive">{errors.outcomeId}</p>
                  ) : null}
                  {options.members.length > 1 ? (
                    <div className="grid gap-1.5">
                      <Label htmlFor={`visit-conductor-${visit.id}`}>Went with the customer</Label>
                      <Select value={conductedById} onValueChange={setConductedById}>
                        <SelectTrigger id={`visit-conductor-${visit.id}`} className="w-full">
                          <SelectValue placeholder="Me" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.members.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </>
              ) : null}
              {mode === "move" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor={`visit-move-${visit.id}`}>New time</Label>
                  <DuePicker
                    id={`visit-move-${visit.id}`}
                    value={when}
                    onChange={(value) => {
                      setWhen(value);
                      setErrors({});
                    }}
                    invalid={Boolean(errors.scheduledAt)}
                    picks={visitPicks}
                  />
                  {errors.scheduledAt ? (
                    <p className="text-sm text-destructive">{errors.scheduledAt}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor={`visit-text-${visit.id}`}>
                  {mode === "done"
                    ? "Customer's feedback"
                    : mode === "cancel"
                      ? "Why is it cancelled?"
                      : "Note"}
                </Label>
                <Textarea
                  id={`visit-text-${visit.id}`}
                  rows={mode === "done" ? 3 : 2}
                  maxLength={mode === "done" ? 2000 : 500}
                  value={text}
                  placeholder={
                    mode === "done"
                      ? "Liked the layout, worried about the possession date…"
                      : undefined
                  }
                  onChange={(event) => {
                    setText(event.target.value);
                    setErrors({});
                  }}
                  aria-invalid={Boolean(errors.reason)}
                />
                {errors.reason ? <p className="text-sm text-destructive">{errors.reason}</p> : null}
              </div>
            </form>
          )}
          {mode !== "next" ? (
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={busy}>
                Back
              </Button>
              <Button
                type="submit"
                form={`visit-${visit.id}-form`}
                variant={mode === "cancel" || mode === "no-show" ? "destructive" : "default"}
                disabled={busy || (mode === "done" && !options)}
              >
                {busy
                  ? "Saving…"
                  : mode === "done"
                    ? "Save outcome"
                    : mode === "move"
                      ? "Move"
                      : mode === "no-show"
                        ? "Mark no-show"
                        : "Cancel visit"}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The next-step prompt after a visit (M08-04): the suggested step first. */
function NextSteps({
  visit,
  suggested,
  abilities,
  onDone,
}: {
  visit: VisitTarget;
  suggested: VisitNextStep | null;
  abilities: VisitAbilities;
  onDone: () => void;
}) {
  const variant = (step: VisitNextStep) => (step === suggested ? "default" : "outline");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {suggested
          ? "The outcome suggests the highlighted step. Pick one, or close this for now."
          : "Plan what comes next, or close this for now."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ScheduleVisitDialog
          leadId={visit.lead.id}
          parentVisitId={visit.id}
          projectId={visit.project.id}
          onDone={onDone}
          trigger={
            <Button variant={variant("REVISIT")} className="justify-start">
              <MapPinned /> Plan a revisit
            </Button>
          }
        />
        {abilities.canFollowUp ? (
          <ScheduleFollowUpDialog
            leadId={visit.lead.id}
            trigger={
              <Button variant={variant("FOLLOW_UP")} className="justify-start">
                <CalendarPlus /> Schedule a follow-up
              </Button>
            }
          />
        ) : null}
        {abilities.canBook ? (
          <Button asChild variant={variant("BOOKING")} className="justify-start">
            <Link href={`/bookings/new?lead=${visit.lead.id}&visit=${visit.id}`}>
              <Trophy /> Convert to booking
            </Link>
          </Button>
        ) : null}
        {abilities.canMarkLost ? (
          <MarkLostDialog
            lead={visit.lead}
            onDone={onDone}
            trigger={
              <Button
                variant={variant("CLOSE")}
                className={
                  suggested === "CLOSE"
                    ? "justify-start"
                    : "justify-start text-destructive hover:text-destructive"
                }
              >
                <CircleSlash /> Close the lead
              </Button>
            }
          />
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Nothing now
        </Button>
      </DialogFooter>
    </div>
  );
}
