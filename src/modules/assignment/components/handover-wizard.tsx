"use client";

import { Loader2, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/action-result";
import { plural } from "@/lib/utils";

import { assignOptionsAction, handOverAndDeactivateAction } from "../actions";
import { MIN_REASON_LENGTH } from "../constants";
import type { AssignableMember } from "../server/assign";

/** Hands a leaving member's open leads to colleagues (in turn) or the queue, then deactivates them (M05-09). */
export function HandoverWizard({
  membershipId,
  name,
  openLeads,
}: {
  membershipId: string;
  name: string;
  openLeads: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<AssignableMember[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [reason, setReason] = useState("Left the company");

  async function load() {
    setLoading(true);
    const result = await assignOptionsAction({ purpose: "reassign" });
    setLoading(false);
    const error = actionErrorMessage(result);
    if (error || !result?.data) return void toast.error(error ?? "Could not load the team.");
    setMembers(result.data.members.filter((member) => member.membershipId !== membershipId));
  }

  async function save() {
    setBusy(true);
    const result = await handOverAndDeactivateAction({ membershipId, assigneeIds: chosen, reason });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error || !result?.data) return void toast.error(error ?? "The handover failed.");
    const { assigned, unassigned, skipped, deactivated } = result.data;
    if (!deactivated) {
      toast.error(
        `${plural(skipped.length, "lead")} could not be moved (${skipped[0]?.reason}). ${name} stays active.`,
      );
    } else {
      toast.success(
        `${plural(assigned + unassigned, "lead")} handed over; ${name} is deactivated.`,
      );
      setOpen(false);
    }
    router.refresh();
  }

  const toggle = (id: string, on: boolean) =>
    setChosen((current) => (on ? [...current, id] : current.filter((entry) => entry !== id)));

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
        <Button variant="outline">
          <UserMinus /> Hand over leads &amp; deactivate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hand over {name}&apos;s leads</DialogTitle>
          <DialogDescription>
            {name} owns {plural(openLeads, "open lead")}. Choose who takes them over — several
            people share them in turn. Choose nobody to put them back in the unassigned queue.{" "}
            {name} is deactivated afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">New owners</legend>
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading the team…
              </p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {members.map((member) => (
                  <label
                    key={member.membershipId}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="flex items-center gap-2">
                      <Checkbox
                        checked={chosen.includes(member.membershipId)}
                        onCheckedChange={(checked) => toggle(member.membershipId, checked === true)}
                        aria-label={member.name}
                      />
                      {member.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{member.openLeads} open</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {chosen.length === 0
                ? "No one chosen: the leads go to the unassigned queue."
                : chosen.length === 1
                  ? "All leads go to this person."
                  : `About ${plural(Math.ceil(openLeads / chosen.length), "lead")} each.`}
            </p>
          </fieldset>
          <div className="grid gap-2">
            <Label htmlFor="handover-reason">Reason (kept in each lead&apos;s history)</Label>
            <Textarea
              id="handover-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy || loading || reason.trim().length < MIN_REASON_LENGTH}
            onClick={() => void save()}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            Hand over &amp; deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
