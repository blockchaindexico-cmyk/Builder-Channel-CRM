"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useFormatters, useRegionalSettings } from "@/components/shared/regional-settings";
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
import { Textarea } from "@/components/ui/textarea";
import type { CommissionSlabBasis, CommissionType } from "@/generated/prisma/enums";
import { actionErrorMessage } from "@/lib/action-result";
import { formatCalendarDate } from "@/lib/format";

import { deleteCommissionTermAction, saveCommissionTermAction } from "../../actions";
import { COMMISSION_TYPES } from "../../constants";
import type { CommissionTermRow } from "../../server/terms";

const ALL_PROJECTS = "__all__";

interface Draft {
  id: string | null;
  builderId: string;
  projectId: string | null;
  name: string;
  type: CommissionType;
  percentage: string;
  flatAmount: string;
  slabBasis: CommissionSlabBasis;
  slabs: { from: string; to: string; percentage: string }[];
  validFrom: string;
  validTo: string;
  notes: string;
  isActive: boolean;
}

/** Commission rate cards per builder and project, with validity periods (M09-04). */
export function CommissionTermsManager({
  terms,
  builders,
  projects,
  today,
}: {
  terms: CommissionTermRow[];
  builders: { id: string; label: string }[];
  projects: { id: string; label: string; builderId: string }[];
  today: string;
}) {
  const router = useRouter();
  const format = useFormatters();
  const regional = useRegionalSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const describe = (term: CommissionTermRow) => {
    if (term.type === "PERCENTAGE") return `${Number(term.percentage)}% of the agreement value`;
    if (term.type === "FLAT") return `${format.money(term.flatAmount)} per deal`;
    const unit = term.slabBasis === "VOLUME" ? "deals in the fiscal year" : "value";
    return term.slabs
      .map((slab) =>
        term.slabBasis === "VOLUME"
          ? `${slab.from}${slab.to ? `–${slab.to}` : "+"}: ${Number(slab.percentage)}%`
          : `${format.money(slab.from, { compact: true })}${slab.to ? `–${format.money(slab.to, { compact: true })}` : "+"}: ${Number(slab.percentage)}%`,
      )
      .join(" · ")
      .concat(` (by ${unit})`);
  };

  async function save() {
    if (!draft) return;
    setBusy(true);
    const { id, ...rest } = draft;
    const result = await saveCommissionTermAction({
      termId: id,
      values: {
        ...rest,
        percentage: rest.type === "PERCENTAGE" ? rest.percentage : null,
        flatAmount: rest.type === "FLAT" ? rest.flatAmount : null,
        slabBasis: rest.type === "SLAB" ? rest.slabBasis : null,
        slabs:
          rest.type === "SLAB" ? rest.slabs.map((slab) => ({ ...slab, to: slab.to || null })) : [],
        validTo: rest.validTo || null,
      },
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success("Rate card saved");
    setDraft(null);
    router.refresh();
  }

  const setSlab = (index: number, patch: Partial<Draft["slabs"][number]>) =>
    draft &&
    setDraft({
      ...draft,
      slabs: draft.slabs.map((slab, at) => (at === index ? { ...slab, ...patch } : slab)),
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          A project card wins over its builder&apos;s card. The card in force on the booking date is
          used and kept with the deal.
        </p>
        <Button
          disabled={builders.length === 0}
          onClick={() =>
            setDraft({
              id: null,
              builderId: builders[0]?.id ?? "",
              projectId: null,
              name: "",
              type: "PERCENTAGE",
              percentage: "2",
              flatAmount: "",
              slabBasis: "VALUE",
              slabs: [
                { from: "0", to: "10000000", percentage: "2" },
                { from: "10000000", to: "", percentage: "2.5" },
              ],
              validFrom: today,
              validTo: "",
              notes: "",
              isActive: true,
            })
          }
        >
          <Plus /> Add rate card
        </Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Builder / project</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Valid</TableHead>
              <TableHead className="text-right">Deals</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {terms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  No rate cards yet. Deals without one get no commission until you enter it by hand.
                </TableCell>
              </TableRow>
            ) : (
              terms.map((term) => (
                <TableRow key={term.id}>
                  <TableCell>
                    <span className="block font-medium">{term.builderName}</span>
                    <span className="text-xs text-muted-foreground">
                      {term.projectName ?? "All projects"}
                      {term.name ? ` · ${term.name}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md text-sm">{describe(term)}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatCalendarDate(term.validFrom, regional)} –{" "}
                    {term.validTo ? formatCalendarDate(term.validTo, regional) : "open"}
                    {!term.isActive ? (
                      <Badge variant="muted" className="ml-2">
                        Inactive
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{term.usage}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Edit the rate card of ${term.projectName ?? term.builderName}`}
                        onClick={() =>
                          setDraft({
                            id: term.id,
                            builderId: term.builderId,
                            projectId: term.projectId,
                            name: term.name ?? "",
                            type: term.type,
                            percentage: term.percentage ? String(Number(term.percentage)) : "",
                            flatAmount: term.flatAmount ?? "",
                            slabBasis: term.slabBasis ?? "VALUE",
                            slabs: term.slabs.map((slab) => ({
                              from: slab.from,
                              to: slab.to ?? "",
                              percentage: slab.percentage,
                            })),
                            validFrom: term.validFrom,
                            validTo: term.validTo ?? "",
                            notes: term.notes ?? "",
                            isActive: term.isActive,
                          })
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
                            aria-label={`Delete the rate card of ${term.projectName ?? term.builderName}`}
                          >
                            <Trash2 />
                          </Button>
                        }
                        title="Delete this rate card?"
                        description={
                          term.usage
                            ? "Deals already use it, so it is deactivated instead; their commission stays as it was."
                            : "It was never used."
                        }
                        confirmLabel={term.usage ? "Deactivate" : "Delete"}
                        destructive
                        onConfirm={async () => {
                          const error = actionErrorMessage(
                            await deleteCommissionTermAction({ termId: term.id }),
                          );
                          if (error) {
                            toast.error(error);
                            return false;
                          }
                          toast.success(term.usage ? "Rate card deactivated" : "Rate card deleted");
                          router.refresh();
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => (!open ? setDraft(null) : undefined)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit rate card" : "New rate card"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <form
              id="term-form"
              className="grid max-h-[70vh] gap-4 overflow-y-auto sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="term-builder">Builder</Label>
                <Select
                  value={draft.builderId}
                  onValueChange={(builderId) => setDraft({ ...draft, builderId, projectId: null })}
                >
                  <SelectTrigger id="term-builder">
                    <SelectValue placeholder="Choose the builder" />
                  </SelectTrigger>
                  <SelectContent>
                    {builders.map((builder) => (
                      <SelectItem key={builder.id} value={builder.id}>
                        {builder.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="term-project">Project</Label>
                <Select
                  value={draft.projectId ?? ALL_PROJECTS}
                  onValueChange={(value) =>
                    setDraft({ ...draft, projectId: value === ALL_PROJECTS ? null : value })
                  }
                >
                  <SelectTrigger id="term-project">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_PROJECTS}>All projects of the builder</SelectItem>
                    {projects
                      .filter((project) => project.builderId === draft.builderId)
                      .map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="term-name">Name (optional)</Label>
                <Input
                  id="term-name"
                  value={draft.name}
                  maxLength={80}
                  placeholder="Launch offer"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="term-type">Commission</Label>
                <Select
                  value={draft.type}
                  onValueChange={(type) => setDraft({ ...draft, type: type as CommissionType })}
                >
                  <SelectTrigger id="term-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMISSION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {draft.type === "PERCENTAGE" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="term-percentage">Percentage</Label>
                  <Input
                    id="term-percentage"
                    inputMode="decimal"
                    value={draft.percentage}
                    onChange={(event) => setDraft({ ...draft, percentage: event.target.value })}
                  />
                </div>
              ) : null}
              {draft.type === "FLAT" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="term-flat">Amount per deal</Label>
                  <Input
                    id="term-flat"
                    value={draft.flatAmount}
                    placeholder="1,00,000"
                    onChange={(event) => setDraft({ ...draft, flatAmount: event.target.value })}
                  />
                </div>
              ) : null}
              {draft.type === "SLAB" ? (
                <fieldset className="space-y-2 sm:col-span-2">
                  <legend className="mb-1 text-sm font-medium">Slabs</legend>
                  <Select
                    value={draft.slabBasis}
                    onValueChange={(slabBasis) =>
                      setDraft({ ...draft, slabBasis: slabBasis as CommissionSlabBasis })
                    }
                  >
                    <SelectTrigger className="max-w-sm" aria-label="Slabs by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VALUE">By the agreement value of the deal</SelectItem>
                      <SelectItem value="VOLUME">
                        By the number of deals in the fiscal year
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {draft.slabBasis === "VALUE"
                      ? "The slab the value falls in (from ≤ value < to) gives the rate for the whole value. Amounts in rupees."
                      : "The nth deal with this builder in the fiscal year (from ≤ n ≤ to) gets the slab's rate."}
                  </p>
                  {draft.slabs.map((slab, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        aria-label={`Slab ${index + 1} from`}
                        value={slab.from}
                        onChange={(event) => setSlab(index, { from: event.target.value })}
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        aria-label={`Slab ${index + 1} to`}
                        value={slab.to}
                        placeholder="no limit"
                        onChange={(event) => setSlab(index, { to: event.target.value })}
                      />
                      <Input
                        aria-label={`Slab ${index + 1} percentage`}
                        className="w-24"
                        value={slab.percentage}
                        onChange={(event) => setSlab(index, { percentage: event.target.value })}
                      />
                      <span className="text-muted-foreground">%</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove slab ${index + 1}`}
                        onClick={() =>
                          setDraft({ ...draft, slabs: draft.slabs.filter((_, at) => at !== index) })
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const last = draft.slabs.at(-1);
                      setDraft({
                        ...draft,
                        slabs: [...draft.slabs, { from: last?.to ?? "0", to: "", percentage: "" }],
                      });
                    }}
                  >
                    <Plus /> Add slab
                  </Button>
                </fieldset>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="term-from">Valid from</Label>
                <Input
                  id="term-from"
                  type="date"
                  required
                  value={draft.validFrom}
                  onChange={(event) => setDraft({ ...draft, validFrom: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="term-to">Valid until</Label>
                <Input
                  id="term-to"
                  type="date"
                  value={draft.validTo}
                  onChange={(event) => setDraft({ ...draft, validTo: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="term-notes">Notes</Label>
                <Textarea
                  id="term-notes"
                  value={draft.notes}
                  maxLength={500}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                />
              </div>
              <label className="flex items-center gap-3 text-sm sm:col-span-2">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(isActive) => setDraft({ ...draft, isActive })}
                />
                Active
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" form="term-form" disabled={busy}>
              {busy ? "Saving…" : "Save rate card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
