"use client";

import { Loader2, MapPinned } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage, type ClientActionError } from "@/lib/action-result";
import { fromZonedInputValue } from "@/lib/date-range";

import { scheduleVisitAction, visitDialogOptionsAction } from "../actions";

type Options = NonNullable<Awaited<ReturnType<typeof visitDialogOptionsAction>>["data"]>;

/**
 * Plan a site visit or revisit (M08-03, M08-05): the project (the lead's interests first), when, pickup and who is
 * coming. The lead moves to Visit / Revisit and its executive gets a reminder.
 */
export function ScheduleVisitDialog({
  leadId,
  trigger,
  parentVisitId,
  projectId,
  onDone,
}: {
  leadId: string;
  trigger?: ReactNode;
  /** Plan a revisit of this completed visit. */
  parentVisitId?: string;
  /** Project chosen at first. */
  projectId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const format = useFormatters();
  const { timezone } = useRegionalSettings();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [project, setProject] = useState(projectId ?? "");
  const [when, setWhen] = useState("");
  const [pickup, setPickup] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");
  const [attendees, setAttendees] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    setOptions(null);
    setErrors({});
    setWhen("");
    setPickup(false);
    setPickupAddress("");
    setAttendees("");
    setNotes("");
    const result = await visitDialogOptionsAction({ leadId });
    const error = actionErrorMessage(result);
    if (error || !result?.data) {
      toast.error(error ?? "Could not open the visit form.");
      setOpen(false);
      return;
    }
    const data = result.data;
    setOptions(data);
    const interested = data.projects.filter((entry) => entry.interested);
    setProject(projectId ?? (interested.length === 1 ? interested[0]!.id : ""));
  }

  async function save() {
    const scheduledAt = fromZonedInputValue(when, timezone);
    const next: Record<string, string> = {};
    if (!project) next.projectId = "Choose the project";
    if (!scheduledAt) next.scheduledAt = "Choose when";
    if (Object.keys(next).length) return void setErrors(next);
    setBusy(true);
    const result = await scheduleVisitAction({
      values: {
        leadId,
        projectId: project,
        scheduledAt,
        pickupRequired: pickup,
        pickupAddress: pickup ? pickupAddress || null : null,
        attendees: attendees ? Number(attendees) : null,
        notes: notes || null,
        ...(parentVisitId ? { parentVisitId } : {}),
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
    toast.success(`${result?.data?.label ?? "Visit"} planned for ${format.dateTime(scheduledAt!)}`);
    setOpen(false);
    onDone?.();
    router.refresh();
  }

  const interested = options?.projects.filter((entry) => entry.interested) ?? [];
  const others = options?.projects.filter((entry) => !entry.interested) ?? [];
  const past = when
    ? (fromZonedInputValue(when, timezone) ?? "") < new Date().toISOString()
    : false;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (next) void load();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <MapPinned /> Schedule visit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{options ? `Plan ${options.nextLabel}` : "Plan a site visit"}</DialogTitle>
          <DialogDescription>
            {options
              ? `${options.lead.number} · ${options.lead.name} — a reminder goes to the lead's owner.`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>
        {!options ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form
            id="schedule-visit-form"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="visit-project">Project</Label>
              <Select
                value={project}
                onValueChange={(value) => {
                  setProject(value);
                  setErrors({});
                }}
              >
                <SelectTrigger
                  id="visit-project"
                  className="w-full"
                  aria-invalid={Boolean(errors.projectId)}
                >
                  <SelectValue placeholder="Choose the project" />
                </SelectTrigger>
                <SelectContent>
                  {interested.length ? (
                    <SelectGroup>
                      <SelectLabel>Interested in</SelectLabel>
                      {interested.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.name} · {entry.builderName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                  {others.length ? (
                    <SelectGroup>
                      <SelectLabel>Other projects</SelectLabel>
                      {others.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.name} · {entry.builderName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                </SelectContent>
              </Select>
              {errors.projectId ? (
                <p className="text-sm text-destructive">{errors.projectId}</p>
              ) : project && !interested.some((entry) => entry.id === project) ? (
                <p className="text-xs text-muted-foreground">
                  The project will be added to the lead&apos;s interests.
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="visit-when">When</Label>
              <DuePicker
                id="visit-when"
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
              ) : past ? (
                <p className="text-xs text-muted-foreground">
                  This time has passed: record the visit, then its outcome.
                </p>
              ) : null}
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="visit-pickup" className="font-normal">
                  Pickup needed
                </Label>
                <Switch id="visit-pickup" checked={pickup} onCheckedChange={setPickup} />
              </div>
              {pickup ? (
                <Input
                  aria-label="Pickup address"
                  placeholder="Where to pick them up"
                  maxLength={300}
                  value={pickupAddress}
                  onChange={(event) => setPickupAddress(event.target.value)}
                />
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="visit-attendees">People coming</Label>
                <Input
                  id="visit-attendees"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  value={attendees}
                  onChange={(event) => setAttendees(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="visit-notes">Notes</Label>
                <Textarea
                  id="visit-notes"
                  rows={2}
                  maxLength={1000}
                  value={notes}
                  placeholder="Wants to see the sample flat, coming with family…"
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </div>
          </form>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="schedule-visit-form" disabled={busy || !options}>
            {busy ? "Saving…" : "Plan visit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
