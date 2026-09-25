"use client";

import { Loader2, UserCheck, UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/action-result";

import { assignLeadAction, assignOptionsAction, unassignLeadAction } from "../actions";
import { MIN_REASON_LENGTH } from "../constants";
import type { AssignableMember } from "../server/assign";

const NONE = "__none__";

export interface AssignTarget {
  id: string;
  number: string;
  ownerId: string | null;
  ownerName: string | null;
}

/** Assign (unassigned lead) or reassign with a reason (M05-04). Options load when the dialog opens. */
export function AssignDialog({ lead, trigger }: { lead: AssignTarget; trigger?: ReactNode }) {
  const router = useRouter();
  const reassigning = lead.ownerId !== null;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<AssignableMember[]>([]);
  const [reasons, setReasons] = useState<{ id: string; label: string }[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [reason, setReason] = useState("");
  const [toQueue, setToQueue] = useState(false);

  async function load() {
    setLoading(true);
    const result = await assignOptionsAction({ purpose: reassigning ? "reassign" : "assign" });
    setLoading(false);
    const error = actionErrorMessage(result);
    if (error || !result?.data) return void toast.error(error ?? "Could not load the team.");
    setMembers(result.data.members.filter((member) => member.membershipId !== lead.ownerId));
    setReasons(result.data.reasons);
  }

  const reasonMissing = reassigning && reason.trim().length < MIN_REASON_LENGTH;
  const chosen = members.find((member) => member.membershipId === assigneeId);

  async function save() {
    setBusy(true);
    const result = toQueue
      ? await unassignLeadAction({
          leadId: lead.id,
          expectedOwnerId: lead.ownerId!,
          reason,
          reasonId,
        })
      : await assignLeadAction({
          leadId: lead.id,
          assigneeId,
          expectedOwnerId: lead.ownerId,
          reason,
          reasonId,
        });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(
      toQueue
        ? `${lead.number} is back in the unassigned queue`
        : `${lead.number} ${reassigning ? "reassigned" : "assigned"} to ${chosen?.name ?? "the new owner"}`,
    );
    setOpen(false);
    setAssigneeId("");
    setReason("");
    setReasonId("");
    setToQueue(false);
    router.refresh();
  }

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
            {reassigning ? <UserRoundCog /> : <UserCheck />}
            {reassigning ? "Reassign" : "Assign"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {reassigning ? "Reassign" : "Assign"} {lead.number}
          </DialogTitle>
          <DialogDescription>
            {reassigning
              ? `Currently with ${lead.ownerName ?? "someone else"}. The change and its reason are kept in the lead's history.`
              : "The lead moves to Assigned and appears in the new owner's leads."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {reassigning ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="assign-to-queue"
                checked={toQueue}
                onCheckedChange={(checked) => setToQueue(checked === true)}
              />
              <Label htmlFor="assign-to-queue">Return it to the unassigned queue instead</Label>
            </div>
          ) : null}
          {!toQueue ? (
            <div className="grid gap-2">
              <Label htmlFor="assign-member">{reassigning ? "New owner" : "Owner"}</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId} disabled={loading}>
                <SelectTrigger id="assign-member" className="w-full">
                  <SelectValue placeholder={loading ? "Loading the team…" : "Choose a person"} />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.membershipId} value={member.membershipId}>
                      <span className="flex w-full items-center justify-between gap-4">
                        <span>
                          {member.name}
                          {member.isMe ? " (you)" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {member.openLeads} open
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loading && members.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nobody in your team can take this lead.
                </p>
              ) : null}
            </div>
          ) : null}
          {reasons.length ? (
            <div className="grid gap-2">
              <Label htmlFor="assign-reason-category">Reason category</Label>
              <Select
                value={reasonId || NONE}
                onValueChange={(value) => setReasonId(value === NONE ? "" : value)}
              >
                <SelectTrigger id="assign-reason-category" className="w-full">
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
            <Label htmlFor="assign-reason">
              Reason{" "}
              {reassigning ? <span className="text-destructive">(required)</span> : "(optional)"}
            </Label>
            <Textarea
              id="assign-reason"
              rows={3}
              maxLength={500}
              value={reason}
              placeholder={reassigning ? "Why is the lead moving?" : undefined}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || loading || (!toQueue && !assigneeId) || reasonMissing}
            onClick={() => void save()}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {toQueue ? "Unassign" : reassigning ? "Reassign" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
