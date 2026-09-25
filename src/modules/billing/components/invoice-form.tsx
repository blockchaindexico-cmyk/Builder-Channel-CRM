"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useFormatters } from "@/components/shared/regional-settings";
import { useRegionalSettings } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/action-result";
import { parseAmountInput } from "@/lib/decimal";
import { formatCalendarDate } from "@/lib/format";

import { billableDealsAction, saveInvoiceDraftAction } from "../actions";
import { dec, sum, toMoney } from "../money";
import { computeTaxLines, type TaxSetup } from "../tax";

type BillableDeal = {
  id: string;
  status: string;
  recognizedOn: string;
  bookingNumber: string;
  customerName: string;
  projectName: string;
  unit: string;
  agreementValue: string;
  grossCommission: string;
};

export interface InvoiceDraftValues {
  invoiceId: string | null;
  builderId: string;
  dealIds: string[];
  manualLines: { description: string; amount: string }[];
  intraState: boolean;
  notes: string;
}

/** Draft invoice to a builder (M09-07): pick its closed deals, add other lines, see the tax before saving. */
export function InvoiceForm({
  builders,
  tax,
  initial,
}: {
  builders: { id: string; label: string }[];
  tax: TaxSetup;
  initial: InvoiceDraftValues;
}) {
  const router = useRouter();
  const format = useFormatters();
  const regional = useRegionalSettings();
  const [values, setValues] = useState(initial);
  const [deals, setDeals] = useState<BillableDeal[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!values.builderId) return;
    let stale = false;
    void billableDealsAction({ builderId: values.builderId, invoiceId: initial.invoiceId }).then(
      (result) => {
        if (stale) return;
        const error = actionErrorMessage(result);
        if (error || !result?.data) {
          toast.error(error ?? "Could not load the deals.");
          setDeals([]);
          return;
        }
        setDeals(result.data.deals);
        if (!initial.invoiceId) {
          setValues((current) => ({ ...current, intraState: result.data!.intraState }));
        }
      },
    );
    return () => {
      stale = true;
    };
  }, [values.builderId, initial.invoiceId]);

  const chosen = (deals ?? []).filter((deal) => values.dealIds.includes(deal.id));
  const amounts = [
    ...chosen.map((deal) => deal.grossCommission),
    ...values.manualLines.map((line) => parseAmountInput(line.amount) ?? "0"),
  ];
  const subtotal = toMoney(sum(amounts));
  const taxLines = computeTaxLines(subtotal, tax, values.intraState);
  const total = toMoney(dec(subtotal).plus(sum(taxLines.map((line) => line.amount))));

  const toggle = (id: string, on: boolean) =>
    setValues((current) => ({
      ...current,
      dealIds: on ? [...current.dealIds, id] : current.dealIds.filter((entry) => entry !== id),
    }));
  const setLine = (index: number, patch: Partial<{ description: string; amount: string }>) =>
    setValues((current) => ({
      ...current,
      manualLines: current.manualLines.map((line, at) =>
        at === index ? { ...line, ...patch } : line,
      ),
    }));

  async function save() {
    setBusy(true);
    const { invoiceId, ...rest } = values;
    const result = await saveInvoiceDraftAction({
      invoiceId,
      values: {
        ...rest,
        manualLines: rest.manualLines.filter(
          (line) => line.description.trim() || line.amount.trim(),
        ),
      },
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(invoiceId ? "Draft saved" : "Draft invoice created");
    router.push(`/billing/invoices/${result!.data!.id}`);
    router.refresh();
  }

  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Builder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={values.builderId || undefined}
              disabled={Boolean(initial.invoiceId)}
              onValueChange={(builderId) => {
                setDeals(null);
                setValues({ ...values, builderId, dealIds: [] });
              }}
            >
              <SelectTrigger className="w-full max-w-md" aria-label="Builder">
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
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={values.intraState}
                onCheckedChange={(intraState) => setValues({ ...values, intraState })}
              />
              Builder is in our state ({tax.split ? tax.splitLabels.join(" + ") : tax.singleLabel}
              {tax.split ? `; otherwise ${tax.singleLabel}` : ""})
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Closed deals</CardTitle>
            <CardDescription>Brokerage on each deal is its gross commission.</CardDescription>
          </CardHeader>
          <CardContent>
            {!values.builderId ? (
              <p className="text-sm text-muted-foreground">Choose the builder first.</p>
            ) : deals === null ? (
              <p className="text-sm text-muted-foreground">Loading deals…</p>
            ) : deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No closed deals of this builder are waiting to be billed.
              </p>
            ) : (
              <ul className="divide-y">
                {deals.map((deal) => (
                  <li key={deal.id}>
                    <label className="flex cursor-pointer items-start gap-3 py-2 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={values.dealIds.includes(deal.id)}
                        onCheckedChange={(checked) => toggle(deal.id, checked === true)}
                        aria-label={`Bill ${deal.bookingNumber}`}
                      />
                      <span className="flex-1">
                        <span className="font-medium">
                          {deal.bookingNumber} · {deal.customerName}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {deal.projectName}
                          {deal.unit ? ` · ${deal.unit}` : ""} · closed{" "}
                          {formatCalendarDate(deal.recognizedOn, regional)} · value{" "}
                          {format.money(deal.agreementValue, { compact: true })}
                          {deal.status === "DRAFT" ? " · financials not confirmed yet" : ""}
                        </span>
                      </span>
                      <span className="tabular-nums">{format.money(deal.grossCommission)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Other lines</CardTitle>
            <CardDescription>
              Referral fees, marketing support or anything not tied to a deal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {values.manualLines.map((line, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  aria-label={`Line ${index + 1} description`}
                  value={line.description}
                  maxLength={300}
                  placeholder="Description"
                  onChange={(event) => setLine(index, { description: event.target.value })}
                />
                <Input
                  aria-label={`Line ${index + 1} amount`}
                  className="w-40"
                  value={line.amount}
                  placeholder="Amount"
                  onChange={(event) => setLine(index, { amount: event.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() =>
                    setValues({
                      ...values,
                      manualLines: values.manualLines.filter((_, at) => at !== index),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setValues({
                  ...values,
                  manualLines: [...values.manualLines, { description: "", amount: "" }],
                })
              }
            >
              <Plus /> Add line
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle>Totals</CardTitle>
            <CardDescription>The invoice number is given when it is issued.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Taxable value</dt>
                <dd className="tabular-nums">{format.money(subtotal)}</dd>
              </div>
              {taxLines.map((line) => (
                <div key={line.label} className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {line.label} {line.rate}%
                  </dt>
                  <dd className="tabular-nums">{format.money(line.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{format.money(total)}</dd>
              </div>
            </dl>
            <div className="grid gap-1.5">
              <Label htmlFor="invoice-notes">Notes on the invoice</Label>
              <Textarea
                id="invoice-notes"
                value={values.notes}
                maxLength={2000}
                onChange={(event) => setValues({ ...values, notes: event.target.value })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !values.builderId}>
              {busy ? "Saving…" : initial.invoiceId ? "Save draft" : "Create draft"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
