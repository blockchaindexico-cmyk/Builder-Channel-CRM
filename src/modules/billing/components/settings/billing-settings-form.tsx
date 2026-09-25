"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

import { saveBillingSettingsAction } from "../../actions";
import { fiscalYearOf } from "../../fiscal";
import type { BillingSettings } from "../../schemas";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type TextField = {
  [K in keyof BillingSettings]: BillingSettings[K] extends string ? K : never;
}[keyof BillingSettings];

/** Seller details, numbering, tax, payment terms and bank details printed on invoices (M09-02). */
export function BillingSettingsForm({
  settings,
  today,
  fiscalYearStartMonth,
}: {
  settings: BillingSettings;
  today: string;
  /** From the organization's regional settings. */
  fiscalYearStartMonth: number;
}) {
  const router = useRouter();
  const [values, setValues] = useState(settings);
  const [busy, setBusy] = useState(false);
  const field = (
    name: TextField,
    label: string,
    options: { max?: number; hint?: string; wide?: boolean } = {},
  ) => (
    <div className={options.wide ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}>
      <Label htmlFor={`billing-${name}`}>{label}</Label>
      <Input
        id={`billing-${name}`}
        value={values[name]}
        maxLength={options.max ?? 100}
        onChange={(event) => setValues({ ...values, [name]: event.target.value })}
      />
      {options.hint ? <p className="text-xs text-muted-foreground">{options.hint}</p> : null}
    </div>
  );
  const year = fiscalYearOf(today, fiscalYearStartMonth);
  const sample = `${values.invoicePrefix || "INV"}/${year.label}/${"1".padStart(values.numberPadding, "0")}`;

  async function save() {
    setBusy(true);
    const { accountsRoleOffered: _offered, ...changes } = values;
    const result = await saveBillingSettingsAction(changes);
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success("Billing settings saved");
    router.refresh();
  }

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Your business</CardTitle>
          <CardDescription>
            Printed as the seller on every invoice issued from now on.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("legalName", "Legal name", {
            max: 200,
            wide: true,
            hint: "Empty: the organization name.",
          })}
          {field("taxRegistrationLabel", "Tax registration label", { max: 30 })}
          {field("taxRegistrationId", "Tax registration number", {
            max: 30,
            hint: "e.g. your GSTIN",
          })}
          {field("secondaryIdLabel", "Second id label", { max: 30 })}
          {field("secondaryId", "Second id", { max: 30, hint: "e.g. your PAN" })}
          {field("addressLine", "Address", { max: 300, wide: true })}
          {field("city", "City")}
          {field("state", "State", { hint: "Builders in the same state get the split tax." })}
          {field("postalCode", "Postal code", { max: 20 })}
          {field("email", "E-mail", { max: 200 })}
          {field("phone", "Phone", { max: 30 })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Numbering and terms</CardTitle>
          <CardDescription>
            Next invoice this year looks like {sample}. Numbers restart every fiscal year (starting
            in {MONTHS[fiscalYearStartMonth - 1]}, from the organization&apos;s regional settings).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("invoicePrefix", "Prefix", { max: 10 })}
          <div className="grid gap-1.5">
            <Label htmlFor="billing-padding">Digits in the number</Label>
            <Input
              id="billing-padding"
              type="number"
              min={3}
              max={8}
              value={values.numberPadding}
              onChange={(event) =>
                setValues({ ...values, numberPadding: Number(event.target.value) })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="billing-terms-days">Payment due after (days)</Label>
            <Input
              id="billing-terms-days"
              type="number"
              min={0}
              max={365}
              value={values.paymentTermsDays}
              onChange={(event) =>
                setValues({ ...values, paymentTermsDays: Number(event.target.value) })
              }
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="billing-terms">Terms printed on the invoice</Label>
            <Textarea
              id="billing-terms"
              value={values.terms}
              maxLength={2000}
              onChange={(event) => setValues({ ...values, terms: event.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax and commission</CardTitle>
          <CardDescription>
            Defaults for new deals and invoices; issued invoices keep their numbers.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("taxRate", "Tax on commission (%)", { max: 5, hint: "GST on brokerage is 18%." })}
          {field("tdsRate", "TDS builders deduct (%)", {
            max: 5,
            hint: "Commission TDS is usually 2%.",
          })}
          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <Switch
              checked={values.splitTax}
              onCheckedChange={(splitTax) => setValues({ ...values, splitTax })}
            />
            Split the tax in two within the same state
          </label>
          {values.splitTax ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="billing-split-1">First half</Label>
                <Input
                  id="billing-split-1"
                  value={values.splitTaxLabels[0]}
                  maxLength={12}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      splitTaxLabels: [event.target.value, values.splitTaxLabels[1]],
                    })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="billing-split-2">Second half</Label>
                <Input
                  id="billing-split-2"
                  value={values.splitTaxLabels[1]}
                  maxLength={12}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      splitTaxLabels: [values.splitTaxLabels[0], event.target.value],
                    })
                  }
                />
              </div>
            </>
          ) : null}
          {field("singleTaxLabel", values.splitTax ? "Tax between states" : "Tax label", {
            max: 12,
          })}
          {field("serviceCode", "Service code (SAC)", { max: 20 })}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="billing-commission-date">Rate card in force on the</Label>
            <Select
              value={values.commissionDate}
              onValueChange={(commissionDate) =>
                setValues({
                  ...values,
                  commissionDate: commissionDate as BillingSettings["commissionDate"],
                })
              }
            >
              <SelectTrigger id="billing-commission-date" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOOKING_DATE">Booking date</SelectItem>
                <SelectItem value="CLOSING_DATE">Closing date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank details</CardTitle>
          <CardDescription>Where builders pay; printed at the foot of the invoice.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("bankAccountName", "Account name", { max: 150 })}
          {field("bankName", "Bank")}
          {field("bankAccountNumber", "Account number", { max: 40 })}
          {field("bankCode", "IFSC", { max: 20 })}
          {field("bankBranch", "Branch")}
        </CardContent>
      </Card>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save billing settings"}
      </Button>
    </form>
  );
}
