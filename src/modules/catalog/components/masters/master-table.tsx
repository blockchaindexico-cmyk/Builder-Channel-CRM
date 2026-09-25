"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
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

import { createMasterAction, deleteMasterAction, updateMasterAction } from "../../actions";
import { type MasterKind, PROPERTY_CATEGORIES } from "../../schemas";
import type { MasterRow } from "../../server/masters";

interface Draft {
  id?: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
  category: string;
  bedrooms: string;
}

const NOUN: Record<MasterKind, string> = {
  propertyType: "property type",
  configurationType: "configuration",
  amenity: "amenity",
};

/** Editable master list (M03-10): add, rename, reorder, deactivate; delete when unused. */
export function MasterTable({ kind, rows }: { kind: MasterKind; rows: MasterRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const noun = NOUN[kind];

  const nextOrder = String((rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) || 0) + 10);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const values: Record<string, unknown> = {
      name: draft.name,
      sortOrder: draft.sortOrder || "0",
      isActive: draft.isActive,
      ...(kind === "propertyType" ? { category: draft.category } : {}),
      ...(kind === "configurationType" ? { bedrooms: draft.bedrooms } : {}),
    };
    const result = draft.id
      ? await updateMasterAction({ kind, id: draft.id, values })
      : await createMasterAction({ kind, values });
    setBusy(false);
    const message = actionErrorMessage(result);
    if (message) {
      const fieldErrors = (
        result?.serverError as { fieldErrors?: Record<string, string[]> } | undefined
      )?.fieldErrors;
      setError(Object.values(fieldErrors ?? {})[0]?.[0] ?? message);
      return;
    }
    toast.success(draft.id ? `${draft.name} saved` : `${draft.name} added`);
    setDraft(null);
    router.refresh();
  }

  async function remove(row: MasterRow) {
    const message = actionErrorMessage(await deleteMasterAction({ kind, id: row.id }));
    if (message) {
      toast.error(message);
      return false;
    }
    toast.success(`${row.name} deleted`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setError(null);
            setDraft({
              name: "",
              sortOrder: nextOrder,
              isActive: true,
              category: "RESIDENTIAL",
              bedrooms: "",
            });
          }}
        >
          <Plus /> Add {noun}
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-3">Name</TableHead>
              {kind === "propertyType" ? <TableHead className="px-3">Category</TableHead> : null}
              {kind === "configurationType" ? (
                <TableHead className="px-3">Bedrooms</TableHead>
              ) : null}
              <TableHead className="px-3">Order</TableHead>
              <TableHead className="px-3">Used by</TableHead>
              <TableHead className="px-3">Status</TableHead>
              <TableHead className="w-24 px-3">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="px-3 py-2 font-medium">{row.name}</TableCell>
                {kind === "propertyType" ? (
                  <TableCell className="px-3">
                    {PROPERTY_CATEGORIES.find((category) => category.value === row.category)
                      ?.label ?? "—"}
                  </TableCell>
                ) : null}
                {kind === "configurationType" ? (
                  <TableCell className="px-3">{row.bedrooms ?? "—"}</TableCell>
                ) : null}
                <TableCell className="px-3 text-muted-foreground">{row.sortOrder}</TableCell>
                <TableCell className="px-3">
                  {row.usage > 0 ? `${row.usage} project(s)` : "—"}
                </TableCell>
                <TableCell className="px-3">
                  {row.isActive ? (
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
                      aria-label={`Edit ${row.name}`}
                      onClick={() => {
                        setError(null);
                        setDraft({
                          id: row.id,
                          name: row.name,
                          sortOrder: String(row.sortOrder),
                          isActive: row.isActive,
                          category: row.category ?? "RESIDENTIAL",
                          bedrooms: row.bedrooms ?? "",
                        });
                      }}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${row.name}`}>
                          <Trash2 />
                        </Button>
                      }
                      title={`Delete ${row.name}?`}
                      description={
                        row.usage > 0
                          ? `It is used by ${row.usage} project(s), so it can only be deactivated.`
                          : `The ${noun} is removed from the list.`
                      }
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

      <Dialog open={draft !== null} onOpenChange={(open) => !open && !busy && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
            <DialogDescription>
              Inactive entries stay on existing projects but are not offered for new ones.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="master-name">Name</Label>
                <Input
                  id="master-name"
                  autoFocus
                  value={draft.name}
                  aria-invalid={Boolean(error)}
                  maxLength={60}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </div>
              {kind === "propertyType" ? (
                <div className="grid gap-2">
                  <Label htmlFor="master-category">Category</Label>
                  <Select
                    value={draft.category}
                    onValueChange={(value) => setDraft({ ...draft, category: value })}
                  >
                    <SelectTrigger id="master-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROPERTY_CATEGORIES.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {kind === "configurationType" ? (
                <div className="grid gap-2">
                  <Label htmlFor="master-bedrooms">Bedrooms</Label>
                  <Input
                    id="master-bedrooms"
                    inputMode="decimal"
                    placeholder="e.g. 2.5"
                    value={draft.bedrooms}
                    onChange={(event) => setDraft({ ...draft, bedrooms: event.target.value })}
                  />
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="master-order">Display order</Label>
                <Input
                  id="master-order"
                  inputMode="numeric"
                  value={draft.sortOrder}
                  onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch
                  id="master-active"
                  checked={draft.isActive}
                  onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
                />
                <Label htmlFor="master-active" className="font-normal">
                  Active
                </Label>
              </div>
              {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button disabled={busy || !draft?.name.trim()} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
