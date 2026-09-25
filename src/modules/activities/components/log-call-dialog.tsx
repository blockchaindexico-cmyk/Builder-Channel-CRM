"use client";

import { Loader2, Phone, PhoneCall } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { ChoiceChips } from "@/components/shared/choice-chips";
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
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage, type ClientActionError } from "@/lib/action-result";
import { fromZonedInputValue, toZonedInputValue } from "@/lib/date-range";
import { LeadStatusExtraFields } from "@/modules/leads/client";

import { activityDialogOptionsAction, logCallAction } from "../actions";
import { suggestStatusAfterCall } from "../status-rules";
import { emptyFollowUp, type FollowUpDraft, FollowUpFields } from "./follow-up-fields";

const KEEP = "__keep__";
type Options = NonNullable<Awaited<ReturnType<typeof activityDialogOptionsAction>>["data"]>;
type Outcome = Options["outcomes"][number];
type NextKind = "NONE" | "FOLLOW_UP" | "CALLBACK";

/**
 * "Log call" (M07-04, M07-05): outcome, notes, the status it leads to (pre-selected by the automation rules), the
 * follow-up it took care of and the next step — saved together, so a call is handled in a few clicks.
 */
export function LogCallDialog({ leadId, trigger }: { leadId: string; trigger?: ReactNode }) {
  const router = useRouter();
  const format = useFormatters();
  const { timezone } = useRegionalSettings();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [direction, setDirection] = useState<"OUTBOUND" | "INBOUND">("OUTBOUND");
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [statusKey, setStatusKey] = useState<string>(KEEP);
  const [statusTouched, setStatusTouched] = useState(false);
  const [reason, setReason] = useState("");
  const [statusDetails, setStatusDetails] = useState<
    Record<string, string | number | boolean | null>
  >({});
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [nextKind, setNextKind] = useState<NextKind>("NONE");
  const [next, setNext] = useState<FollowUpDraft>(emptyFollowUp());

  async function load() {
    setOptions(null);
    setErrors({});
    const result = await activityDialogOptionsAction({ leadId });
    const error = actionErrorMessage(result);
    if (error || !result?.data) {
      toast.error(error ?? "Could not open the call form.");
      setOpen(false);
      return;
    }
    const data = result.data;
    setOptions(data);
    setDirection("OUTBOUND");
    setOutcomeId(null);
    setMinutes("");
    setSeconds("");
    setStartedAt(null);
    setNotes("");
    setStatusKey(KEEP);
    setStatusTouched(false);
    setReason("");
    setStatusDetails({});
    const soon = data.openFollowUps.find(
      (followUp) => new Date(followUp.dueAt).getTime() < Date.now() + 12 * 3600 * 1000,
    );
    setCompleteId(soon?.id ?? null);
    setNextKind("NONE");
    setNext(emptyFollowUp());
  }

  const outcome: Outcome | undefined = options?.outcomes.find((entry) => entry.id === outcomeId);

  function chooseOutcome(id: string) {
    setOutcomeId(id);
    const chosen = options?.outcomes.find((entry) => entry.id === id);
    if (!chosen || !options) return;
    if (!statusTouched) {
      const suggested = suggestStatusAfterCall(
        options.lead.statusCategory
          ? {
              statusKey: options.lead.statusKey,
              statusCategory: options.lead.statusCategory,
              isTerminal: options.lead.isTerminal,
              callAttempts: options.lead.callAttempts,
            }
          : { statusKey: "", statusCategory: "", isTerminal: true, callAttempts: 0 },
        chosen,
        options.unresponsiveAfterAttempts,
      );
      setStatusKey(
        suggested && options.statuses.some((status) => status.key === suggested) ? suggested : KEEP,
      );
      setStatusDetails({});
    }
    if (options.canManageFollowUps) {
      const kind: NextKind = chosen.requiresNextAction
        ? (chosen.nextActionType ?? "FOLLOW_UP")
        : "NONE";
      setNextKind(kind);
      if (kind !== "NONE") setNext((current) => ({ ...current, type: kind }));
    }
  }

  const chosenStatus = options?.statuses.find((status) => status.key === statusKey);
  const closesLead = chosenStatus?.isTerminal ?? false;

  async function save() {
    if (!options || !outcomeId) {
      setErrors({ outcomeId: "Choose how the call went" });
      return;
    }
    const durationSeconds = (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
    let nextValue: Record<string, unknown> | null = null;
    if (nextKind !== "NONE") {
      const dueAt = fromZonedInputValue(next.due, timezone);
      if (!dueAt) {
        setErrors({ dueAt: "Choose when" });
        return;
      }
      nextValue = {
        type: nextKind,
        dueAt,
        purposeId: next.purposeId || null,
        notes: next.notes || null,
      };
    }
    setBusy(true);
    const result = await logCallAction({
      values: {
        leadId,
        direction,
        outcomeId,
        durationSeconds,
        ...(startedAt ? { startedAt: fromZonedInputValue(startedAt, timezone) } : {}),
        notes: notes || null,
        statusKey: statusKey === KEEP ? null : statusKey,
        statusReason: reason || null,
        statusDetails: statusKey === KEEP ? {} : statusDetails,
        completeFollowUpId: completeId,
        next: nextValue,
      },
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
    const data = result?.data;
    toast.success(
      [
        "Call logged",
        data?.status ? `status: ${data.status.to}` : null,
        data?.completedFollowUpId ? "follow-up done" : null,
        nextValue
          ? `${nextKind === "CALLBACK" ? "callback" : "follow-up"} ${format.dateTime(nextValue.dueAt as string)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    setOpen(false);
    router.refresh();
  }

  const reached = options?.outcomes.filter((entry) => entry.connected) ?? [];
  const notReached = options?.outcomes.filter((entry) => !entry.connected) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <PhoneCall /> Log call
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Log call</DialogTitle>
          <DialogDescription>
            {options
              ? `${options.lead.number} · ${options.lead.name} — now ${options.lead.statusLabel}`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>
        {!options ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form
            id="log-call-form"
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {options.lead.dialHref ? (
              <Button asChild variant="secondary" className="w-full">
                <a href={options.lead.dialHref}>
                  <Phone /> Call {options.lead.mobile}
                </a>
              </Button>
            ) : null}
            <ChoiceChips
              name="direction"
              legend="Call"
              value={direction}
              onChange={setDirection}
              options={[
                { value: "OUTBOUND", label: "Outgoing" },
                { value: "INBOUND", label: "Incoming" },
              ]}
            />
            <div className="space-y-3">
              <ChoiceChips
                name="outcome-reached"
                legend="Customer reached"
                value={outcome?.connected ? outcomeId : null}
                onChange={chooseOutcome}
                options={reached.map((entry) => ({
                  value: entry.id,
                  label: entry.label,
                  tone:
                    entry.category === "INTERESTED" || entry.category === "POSITIVE"
                      ? "positive"
                      : entry.category === "NEGATIVE" || entry.category === "NOT_INTERESTED"
                        ? "negative"
                        : "neutral",
                }))}
              />
              <ChoiceChips
                name="outcome-not-reached"
                legend="Not reached"
                value={outcome && !outcome.connected ? outcomeId : null}
                onChange={chooseOutcome}
                options={notReached.map((entry) => ({ value: entry.id, label: entry.label }))}
              />
              {errors.outcomeId ? (
                <p className="text-sm text-destructive">{errors.outcomeId}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="call-minutes">Duration</Label>
                <div className="flex items-center gap-1.5 text-sm">
                  <Input
                    id="call-minutes"
                    aria-label="Minutes"
                    inputMode="numeric"
                    className="h-8 w-16"
                    value={minutes}
                    onChange={(event) =>
                      setMinutes(event.target.value.replace(/\D/g, "").slice(0, 3))
                    }
                  />
                  min
                  <Input
                    aria-label="Seconds"
                    inputMode="numeric"
                    className="h-8 w-16"
                    value={seconds}
                    onChange={(event) =>
                      setSeconds(event.target.value.replace(/\D/g, "").slice(0, 2))
                    }
                  />
                  s
                </div>
              </div>
              {startedAt === null ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-8 px-0"
                  onClick={() => setStartedAt(toZonedInputValue(new Date(), timezone))}
                >
                  The call was earlier?
                </Button>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="call-started">Call time</Label>
                  <Input
                    id="call-started"
                    type="datetime-local"
                    className="h-8"
                    value={startedAt}
                    onChange={(event) => setStartedAt(event.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="call-notes">Notes</Label>
              <Textarea
                id="call-notes"
                rows={3}
                maxLength={2000}
                value={notes}
                placeholder="What did the customer say?"
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            {options.openFollowUps.length > 0 && options.canManageFollowUps ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">This call took care of</p>
                {options.openFollowUps.map((followUp) => (
                  <label key={followUp.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={completeId === followUp.id}
                      onCheckedChange={(checked) =>
                        setCompleteId(checked === true ? followUp.id : null)
                      }
                    />
                    {followUp.type === "CALLBACK" ? "Callback" : "Follow-up"} due{" "}
                    {format.dateTime(followUp.dueAt)}
                    {followUp.purpose ? ` · ${followUp.purpose}` : ""}
                    {followUp.status === "MISSED" ? " (missed)" : ""}
                  </label>
                ))}
              </div>
            ) : null}
            {options.statuses.length > 0 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="call-status">Lead status</Label>
                <Select
                  value={statusKey}
                  onValueChange={(value) => {
                    setStatusKey(value);
                    setStatusTouched(true);
                    setStatusDetails({});
                  }}
                >
                  <SelectTrigger id="call-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={KEEP}>Keep “{options.lead.statusLabel}”</SelectItem>
                    {options.statuses
                      .filter((status) => status.key !== options.lead.statusKey)
                      .map((status) => (
                        <SelectItem key={status.key} value={status.key}>
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: status.color }}
                            />
                            {status.label}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {statusKey !== KEEP && !statusTouched ? (
                  <p className="text-xs text-muted-foreground">Suggested from the call outcome.</p>
                ) : null}
                {chosenStatus ? (
                  <LeadStatusExtraFields
                    target={{
                      key: chosenStatus.key,
                      label: chosenStatus.label,
                      category: chosenStatus.category,
                      isTerminal: chosenStatus.isTerminal,
                    }}
                    current={{
                      key: options.lead.statusKey,
                      label: options.lead.statusLabel,
                      category: options.lead.statusCategory,
                      isTerminal: options.lead.isTerminal,
                    }}
                    details={statusDetails}
                    onChange={setStatusDetails}
                    disabled={busy}
                  />
                ) : null}
                {chosenStatus?.requiresReason ? (
                  <Textarea
                    aria-label="Reason for the status"
                    rows={2}
                    maxLength={500}
                    placeholder="Reason (required)"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                ) : null}
              </div>
            ) : null}
            {options.canManageFollowUps && !closesLead ? (
              <div className="space-y-3">
                <ChoiceChips
                  name="next-step"
                  legend="Next step"
                  value={nextKind}
                  onChange={(kind) => {
                    setNextKind(kind);
                    if (kind !== "NONE") setNext((current) => ({ ...current, type: kind }));
                  }}
                  options={[
                    { value: "NONE", label: "Nothing now" },
                    { value: "FOLLOW_UP", label: "Follow-up" },
                    { value: "CALLBACK", label: "Callback" },
                  ]}
                />
                {nextKind !== "NONE" ? (
                  <FollowUpFields
                    idPrefix="call-next"
                    value={next}
                    onChange={(value) => {
                      setNext(value);
                      setErrors((current) => ({ ...current, dueAt: "", next: "" }));
                    }}
                    purposes={options.purposes}
                    errors={errors}
                  />
                ) : null}
                {errors.next ? <p className="text-sm text-destructive">{errors.next}</p> : null}
              </div>
            ) : null}
          </form>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="log-call-form" disabled={busy || !options}>
            {busy ? "Saving…" : "Save call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
