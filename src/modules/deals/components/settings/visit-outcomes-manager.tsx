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

import { deleteVisitOutcomeAction, saveVisitOutcomeAction } from "../../actions";
import { VISIT_NEXT_STEPS, VISIT_OUTCOME_CATEGORIES } from "../../constants";
import type { VisitOutcomeRow } from "../../server/masters";
import { VisitOutcomeBadge } from "../badges";

const NONE = "__none__";

type Draft = Omit<VisitOutcomeRow, "id" | "key" | "usage"> & { id: string | null };

/** Visit outcomes and the next step each suggests (M08-02). */
export function VisitOutcomesManager({ outcomes }: { outcomes: VisitOutcomeRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    setBusy(true);
    const { id, ...values } = draft;
    const result = await saveVisitOutcomeAction({ outcomeId: id, values });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(`Outcome "${draft.label}" saved`);
    setDraft(null);
    router.refresh();
  }

  async function remove(row: VisitOutcomeRow) {
    const error = actionErrorMessage(await deleteVisitOutcomeAction({ outcomeId: row.id }));
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`Outcome "${row.label}" deleted`);
    router.refresh();
  }

  const update = (patch: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const stepLabel = (step: string | null) =>
    VISIT_NEXT_STEPS.find((entry) => entry.value === step)?.label ?? null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() =>
            setDraft({ id: null, label: "", category: "POSITIVE", nextStep: null, isActive: true })
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
              <TableHead>Suggests</TableHead>
              <TableHead className="text-right">Visits</TableHead>
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
                    <VisitOutcomeBadge label={row.label} category={row.category} />
                    {!row.isActive ? <Badge variant="muted">Inactive</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>
                  {stepLabel(row.nextStep) ?? <span className="text-muted-foreground">—</span>}
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
                      description="Only outcomes no visit uses can be deleted; deactivate the others."
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
            <DialogTitle>{draft?.id ? "Edit visit outcome" : "New visit outcome"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <form
              id="visit-outcome-form"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="visit-outcome-label">Name</Label>
                <Input
                  id="visit-outcome-label"
                  value={draft.label}
                  maxLength={60}
                  onChange={(event) => update({ label: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="visit-outcome-category">Counts as</Label>
                <Select
                  value={draft.category}
                  onValueChange={(category) => update({ category: category as Draft["category"] })}
                >
                  <SelectTrigger id="visit-outcome-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIT_OUTCOME_CATEGORIES.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="visit-outcome-next">Suggest next</Label>
                <Select
                  value={draft.nextStep ?? NONE}
                  onValueChange={(value) =>
                    update({ nextStep: value === NONE ? null : (value as Draft["nextStep"]) })
                  }
                >
                  <SelectTrigger id="visit-outcome-next" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nothing in particular</SelectItem>
                    {VISIT_NEXT_STEPS.map((step) => (
                      <SelectItem key={step.value} value={step.value}>
                        {step.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(isActive) => update({ isActive })}
                />
                Offered when recording a visit
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" form="visit-outcome-form" disabled={busy}>
              {busy ? "Saving…" : "Save outcome"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
