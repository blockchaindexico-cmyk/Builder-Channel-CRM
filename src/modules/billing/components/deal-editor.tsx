"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useFormatters } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/action-result";
import { parseAmountInput } from "@/lib/decimal";

import { updateDealAction } from "../actions";
import { dec, percentOf, sum } from "../money";
import type { DealDetail } from "../server/financials";

const amountOf = (value: string) => parseAmountInput(value) ?? "0";
const plain = (value: string) => (dec(value).isZero() ? "" : dec(value).toString());

/** Costs, rates and (with a reason) the commission of a draft deal, with live totals (M09-06). */
export function DealEditor({ deal }: { deal: DealDetail }) {
  const router = useRouter();
  const format = useFormatters();
  const [override, setOverride] = useState(deal.commissionOverridden);
  const [form, setForm] = useState({
    grossCommission: dec(deal.grossCommission).toString(),
    overrideReason: deal.commissionOverridden
      ? deal.commissionBasis.replace(/^Entered by hand: /, "")
      : "",
    taxRate: dec(deal.taxRate).toString(),
    tdsRate: dec(deal.tdsRate).toString(),
    cashback: plain(deal.cashback),
    subBrokerPayout: plain(deal.subBrokerPayout),
    subBrokerName: deal.subBrokerName ?? "",
    executiveIncentive: plain(deal.executiveIncentive),
    notes: deal.notes ?? "",
  });
  const [expenses, setExpenses] = useState(
    deal.expenses.map((expense) => ({
      label: expense.label,
      amount: dec(expense.amount).toString(),
    })),
  );
  const [busy, setBusy] = useState(false);
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const gross = override ? amountOf(form.grossCommission) : deal.grossCommission;
  const other = sum(expenses.map((expense) => amountOf(expense.amount)));
  const netRevenue = dec(gross).minus(dec(amountOf(form.cashback)));
  const netProfit = netRevenue
    .minus(dec(amountOf(form.subBrokerPayout)))
    .minus(dec(amountOf(form.executiveIncentive)))
    .minus(other);

  async function save() {
    setBusy(true);
    const result = await updateDealAction({
      dealId: deal.id,
      grossCommission: override ? form.grossCommission : null,
      overrideReason: override ? form.overrideReason : null,
      taxRate: form.taxRate,
      tdsRate: form.tdsRate,
      cashback: form.cashback,
      subBrokerPayout: form.subBrokerPayout,
      subBrokerName: form.subBrokerName,
      executiveIncentive: form.executiveIncentive,
      expenses: expenses.filter((expense) => expense.label.trim() || expense.amount.trim()),
      notes: form.notes,
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(result?.data?.changed.length ? "Financials saved" : "Saved — nothing changed");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit financials</CardTitle>
        <CardDescription>
          Amounts accept 85000, 85,000, 85 K or 1.2 L. Totals update as you type.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Commission</legend>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={override} onCheckedChange={setOverride} />
              Enter the commission by hand instead of the rate card
            </label>
            {override ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="deal-gross">Gross commission</Label>
                  <Input
                    id="deal-gross"
                    value={form.grossCommission}
                    onChange={set("grossCommission")}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="deal-override-reason">Why it differs</Label>
                  <Input
                    id="deal-override-reason"
                    value={form.overrideReason}
                    maxLength={300}
                    required
                    onChange={set("overrideReason")}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {format.money(deal.grossCommission)} — {deal.commissionBasis}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="deal-tax">GST on commission (%)</Label>
                <Input
                  id="deal-tax"
                  inputMode="decimal"
                  value={form.taxRate}
                  onChange={set("taxRate")}
                />
                <p className="text-xs text-muted-foreground">
                  {format.money(percentOf(gross, form.taxRate || 0).toString())} — charged to the
                  builder on top.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="deal-tds">TDS the builder deducts (%)</Label>
                <Input
                  id="deal-tds"
                  inputMode="decimal"
                  value={form.tdsRate}
                  onChange={set("tdsRate")}
                />
                <p className="text-xs text-muted-foreground">
                  {format.money(percentOf(gross, form.tdsRate || 0).toString())} — a tax credit, not
                  a cost.
                </p>
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Costs of the deal</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="deal-cashback">Cashback to the customer</Label>
                <Input
                  id="deal-cashback"
                  value={form.cashback}
                  onChange={set("cashback")}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="deal-incentive">Executive incentive</Label>
                <Input
                  id="deal-incentive"
                  value={form.executiveIncentive}
                  onChange={set("executiveIncentive")}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="deal-payout">Sub-broker payout</Label>
                <Input
                  id="deal-payout"
                  value={form.subBrokerPayout}
                  onChange={set("subBrokerPayout")}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="deal-subbroker">Sub-broker</Label>
                <Input
                  id="deal-subbroker"
                  value={form.subBrokerName}
                  maxLength={120}
                  onChange={set("subBrokerName")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Other expenses</p>
              {expenses.map((expense, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    aria-label={`Expense ${index + 1}`}
                    placeholder="Cab for the site visit"
                    value={expense.label}
                    maxLength={120}
                    onChange={(event) =>
                      setExpenses(
                        expenses.map((entry, at) =>
                          at === index ? { ...entry, label: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label={`Amount of expense ${index + 1}`}
                    className="w-36"
                    placeholder="0"
                    value={expense.amount}
                    onChange={(event) =>
                      setExpenses(
                        expenses.map((entry, at) =>
                          at === index ? { ...entry, amount: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove expense ${index + 1}`}
                    onClick={() => setExpenses(expenses.filter((_, at) => at !== index))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExpenses([...expenses, { label: "", amount: "" }])}
              >
                <Plus /> Add expense
              </Button>
            </div>
          </fieldset>

          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Gross commission</dt>
              <dd className="font-medium tabular-nums">{format.money(dec(gross).toString())}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Net revenue</dt>
              <dd className="font-medium tabular-nums">{format.money(netRevenue.toString())}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Net profit</dt>
              <dd
                className={
                  netProfit.isNegative()
                    ? "font-semibold text-destructive tabular-nums"
                    : "font-semibold tabular-nums"
                }
              >
                {format.money(netProfit.toString())}
              </dd>
            </div>
          </dl>

          <div className="grid gap-1.5">
            <Label htmlFor="deal-notes">Notes</Label>
            <Textarea id="deal-notes" value={form.notes} maxLength={1000} onChange={set("notes")} />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save financials"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
