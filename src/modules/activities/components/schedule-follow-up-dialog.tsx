"use client";

import { CalendarPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { ChoiceChips } from "@/components/shared/choice-chips";
import { useFormatters, useRegionalSettings } from "@/components/shared/regional-settings";
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
import { actionErrorMessage, type ClientActionError } from "@/lib/action-result";
import { fromZonedInputValue } from "@/lib/date-range";

import { activityDialogOptionsAction, scheduleFollowUpAction } from "../actions";
import { emptyFollowUp, type FollowUpDraft, FollowUpFields } from "./follow-up-fields";

/** Schedule a follow-up or a customer-requested callback (M07-10). */
export function ScheduleFollowUpDialog({
  leadId,
  trigger,
}: {
  leadId: string;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const format = useFormatters();
  const { timezone } = useRegionalSettings();
  const [open, setOpen] = useState(false);
  const [purposes, setPurposes] = useState<{ id: string; label: string }[] | null>(null);
  const [lead, setLead] = useState<{ number: string; name: string } | null>(null);
  const [draft, setDraft] = useState<FollowUpDraft>(emptyFollowUp());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    setPurposes(null);
    setErrors({});
    setDraft(emptyFollowUp());
    const result = await activityDialogOptionsAction({ leadId });
    const error = actionErrorMessage(result);
    if (error || !result?.data) {
      toast.error(error ?? "Could not open the form.");
      setOpen(false);
      return;
    }
    setPurposes(result.data.purposes);
    setLead({ number: result.data.lead.number, name: result.data.lead.name });
  }

  async function save() {
    const dueAt = fromZonedInputValue(draft.due, timezone);
    if (!dueAt) {
      setErrors({ dueAt: "Choose when" });
      return;
    }
    setBusy(true);
    const result = await scheduleFollowUpAction({
      values: {
        leadId,
        type: draft.type,
        dueAt,
        purposeId: draft.purposeId || null,
        notes: draft.notes || null,
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
    toast.success(
      `${draft.type === "CALLBACK" ? "Callback" : "Follow-up"} scheduled for ${format.dateTime(dueAt)}`,
    );
    setOpen(false);
    router.refresh();
  }

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
            <CalendarPlus /> Schedule follow-up
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule follow-up</DialogTitle>
          <DialogDescription>
            {lead ? `${lead.number} · ${lead.name}` : "Loading…"} — a reminder goes to the
            lead&apos;s owner.
          </DialogDescription>
        </DialogHeader>
        {!purposes ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form
            id="schedule-follow-up-form"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <ChoiceChips
              name="follow-up-type"
              legend="Type"
              value={draft.type}
              onChange={(type) => setDraft({ ...draft, type })}
              options={[
                { value: "FOLLOW_UP", label: "Follow-up" },
                { value: "CALLBACK", label: "Callback requested by the customer" },
              ]}
            />
            <FollowUpFields
              idPrefix="schedule"
              value={draft}
              onChange={(value) => {
                setDraft(value);
                setErrors({});
              }}
              purposes={purposes}
              errors={errors}
            />
          </form>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="schedule-follow-up-form" disabled={busy || !purposes}>
            {busy ? "Saving…" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
