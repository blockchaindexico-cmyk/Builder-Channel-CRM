"use client";

import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
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

import { deleteLeadStatusAction, saveLeadStatusAction } from "../../actions";
import { STATUS_CATEGORIES, SYSTEM_DRIVEN_STATUS_KEYS } from "../../constants";
import type { LeadStatusRow } from "../../server/masters";
import { LeadStatusBadge } from "../badges";

type Draft = Omit<LeadStatusRow, "id" | "key" | "isSystem"> & { id?: string; isSystem: boolean };

/** Lead statuses (M04-03): rename, recolour, reorder, reason rule, activate; custom statuses. */
export function StatusesTable({
  statuses,
}: {
  statuses: (LeadStatusRow & { leadCount: number })[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    setBusy(true);
    const result = await saveLeadStatusAction({
      statusId: draft.id ?? null,
      label: draft.label,
      color: draft.color,
      category: draft.category,
      sortOrder: draft.sortOrder,
      isTerminal: draft.isTerminal,
      requiresReason: draft.requiresReason,
      isActive: draft.isActive,
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(`${draft.label} saved`);
    setDraft(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Labels, colours and order are yours to change. The standard statuses keep their meaning
          (category and closed/open), which dashboards and reports rely on.
        </p>
        <Button
          onClick={() =>
            setDraft({
              label: "",
              color: "#64748b",
              category: "ACTIVE",
              sortOrder: (statuses.at(-1)?.sortOrder ?? 0) + 10,
              isTerminal: false,
              requiresReason: false,
              isActive: true,
              isSystem: false,
            })
          }
        >
          <Plus /> Add status
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-3">Status</TableHead>
              <TableHead className="px-3">Category</TableHead>
              <TableHead className="px-3">Rules</TableHead>
              <TableHead className="px-3">Leads</TableHead>
              <TableHead className="px-3">Active</TableHead>
              <TableHead className="w-24 px-3">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statuses.map((status) => (
              <TableRow key={status.id}>
                <TableCell className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <LeadStatusBadge label={status.label} color={status.color} />
                    {status.isSystem ? (
                      <Lock
                        className="size-3.5 text-muted-foreground"
                        aria-label="Standard status"
                      />
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="px-3">
                  {STATUS_CATEGORIES.find((category) => category.value === status.category)?.label}
                </TableCell>
                <TableCell className="px-3 text-xs text-muted-foreground">
                  {[
                    status.isTerminal ? "closes the lead" : null,
                    status.requiresReason ? "reason required" : null,
                    SYSTEM_DRIVEN_STATUS_KEYS.includes(status.key) ? "set by workflow" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </TableCell>
                <TableCell className="px-3">{status.leadCount}</TableCell>
                <TableCell className="px-3">
                  {status.isActive ? (
                    <StatusBadge label="Active" tone="success" />
                  ) : (
                    <StatusBadge label="Inactive" tone="muted" />
                  )}
                </TableCell>
                <TableCell className="px-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${status.label}`}
                      onClick={() => setDraft({ ...status })}
                    >
                      <Pencil />
                    </Button>
                    {!status.isSystem ? (
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete ${status.label}`}
                          >
                            <Trash2 />
                          </Button>
                        }
                        title={`Delete ${status.label}?`}
                        description="Only unused statuses can be deleted; otherwise deactivate it."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={async () => {
                          const error = actionErrorMessage(
                            await deleteLeadStatusAction({ statusId: status.id }),
                          );
                          if (error) {
                            toast.error(error);
                            return false;
                          }
                          toast.success(`${status.label} deleted`);
                          router.refresh();
                        }}
                      />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && !busy && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? `Edit ${draft.label}` : "Add status"}</DialogTitle>
            <DialogDescription>
              {draft?.isSystem
                ? "Standard status: its category and closing behaviour stay fixed."
                : "Custom status within a category."}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="status-label">Label</Label>
                <Input
                  id="status-label"
                  value={draft.label}
                  maxLength={40}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status-color">Colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="status-color"
                    type="color"
                    value={draft.color}
                    className="h-9 w-12 cursor-pointer rounded-md border bg-transparent"
                    onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                  />
                  <LeadStatusBadge label={draft.label || "Preview"} color={draft.color} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status-order">Order</Label>
                <Input
                  id="status-order"
                  inputMode="numeric"
                  value={String(draft.sortOrder)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      sortOrder: Number(event.target.value.replace(/\D/g, "") || 0),
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status-category">Category</Label>
                <Select
                  value={draft.category}
                  disabled={draft.isSystem}
                  onValueChange={(value) =>
                    setDraft({ ...draft, category: value as Draft["category"] })
                  }
                >
                  <SelectTrigger id="status-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_CATEGORIES.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={draft.isTerminal}
                    disabled={draft.isSystem}
                    onCheckedChange={(checked) => setDraft({ ...draft, isTerminal: checked })}
                  />
                  Closes the lead
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.requiresReason}
                  onCheckedChange={(checked) => setDraft({ ...draft, requiresReason: checked })}
                />
                Reason required
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
                />
                Active
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button disabled={busy || !draft?.label.trim()} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
