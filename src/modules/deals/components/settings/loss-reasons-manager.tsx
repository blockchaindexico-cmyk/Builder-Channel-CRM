"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LossReasonScope } from "@/generated/prisma/enums";
import { actionErrorMessage } from "@/lib/action-result";

import { deleteLossReasonAction, saveLossReasonAction } from "../../actions";
import { LOSS_REASON_SCOPES } from "../../constants";
import type { LossReasonRow } from "../../server/masters";

type Draft = Omit<LossReasonRow, "id" | "key" | "usage"> & { id: string | null };

/** Why leads are lost or not interested, and bookings cancelled (M08-02, PRD §12, §17). */
export function LossReasonsManager({ reasons }: { reasons: LossReasonRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    if (draft.appliesTo.length === 0) return void toast.error("Choose where the reason is used.");
    setBusy(true);
    const { id, ...values } = draft;
    const result = await saveLossReasonAction({ reasonId: id, values });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(`Reason "${draft.label}" saved`);
    setDraft(null);
    router.refresh();
  }

  async function remove(row: LossReasonRow) {
    const error = actionErrorMessage(await deleteLossReasonAction({ reasonId: row.id }));
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`Reason "${row.label}" deleted`);
    router.refresh();
  }

  const toggle = (scope: LossReasonScope, on: boolean) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            appliesTo: on
              ? [...new Set([...current.appliesTo, scope])]
              : current.appliesTo.filter((entry) => entry !== scope),
          }
        : current,
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() =>
            setDraft({ id: null, label: "", appliesTo: ["LOST", "NOT_INTERESTED"], isActive: true })
          }
        >
          <Plus /> Add reason
        </Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reason</TableHead>
              <TableHead>Used for</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reasons.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.label}</span>
                    {!row.isActive ? <Badge variant="muted">Inactive</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {LOSS_REASON_SCOPES.filter((scope) => row.appliesTo.includes(scope.value)).map(
                      (scope) => (
                        <Badge key={scope.value} variant="outline">
                          {scope.label}
                        </Badge>
                      ),
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.usage}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Edit ${row.label}`}
                      onClick={() => {
                        const { usage: _usage, key: _key, ...rest } = row;
                        setDraft(rest);
                      }}
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
                      description="Only reasons never recorded can be deleted; deactivate the others."
                      confirmLabel="Delete"
                      destructive
                      onConfirm={() => remove(row)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => (!open ? setDraft(null) : undefined)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit reason" : "New reason"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <form
              id="loss-reason-form"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="loss-reason-label">Name</Label>
                <Input
                  id="loss-reason-label"
                  value={draft.label}
                  maxLength={80}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Used for</legend>
                {LOSS_REASON_SCOPES.map((scope) => (
                  <label key={scope.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.appliesTo.includes(scope.value)}
                      onCheckedChange={(checked) => toggle(scope.value, checked === true)}
                    />
                    {scope.label}
                  </label>
                ))}
              </fieldset>
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(isActive) => setDraft({ ...draft, isActive })}
                />
                Offered when closing a lead or cancelling a booking
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" form="loss-reason-form" disabled={busy}>
              {busy ? "Saving…" : "Save reason"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
