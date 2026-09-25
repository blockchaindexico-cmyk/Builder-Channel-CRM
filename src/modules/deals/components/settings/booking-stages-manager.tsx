"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { actionErrorMessage } from "@/lib/action-result";

import {
  deleteBookingStageAction,
  moveBookingStageOrderAction,
  saveBookingStageAction,
} from "../../actions";
import type { BookingStageRow } from "../../server/masters";

type Draft = { id: string | null; label: string; isActive: boolean };

/** The steps a booking goes through before it is closed as won (M08-09, Q-09). */
export function BookingStagesManager({ stages }: { stages: BookingStageRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    setBusy(true);
    const { id, ...values } = draft;
    const result = await saveBookingStageAction({ stageId: id, values });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(`Stage "${draft.label}" saved`);
    setDraft(null);
    router.refresh();
  }

  async function move(row: BookingStageRow, direction: "up" | "down") {
    const error = actionErrorMessage(
      await moveBookingStageOrderAction({ stageId: row.id, direction }),
    );
    if (error) return void toast.error(error);
    router.refresh();
  }

  async function remove(row: BookingStageRow) {
    const error = actionErrorMessage(await deleteBookingStageAction({ stageId: row.id }));
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`Stage "${row.label}" deleted`);
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        A new booking starts at the first active stage and moves through the others; “Closed / Won”
        and “Cancelled” always come last.
      </p>
      <ol className="divide-y rounded-lg border" aria-label="Booking stages">
        {stages.map((row, index) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-6 text-sm text-muted-foreground tabular-nums">{index + 1}.</span>
            <span className="flex-1 text-sm font-medium">
              {row.label} {!row.isActive ? <Badge variant="muted">Inactive</Badge> : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.usage} booking{row.usage === 1 ? "" : "s"}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={index === 0}
                aria-label={`Move ${row.label} up`}
                onClick={() => void move(row, "up")}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={index === stages.length - 1}
                aria-label={`Move ${row.label} down`}
                onClick={() => void move(row, "down")}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Edit ${row.label}`}
                onClick={() => setDraft({ id: row.id, label: row.label, isActive: row.isActive })}
              >
                <Pencil />
              </Button>
              <ConfirmDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Delete ${row.label}`}
                  >
                    <Trash2 />
                  </Button>
                }
                title={`Delete "${row.label}"?`}
                description="Only stages no booking uses can be deleted; deactivate the others."
                confirmLabel="Delete"
                destructive
                onConfirm={() => remove(row)}
              />
            </div>
          </li>
        ))}
        <li className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground">
          <span className="w-6" />
          Closed / Won
        </li>
      </ol>
      <Button onClick={() => setDraft({ id: null, label: "", isActive: true })}>
        <Plus /> Add stage
      </Button>

      <Dialog open={draft !== null} onOpenChange={(open) => (!open ? setDraft(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit stage" : "New stage"}</DialogTitle>
            <DialogDescription>
              New stages are added at the end; move them as needed.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <form
              id="booking-stage-form"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="booking-stage-label">Name</Label>
                <Input
                  id="booking-stage-label"
                  value={draft.label}
                  maxLength={60}
                  placeholder="Agreement signed, Registration done…"
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                />
              </div>
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(isActive) => setDraft({ ...draft, isActive })}
                />
                Used for bookings
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" form="booking-stage-form" disabled={busy}>
              {busy ? "Saving…" : "Save stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
