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

import { deleteLeadSourceAction, saveLeadSourceAction } from "../../actions";
import { SOURCE_TYPES, type SourceTypeValue } from "../../constants";

export interface SourceRow {
  id: string;
  name: string;
  code: string;
  type: SourceTypeValue;
  isActive: boolean;
  sortOrder: number;
  leadCount: number;
  campaignCount: number;
}

interface Draft {
  id?: string;
  name: string;
  code: string;
  type: SourceTypeValue;
  isActive: boolean;
  sortOrder: number;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Lead sources (M04-03); the code is what imports and the intake API use. */
export function SourcesTable({ sources }: { sources: SourceRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    setBusy(true);
    const result = await saveLeadSourceAction({ sourceId: draft.id ?? null, ...draft });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(`${draft.name} saved`);
    setDraft(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() =>
            setDraft({
              name: "",
              code: "",
              type: "PORTAL",
              isActive: true,
              sortOrder: (sources.at(-1)?.sortOrder ?? 0) + 10,
            })
          }
        >
          <Plus /> Add source
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-3">Source</TableHead>
              <TableHead className="px-3">Code</TableHead>
              <TableHead className="px-3">Type</TableHead>
              <TableHead className="px-3">Leads</TableHead>
              <TableHead className="px-3">Active</TableHead>
              <TableHead className="w-24 px-3">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => (
              <TableRow key={source.id}>
                <TableCell className="px-3 py-2 font-medium">{source.name}</TableCell>
                <TableCell className="px-3 font-mono text-xs">{source.code}</TableCell>
                <TableCell className="px-3">
                  {SOURCE_TYPES.find((type) => type.value === source.type)?.label}
                </TableCell>
                <TableCell className="px-3">{source.leadCount}</TableCell>
                <TableCell className="px-3">
                  {source.isActive ? (
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
                      aria-label={`Edit ${source.name}`}
                      onClick={() => setDraft({ ...source })}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${source.name}`}>
                          <Trash2 />
                        </Button>
                      }
                      title={`Delete ${source.name}?`}
                      description="Sources with leads or campaigns can only be deactivated."
                      confirmLabel="Delete"
                      destructive
                      onConfirm={async () => {
                        const error = actionErrorMessage(
                          await deleteLeadSourceAction({ sourceId: source.id }),
                        );
                        if (error) {
                          toast.error(error);
                          return false;
                        }
                        toast.success(`${source.name} deleted`);
                        router.refresh();
                      }}
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
            <DialogTitle>{draft?.id ? `Edit ${draft.name}` : "Add source"}</DialogTitle>
            <DialogDescription>
              Imports and the intake API refer to sources by their code.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="source-name">Name</Label>
                <Input
                  id="source-name"
                  value={draft.name}
                  maxLength={60}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      name: event.target.value,
                      code: draft.id || draft.code ? draft.code : slug(event.target.value),
                    })
                  }
                  onBlur={() => !draft.code && setDraft({ ...draft, code: slug(draft.name) })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="source-code">Code</Label>
                <Input
                  id="source-code"
                  value={draft.code}
                  maxLength={40}
                  className="font-mono"
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="source-type">Type</Label>
                <Select
                  value={draft.type}
                  onValueChange={(value) => setDraft({ ...draft, type: value as SourceTypeValue })}
                >
                  <SelectTrigger id="source-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            <Button
              disabled={busy || !draft?.name.trim() || !draft?.code.trim()}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
