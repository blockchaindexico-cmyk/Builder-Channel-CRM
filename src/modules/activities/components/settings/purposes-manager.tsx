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

import { deletePurposeAction, savePurposeAction } from "../../actions";
import type { FollowUpPurposeRow } from "../../server/masters";

/** Why follow-ups are scheduled (M07-03). */
export function PurposesManager({ purposes }: { purposes: FollowUpPurposeRow[] }) {
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
    const result = await savePurposeAction({
      purposeId: draft.id,
      values: { label: draft.label, isActive: draft.isActive },
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(`Purpose "${draft.label}" saved`);
    setDraft(null);
    router.refresh();
  }

  async function remove(row: FollowUpPurposeRow) {
    const result = await deletePurposeAction({ purposeId: row.id });
    const error = actionErrorMessage(result);
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`Purpose "${row.label}" deleted`);
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDraft({ id: null, label: "", isActive: true })}>
          <Plus /> Add purpose
        </Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Purpose</TableHead>
              <TableHead className="text-right">Follow-ups</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purposes.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {row.label}
                    {!row.isActive ? <Badge variant="muted">Inactive</Badge> : null}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.usage}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Edit ${row.label}`}
                      onClick={() =>
                        setDraft({ id: row.id, label: row.label, isActive: row.isActive })
                      }
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
                      description="Only purposes no follow-up uses can be deleted; deactivate the others."
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit purpose" : "New purpose"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <form
              id="purpose-form"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="purpose-label">Name</Label>
                <Input
                  id="purpose-label"
                  value={draft.label}
                  maxLength={60}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                />
              </div>
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(isActive) => setDraft({ ...draft, isActive })}
                />
                Offered when scheduling
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" form="purpose-form" disabled={busy}>
              {busy ? "Saving…" : "Save purpose"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
