"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useFormatters, useRegionalSettings } from "@/components/shared/regional-settings";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BusinessExpenseCategory } from "@/generated/prisma/enums";
import { actionErrorMessage } from "@/lib/action-result";
import { formatCalendarDate } from "@/lib/format";

import { deleteExpenseAction, saveExpenseAction } from "../actions";
import { EXPENSE_CATEGORIES } from "../constants";
import type { ExpenseRow } from "../server/expenses";

type Option = { id: string; label: string };
const NONE = "__none__";

interface Draft {
  id: string | null;
  spentOn: string;
  category: BusinessExpenseCategory;
  description: string;
  amount: string;
  sourceId: string | null;
  campaignId: string | null;
  projectId: string | null;
  paidTo: string;
  reference: string;
}

/** Business expense ledger (M09-15): overheads and marketing spend, by source, campaign or project. */
export function ExpensesManager({
  rows,
  canManage,
  today,
  sources,
  campaigns,
  projects,
}: {
  rows: ExpenseRow[];
  canManage: boolean;
  today: string;
  sources: Option[];
  campaigns: (Option & { sourceId: string | null })[];
  projects: Option[];
}) {
  const router = useRouter();
  const format = useFormatters();
  const regional = useRegionalSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const category = (value: string) =>
    EXPENSE_CATEGORIES.find((entry) => entry.value === value)?.label;

  async function save() {
    if (!draft) return;
    setBusy(true);
    const { id, ...values } = draft;
    const result = await saveExpenseAction({ expenseId: id, values: { ...values } });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success("Expense saved");
    setDraft(null);
    router.refresh();
  }

  const optionSelect = (
    id: string,
    label: string,
    value: string | null,
    options: Option[],
    onChange: (value: string | null) => void,
  ) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button
            onClick={() =>
              setDraft({
                id: null,
                spentOn: today,
                category: "MARKETING",
                description: "",
                amount: "",
                sourceId: null,
                campaignId: null,
                projectId: null,
                paidTo: "",
                reference: "",
              })
            }
          >
            <Plus /> Add expense
          </Button>
        </div>
      ) : null}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Expense</TableHead>
              <TableHead>For</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {canManage ? (
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  No expenses in this period.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatCalendarDate(row.spentOn, regional)}
                  </TableCell>
                  <TableCell>
                    <span className="block font-medium">{row.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {category(row.category)}
                      {row.paidTo ? ` · ${row.paidTo}` : ""}
                      {row.reference ? ` · ${row.reference}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {[row.source?.name, row.campaign?.name, row.project?.name]
                      .filter(Boolean)
                      .join(" · ") || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {format.money(row.amount)}
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Edit ${row.description}`}
                          onClick={() =>
                            setDraft({
                              id: row.id,
                              spentOn: row.spentOn,
                              category: row.category,
                              description: row.description,
                              amount: row.amount,
                              sourceId: row.source?.id ?? null,
                              campaignId: row.campaign?.id ?? null,
                              projectId: row.project?.id ?? null,
                              paidTo: row.paidTo ?? "",
                              reference: row.reference ?? "",
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
                              aria-label={`Delete ${row.description}`}
                            >
                              <Trash2 />
                            </Button>
                          }
                          title={`Delete "${row.description}"?`}
                          description="It no longer counts in the profit & loss."
                          confirmLabel="Delete"
                          destructive
                          onConfirm={async () => {
                            const error = actionErrorMessage(
                              await deleteExpenseAction({ expenseId: row.id }),
                            );
                            if (error) {
                              toast.error(error);
                              return false;
                            }
                            toast.success("Expense deleted");
                            router.refresh();
                          }}
                        />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => (!open ? setDraft(null) : undefined)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit expense" : "New expense"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <form
              id="expense-form"
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="expense-date">Date</Label>
                <Input
                  id="expense-date"
                  type="date"
                  required
                  value={draft.spentOn}
                  onChange={(event) => setDraft({ ...draft, spentOn: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="expense-category">Category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(value) =>
                    setDraft({ ...draft, category: value as BusinessExpenseCategory })
                  }
                >
                  <SelectTrigger id="expense-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="expense-description">Description</Label>
                <Input
                  id="expense-description"
                  required
                  maxLength={200}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="expense-amount">Amount</Label>
                <Input
                  id="expense-amount"
                  required
                  value={draft.amount}
                  onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="expense-paid-to">Paid to</Label>
                <Input
                  id="expense-paid-to"
                  maxLength={120}
                  value={draft.paidTo}
                  onChange={(event) => setDraft({ ...draft, paidTo: event.target.value })}
                />
              </div>
              {draft.category === "MARKETING" ? (
                <>
                  {optionSelect(
                    "expense-source",
                    "Lead source",
                    draft.sourceId,
                    sources,
                    (sourceId) => setDraft({ ...draft, sourceId, campaignId: null }),
                  )}
                  {optionSelect(
                    "expense-campaign",
                    "Campaign",
                    draft.campaignId,
                    campaigns.filter(
                      (campaign) => !draft.sourceId || campaign.sourceId === draft.sourceId,
                    ),
                    (campaignId) => setDraft({ ...draft, campaignId }),
                  )}
                </>
              ) : null}
              {optionSelect("expense-project", "Project", draft.projectId, projects, (projectId) =>
                setDraft({ ...draft, projectId }),
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="expense-reference">Reference</Label>
                <Input
                  id="expense-reference"
                  maxLength={80}
                  value={draft.reference}
                  onChange={(event) => setDraft({ ...draft, reference: event.target.value })}
                />
              </div>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" form="expense-form" disabled={busy}>
              {busy ? "Saving…" : "Save expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
