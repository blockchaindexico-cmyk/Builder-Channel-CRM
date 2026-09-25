"use client";

import { ArrowRightLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/action-result";
import { plural } from "@/lib/utils";

import { bulkChangeStatusAction, changeLeadStatusAction } from "../actions";
import { STATUS_CATEGORIES, SYSTEM_DRIVEN_STATUS_KEYS } from "../constants";
import type { LeadStatusRow } from "../server/masters";
import { LeadStatusBadge } from "./badges";

export interface StatusPermissions {
  canReopen: boolean;
  canOverride: boolean;
}

/**
 * Status change (M04-08) for one lead or a bulk selection. Only valid targets are offered: active statuses,
 * workflow statuses only with the override permission, and leaving a closed status only with reopen rights.
 * The server validates the same rules.
 */
export function StatusDialog({
  statuses,
  current,
  leadIds,
  permissions,
  trigger,
  onDone,
}: {
  statuses: LeadStatusRow[];
  /** Current status (single lead); omitted for bulk changes. */
  current?: { id: string; isTerminal: boolean; label: string; color: string };
  leadIds: string[];
  permissions: StatusPermissions;
  trigger?: ReactNode;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [statusId, setStatusId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const target = statuses.find((status) => status.id === statusId);

  const choices = statuses.filter((status) => {
    if (!status.isActive || status.id === current?.id) return false;
    if (SYSTEM_DRIVEN_STATUS_KEYS.includes(status.key) && !permissions.canOverride) return false;
    if (current?.isTerminal && !status.isTerminal && !permissions.canReopen) return false;
    return true;
  });
  const grouped = STATUS_CATEGORIES.map((category) => ({
    ...category,
    statuses: choices.filter((status) => status.category === category.value),
  })).filter((group) => group.statuses.length > 0);
  const reopening = Boolean(current?.isTerminal && target && !target.isTerminal);

  async function save() {
    if (!target) return;
    if (target.requiresReason && !reason.trim())
      return void toast.error(`Give a reason for "${target.label}".`);
    setBusy(true);
    if (leadIds.length === 1) {
      const result = await changeLeadStatusAction({
        leadId: leadIds[0]!,
        statusId: target.id,
        reason,
      });
      setBusy(false);
      const error = actionErrorMessage(result);
      if (error) return void toast.error(error);
      toast.success(`Status changed to ${target.label}`);
    } else {
      const result = await bulkChangeStatusAction({ leadIds, statusId: target.id, reason });
      setBusy(false);
      const error = actionErrorMessage(result);
      if (error) return void toast.error(error);
      const skipped = result?.data?.skipped ?? [];
      if (skipped.length) {
        toast.warning(
          `${result?.data?.changed ?? 0} changed, ${skipped.length} skipped: ${skipped[0]?.reason}`,
        );
      } else
        toast.success(`${plural(result?.data?.changed ?? 0, "lead")} moved to ${target.label}`);
    }
    setOpen(false);
    setStatusId("");
    setReason("");
    onDone?.();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <ArrowRightLeft /> Change status
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {leadIds.length > 1 ? `Change status of ${leadIds.length} leads` : "Change status"}
          </DialogTitle>
          <DialogDescription>
            {current ? (
              <span className="inline-flex items-center gap-2">
                Currently <LeadStatusBadge label={current.label} color={current.color} />
              </span>
            ) : (
              "Each lead is checked individually; leads you cannot change are skipped."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="status-target">New status</Label>
            <Select value={statusId} onValueChange={setStatusId}>
              <SelectTrigger id="status-target" className="w-full">
                <SelectValue placeholder="Choose a status" />
              </SelectTrigger>
              <SelectContent>
                {grouped.map((group) => (
                  <SelectGroup key={group.value}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.statuses.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: status.color }}
                          />
                          {status.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {current?.isTerminal && !permissions.canReopen ? (
              <p className="text-xs text-muted-foreground">
                This lead is closed. Ask a manager to reopen it.
              </p>
            ) : null}
          </div>
          {target ? (
            <div className="grid gap-2">
              <Label htmlFor="status-reason">
                Reason{" "}
                {target.requiresReason ? (
                  <span className="text-destructive">(required)</span>
                ) : (
                  "(optional)"
                )}
              </Label>
              <Textarea
                id="status-reason"
                rows={3}
                maxLength={500}
                value={reason}
                placeholder={
                  target.category === "LOST" ? "Budget, location, bought elsewhere…" : undefined
                }
                onChange={(event) => setReason(event.target.value)}
              />
              {reopening ? (
                <p className="text-xs text-muted-foreground">This reopens a closed lead.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!target || busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Change status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
