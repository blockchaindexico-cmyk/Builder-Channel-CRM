"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { actionErrorMessage } from "@/lib/action-result";

import { deleteReasonAction, saveReasonAction } from "../../actions";
import type { ReasonRow } from "../../server/reasons";

/** Reason categories offered when leads are reassigned (M05-03). */
export function ReasonsTable({ reasons }: { reasons: ReasonRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<{
    id: string | null;
    label: string;
    isActive: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    setBusy(true);
    const result = await saveReasonAction({
      reasonId: draft.id,
      label: draft.label,
      isActive: draft.isActive,
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(`Reason "${draft.label}" saved`);
    setDraft(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          People pick one of these categories when they reassign a lead, next to their own words.
          Categories used in the history can be deactivated but not deleted.
        </p>
        <Button onClick={() => setDraft({ id: null, label: "", isActive: true })}>
          <Plus /> Add reason
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {reasons.map((reason) => (
              <TableRow key={reason.id}>
                <TableCell className="font-medium">{reason.label}</TableCell>
                <TableCell className="text-right tabular-nums">{reason.usage}</TableCell>
                <TableCell>
                  {reason.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="muted">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${reason.label}`}
                    onClick={() =>
                      setDraft({ id: reason.id, label: reason.label, isActive: reason.isActive })
                    }
                  >
                    <Pencil />
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Delete ${reason.label}`}>
                        <Trash2 />
                      </Button>
                    }
                    title={`Delete "${reason.label}"?`}
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      const error = actionErrorMessage(
                        await deleteReasonAction({ reasonId: reason.id }),
                      );
                      if (error) {
                        toast.error(error);
                        return false;
                      }
                      toast.success(`Reason "${reason.label}" deleted`);
                      router.refresh();
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !busy && !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit reason" : "New reason"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="reason-label">Reason</Label>
                <Input
                  id="reason-label"
                  value={draft.label}
                  maxLength={80}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="reason-active"
                  checked={draft.isActive}
                  onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
                />
                <Label htmlFor="reason-active">Active</Label>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || draft.label.trim().length < 2}>
                  {busy ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
