"use client";

import { ArrowRight, Ban, Loader2, Pencil, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

import {
  cancelBookingAction,
  cancelBookingOptionsAction,
  closeBookingAction,
  moveBookingStageAction,
} from "../actions";

type Mode = "stage" | "close" | "cancel" | null;
type CancelOptions = NonNullable<Awaited<ReturnType<typeof cancelBookingOptionsAction>>["data"]>;

const fieldErrors = (result: { serverError?: unknown } | undefined) =>
  Object.fromEntries(
    Object.entries((result?.serverError as ClientActionError | undefined)?.fieldErrors ?? {}).map(
      ([key, list]) => [key, list[0] ?? ""],
    ),
  );

/**
 * Booking actions (M08-09, M08-10): edit, move to another stage, close as won, cancel with a reason — and decide
 * what happens to the lead.
 */
export function BookingActions({
  booking,
  stages,
  canManage,
  canClose,
}: {
  booking: {
    id: string;
    number: string;
    status: "ACTIVE" | "CLOSED_WON" | "CANCELLED";
    stageId: string | null;
  };
  stages: { id: string; label: string }[];
  canManage: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [stageId, setStageId] = useState("");
  const [note, setNote] = useState("");
  const [cancelOptions, setCancelOptions] = useState<CancelOptions | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [leadOutcome, setLeadOutcome] = useState<"LOST" | "ACTIVE">("LOST");
  const [statusKey, setStatusKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function openAs(next: Mode) {
    setMode(next);
    setNote("");
    setErrors({});
    const nextStage = stages[stages.findIndex((stage) => stage.id === booking.stageId) + 1];
    setStageId(nextStage?.id ?? "");
    if (next === "cancel") {
      setCancelOptions(null);
      setReasonId("");
      setLeadOutcome("LOST");
      void cancelBookingOptionsAction({ bookingId: booking.id }).then((result) => {
        const data = result?.data;
        if (!data) {
          toast.error(actionErrorMessage(result) ?? "Could not open the form.");
          setMode(null);
          return;
        }
        setCancelOptions(data);
        setStatusKey(data.defaultStatusKey);
      });
    }
  }

  async function submit() {
    let result;
    setBusy(true);
    if (mode === "stage") {
      result = await moveBookingStageAction({ bookingId: booking.id, stageId, note: note || null });
    } else if (mode === "close") {
      result = await closeBookingAction({ bookingId: booking.id, note: note || null });
    } else {
      result = await cancelBookingAction({
        bookingId: booking.id,
        reasonId,
        notes: note || null,
        leadOutcome,
        leadStatusKey: leadOutcome === "ACTIVE" ? statusKey : null,
      });
    }
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) {
      setErrors(fieldErrors(result));
      toast.error(error);
      return;
    }
    if (mode === "stage") {
      toast.success(
        `Booking ${booking.number} moved to ${(result?.data as { stage: string } | undefined)?.stage ?? "the new stage"}`,
      );
    } else if (mode === "close") {
      toast.success(`Booking ${booking.number} closed — deal won`);
    } else {
      const data = result?.data as { leadOutcome: string; leadStatus: string | null } | undefined;
      toast.success(
        `Booking ${booking.number} cancelled${data?.leadStatus ? ` · lead now ${data.leadStatus}` : ""}`,
      );
    }
    setMode(null);
    router.refresh();
  }

  const open = booking.status === "ACTIVE";
  const otherStages = stages.filter((stage) => stage.id !== booking.stageId);
  return (
    <>
      {canManage && booking.status !== "CANCELLED" ? (
        <Button asChild variant="outline">
          <Link href={`/bookings/${booking.id}/edit`}>
            <Pencil /> Edit
          </Link>
        </Button>
      ) : null}
      {canManage && open && otherStages.length ? (
        <Button variant="outline" onClick={() => openAs("stage")}>
          <ArrowRight /> Move stage
        </Button>
      ) : null}
      {canClose && open ? (
        <Button onClick={() => openAs("close")}>
          <Trophy /> Close as won
        </Button>
      ) : null}
      {canClose && booking.status !== "CANCELLED" ? (
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => openAs("cancel")}
        >
          <Ban /> Cancel booking
        </Button>
      ) : null}
      <Dialog
        open={mode !== null}
        onOpenChange={(next) => (!next && !busy ? setMode(null) : undefined)}
      >
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {mode === "stage"
                ? "Move to another stage"
                : mode === "close"
                  ? "Close as won"
                  : "Cancel booking"}
            </DialogTitle>
            <DialogDescription>
              Booking {booking.number}
              {mode === "close"
                ? " — the deal is done; the lead moves to Closed / Won."
                : mode === "cancel"
                  ? " — kept in the history with its reason."
                  : ""}
            </DialogDescription>
          </DialogHeader>
          {mode === "cancel" && !cancelOptions ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form
              id={`booking-${booking.id}-form`}
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {mode === "stage" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="booking-stage">Stage</Label>
                  <Select value={stageId} onValueChange={setStageId}>
                    <SelectTrigger id="booking-stage" className="w-full">
                      <SelectValue placeholder="Choose the stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherStages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {mode === "cancel" && cancelOptions ? (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="booking-cancel-reason">Why was it cancelled?</Label>
                    <Select
                      value={reasonId}
                      onValueChange={(value) => {
                        setReasonId(value);
                        setErrors({});
                      }}
                    >
                      <SelectTrigger
                        id="booking-cancel-reason"
                        className="w-full"
                        aria-invalid={Boolean(errors.reasonId)}
                      >
                        <SelectValue placeholder="Choose a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {cancelOptions.reasons.map((reason) => (
                          <SelectItem key={reason.id} value={reason.id}>
                            {reason.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.reasonId ? (
                      <p className="text-sm text-destructive">{errors.reasonId}</p>
                    ) : null}
                  </div>
                  {cancelOptions.otherBookings > 0 ? (
                    <p className="rounded-md bg-muted p-3 text-sm">
                      The lead has another booking, so its status stays as it is.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <ChoiceChips
                        name="booking-lead-outcome"
                        legend="And the lead?"
                        value={leadOutcome}
                        onChange={setLeadOutcome}
                        options={[
                          { value: "LOST", label: "Mark it lost", tone: "negative" },
                          { value: "ACTIVE", label: "Keep working it" },
                        ]}
                      />
                      {leadOutcome === "ACTIVE" ? (
                        <div className="grid gap-1.5">
                          <Label htmlFor="booking-lead-status">Lead status</Label>
                          <Select value={statusKey} onValueChange={setStatusKey}>
                            <SelectTrigger id="booking-lead-status" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {cancelOptions.statuses.map((status) => (
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
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          The cancellation reason becomes the lead&apos;s loss reason.
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="booking-note">{mode === "cancel" ? "Details" : "Note"}</Label>
                <Textarea
                  id="booking-note"
                  rows={2}
                  maxLength={mode === "cancel" ? 1000 : 500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>
              Back
            </Button>
            <Button
              type="submit"
              form={`booking-${booking.id}-form`}
              variant={mode === "cancel" ? "destructive" : "default"}
              disabled={
                busy ||
                (mode === "stage" && !stageId) ||
                (mode === "cancel" && (!cancelOptions || !reasonId))
              }
            >
              {busy
                ? "Saving…"
                : mode === "stage"
                  ? "Move"
                  : mode === "close"
                    ? "Close as won"
                    : "Cancel booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
