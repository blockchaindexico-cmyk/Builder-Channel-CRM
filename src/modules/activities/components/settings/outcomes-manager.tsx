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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

import { deleteOutcomeAction, saveOutcomeAction } from "../../actions";
import { OUTCOME_CATEGORIES } from "../../constants";
import type { CallOutcomeRow } from "../../server/masters";
import { OutcomeBadge } from "../badges";

const NONE = "__none__";

type Draft = Omit<CallOutcomeRow, "id" | "key" | "usage"> & { id: string | null };

/** Call outcomes and the lead status each suggests (M07-03). */
export function OutcomesManager({
  outcomes,
  statuses,
}: {
  outcomes: CallOutcomeRow[];
  statuses: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const statusLabel = (key: string | null) =>
    key ? (statuses.find((status) => status.key === key)?.label ?? key) : null;

  async function save() {
    if (!draft) return;
    setBusy(true);
    const { id, ...values } = draft;
    const result = await saveOutcomeAction({ outcomeId: id, values });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(`Outcome "${draft.label}" saved`);
    setDraft(null);
    router.refresh();
  }

  async function remove(row: CallOutcomeRow) {
    const result = await deleteOutcomeAction({ outcomeId: row.id });
    const error = actionErrorMessage(result);
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`Outcome "${row.label}" deleted`);
    router.refresh();
  }

  const update = (patch: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() =>
            setDraft({
              id: null,
              label: "",
              category: "NEUTRAL",
              connected: true,
              suggestedStatusKey: null,
              requiresNextAction: false,
              nextActionType: null,
              isActive: true,
            })
          }
        >
          <Plus /> Add outcome
        </Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Outcome</TableHead>
              <TableHead>Customer reached</TableHead>
              <TableHead>Suggests status</TableHead>
              <TableHead>Next step</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outcomes.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <OutcomeBadge label={row.label} category={row.category} />
                    {!row.isActive ? <Badge variant="muted">Inactive</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>{row.connected ? "Yes" : "No"}</TableCell>
                <TableCell>
                  {statusLabel(row.suggestedStatusKey) ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.requiresNextAction ? (
                    `${row.nextActionType === "CALLBACK" ? "Callback" : "Follow-up"} required`
                  ) : (
                    <span className="text-muted-foreground">Optional</span>
                  )}
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
                      description="Only outcomes no call uses can be deleted; deactivate the others."
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
            <DialogTitle>{draft?.id ? "Edit outcome" : "New outcome"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <form
              id="outcome-form"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="outcome-label">Name</Label>
                <Input
                  id="outcome-label"
                  value={draft.label}
                  maxLength={60}
                  onChange={(event) => update({ label: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="outcome-category">Counts as</Label>
                <Select
                  value={draft.category}
                  onValueChange={(category) => update({ category: category as Draft["category"] })}
                >
                  <SelectTrigger id="outcome-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTCOME_CATEGORIES.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-start gap-3">
                <Switch
                  checked={draft.connected}
                  onCheckedChange={(connected) => update({ connected })}
                />
                <span className="grid gap-0.5 text-sm">
                  <span className="font-medium">The customer was reached</span>
                  <span className="text-muted-foreground">
                    Resets unanswered attempts; the first time moves a new lead to Contacted.
                  </span>
                </span>
              </label>
              <div className="grid gap-1.5">
                <Label htmlFor="outcome-status">Suggest lead status</Label>
                <Select
                  value={draft.suggestedStatusKey ?? NONE}
                  onValueChange={(value) =>
                    update({ suggestedStatusKey: value === NONE ? null : value })
                  }
                >
                  <SelectTrigger id="outcome-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No change</SelectItem>
                    {statuses.map((status) => (
                      <SelectItem key={status.key} value={status.key}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-start gap-3">
                <Switch
                  checked={draft.requiresNextAction}
                  onCheckedChange={(requiresNextAction) =>
                    update({
                      requiresNextAction,
                      nextActionType: requiresNextAction
                        ? (draft.nextActionType ?? "FOLLOW_UP")
                        : draft.nextActionType,
                    })
                  }
                />
                <span className="grid gap-0.5 text-sm">
                  <span className="font-medium">A next step is required</span>
                  <span className="text-muted-foreground">
                    The call can only be saved with a follow-up or callback while the lead stays
                    open.
                  </span>
                </span>
              </label>
              {draft.requiresNextAction ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="outcome-next">Next step offered</Label>
                  <Select
                    value={draft.nextActionType ?? "FOLLOW_UP"}
                    onValueChange={(value) =>
                      update({ nextActionType: value as "FOLLOW_UP" | "CALLBACK" })
                    }
                  >
                    <SelectTrigger id="outcome-next" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FOLLOW_UP">Follow-up</SelectItem>
                      <SelectItem value="CALLBACK">Callback</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(isActive) => update({ isActive })}
                />
                Offered when logging calls
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" form="outcome-form" disabled={busy}>
              {busy ? "Saving…" : "Save outcome"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
