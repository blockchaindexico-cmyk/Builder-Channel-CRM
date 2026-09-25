"use client";

import { Loader2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { usePermissions } from "@/components/shared/permissions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/action-result";
import { plural } from "@/lib/utils";

import { assignOptionsAction, bulkAssignAction } from "../actions";
import { ASSIGNMENT_PERMISSIONS } from "../permissions";
import type { AssignableMember } from "../server/assign";

const NONE = "__none__";

/**
 * Bulk assign / reassign (M05-05) for the selected leads — contributed to the lead list's bulk bar. One person
 * gets all leads, several people share them in turn. Leads that already have an owner need the reason.
 */
export function BulkAssignAction({ leadIds, onDone }: { leadIds: string[]; onDone: () => void }) {
  const router = useRouter();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<AssignableMember[]>([]);
  const [reasons, setReasons] = useState<{ id: string; label: string }[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [reasonId, setReasonId] = useState("");

  if (!can(ASSIGNMENT_PERMISSIONS.assign) && !can(ASSIGNMENT_PERMISSIONS.reassign)) return null;

  async function load() {
    setLoading(true);
    const result = await assignOptionsAction({
      purpose: can(ASSIGNMENT_PERMISSIONS.reassign) ? "reassign" : "assign",
    });
    setLoading(false);
    const error = actionErrorMessage(result);
    if (error || !result?.data) return void toast.error(error ?? "Could not load the team.");
    setMembers(result.data.members);
    setReasons(result.data.reasons);
  }

  async function save() {
    setBusy(true);
    const result = await bulkAssignAction({ leadIds, assigneeIds: chosen, reason, reasonId });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error || !result?.data) return void toast.error(error ?? "Nothing was assigned.");
    const { assigned, skipped } = result.data;
    if (skipped.length) {
      toast.warning(
        `${plural(assigned, "lead")} assigned, ${skipped.length} skipped — ${skipped[0]!.number ?? "a lead"}: ${skipped[0]!.reason}`,
      );
    } else {
      toast.success(`${plural(assigned, "lead")} assigned`);
    }
    setOpen(false);
    setChosen([]);
    setReason("");
    setReasonId("");
    onDone();
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
        <Button size="sm" variant="outline">
          <Users /> Assign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign {plural(leadIds.length, "lead")}</DialogTitle>
          <DialogDescription>
            Pick one person for all of them, or several to share them in turn.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Assign to</legend>
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading the team…
              </p>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody in your team can take leads.</p>
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
                      {member.isMe ? " (you)" : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">{member.openLeads} open</span>
                  </label>
                ))}
              </div>
            )}
            {chosen.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                About {plural(Math.ceil(leadIds.length / chosen.length), "lead")} each, in turn.
              </p>
            ) : null}
          </fieldset>
          {reasons.length ? (
            <div className="grid gap-2">
              <Label htmlFor="bulk-reason-category">Reason category</Label>
              <Select
                value={reasonId || NONE}
                onValueChange={(value) => setReasonId(value === NONE ? "" : value)}
              >
                <SelectTrigger id="bulk-reason-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No category</SelectItem>
                  {reasons.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="bulk-reason">
              Reason (required for leads that already have an owner)
            </Label>
            <Textarea
              id="bulk-reason"
              rows={3}
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
          <Button disabled={busy || chosen.length === 0} onClick={() => void save()}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Assign {plural(leadIds.length, "lead")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
