"use client";

import { Ban, FileDown, IndianRupee, Mail, Send, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useFormatters } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/action-result";

import {
  cancelInvoiceAction,
  deleteInvoiceDraftAction,
  issueInvoiceAction,
  recordPaymentAction,
  sendInvoiceAction,
  voidPaymentAction,
} from "../actions";
import { PAYMENT_MODES } from "../constants";
import { ReasonDialog } from "./reason-dialog";

/** Issue a draft: its date (and optionally the due date) — the number is given now (M09-07). */
export function IssueInvoiceDialog({
  invoiceId,
  today,
  termsDays,
}: {
  invoiceId: string;
  today: string;
  termsDays: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Send /> Issue invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue this invoice?</DialogTitle>
          <DialogDescription>
            It gets the next number of its fiscal year and can no longer be edited — only cancelled.
            The deals on it are confirmed.
          </DialogDescription>
        </DialogHeader>
        <form
          id="issue-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            const result = await issueInvoiceAction({
              invoiceId,
              issueDate: String(form.get("issueDate")),
              dueDate: String(form.get("dueDate") ?? "") || null,
            });
            setBusy(false);
            const error = actionErrorMessage(result);
            if (error) return void toast.error(error);
            toast.success(`Invoice ${result?.data?.number} issued`);
            setOpen(false);
            router.refresh();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="issue-date">Invoice date</Label>
            <Input id="issue-date" name="issueDate" type="date" required defaultValue={today} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="due-date">Due date</Label>
            <Input id="due-date" name="dueDate" type="date" />
            <p className="text-xs text-muted-foreground">
              Empty: {termsDays} days after the invoice date.
            </p>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Back
          </Button>
          <Button type="submit" form="issue-form" disabled={busy}>
            {busy ? "Issuing…" : "Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DiscardDraftButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline">
          <Trash2 /> Discard draft
        </Button>
      }
      title="Discard this draft?"
      description="Its deals can be billed on another invoice."
      confirmLabel="Discard"
      destructive
      onConfirm={async () => {
        const error = actionErrorMessage(await deleteInvoiceDraftAction({ invoiceId }));
        if (error) {
          toast.error(error);
          return false;
        }
        toast.success("Draft discarded");
        router.push("/billing/invoices");
        router.refresh();
      }}
    />
  );
}

export function CancelInvoiceButton({ invoiceId, number }: { invoiceId: string; number: string }) {
  const router = useRouter();
  return (
    <ReasonDialog
      trigger={
        <Button variant="outline">
          <Ban /> Cancel invoice
        </Button>
      }
      title={`Cancel invoice ${number}?`}
      description="It stays in the register as cancelled (the number is not reused) and its deals can be billed again."
      confirmLabel="Cancel invoice"
      destructive
      onConfirm={async (reason) => {
        const error = actionErrorMessage(await cancelInvoiceAction({ invoiceId, reason }));
        if (error) {
          toast.error(error);
          return false;
        }
        toast.success(`Invoice ${number} cancelled`);
        router.refresh();
        return true;
      }}
    />
  );
}

/** Money received against an invoice, with the TDS the builder deducted (M09-09). */
export function RecordPaymentDialog({
  invoiceId,
  balance,
  suggestedTds,
  today,
}: {
  invoiceId: string;
  balance: string;
  /** TDS at the usual rate on the taxable value, as a hint. */
  suggestedTds: string;
  today: string;
}) {
  const router = useRouter();
  const format = useFormatters();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("BANK_TRANSFER");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <IndianRupee /> Record payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {format.money(balance)} is due. Amount received plus TDS deducted settle the invoice.
          </DialogDescription>
        </DialogHeader>
        <form
          id="payment-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            const result = await recordPaymentAction({
              invoiceId,
              receivedOn: String(form.get("receivedOn")),
              amount: String(form.get("amount")),
              tdsDeducted: String(form.get("tdsDeducted") ?? ""),
              mode,
              reference: String(form.get("reference") ?? ""),
              notes: String(form.get("notes") ?? ""),
            });
            setBusy(false);
            const error = actionErrorMessage(result);
            if (error) return void toast.error(error);
            toast.success(
              result?.data?.status === "PAID"
                ? "Payment recorded — invoice paid"
                : "Payment recorded",
            );
            setOpen(false);
            router.refresh();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="payment-date">Received on</Label>
            <Input id="payment-date" name="receivedOn" type="date" required defaultValue={today} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payment-mode">Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger id="payment-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payment-amount">Amount received</Label>
            <Input id="payment-amount" name="amount" required placeholder="0" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payment-tds">TDS deducted</Label>
            <Input id="payment-tds" name="tdsDeducted" placeholder="0" />
            <p className="text-xs text-muted-foreground">Usual TDS: {format.money(suggestedTds)}</p>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="payment-reference">Reference (UTR, cheque no.)</Label>
            <Input id="payment-reference" name="reference" maxLength={80} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="payment-notes">Notes</Label>
            <Input id="payment-notes" name="notes" maxLength={500} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Back
          </Button>
          <Button type="submit" form="payment-form" disabled={busy}>
            {busy ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VoidPaymentButton({ paymentId, label }: { paymentId: string; label: string }) {
  const router = useRouter();
  return (
    <ReasonDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Void ${label}`}>
          <Undo2 /> Void
        </Button>
      }
      title={`Void ${label}?`}
      description="The payment stays on record as voided and the balance goes back up."
      confirmLabel="Void payment"
      destructive
      onConfirm={async (reason) => {
        const error = actionErrorMessage(await voidPaymentAction({ paymentId, reason }));
        if (error) {
          toast.error(error);
          return false;
        }
        toast.success("Payment voided");
        router.refresh();
        return true;
      }}
    />
  );
}

export function DownloadPdfButton({ invoiceId }: { invoiceId: string }) {
  return (
    <Button variant="outline" asChild>
      <a href={`/api/billing/invoices/${invoiceId}/pdf?download=1`} download>
        <FileDown /> PDF
      </a>
    </Button>
  );
}

/** E-mails the invoice PDF to the builder (M09-08). */
export function SendInvoiceDialog({
  invoiceId,
  number,
  defaultTo,
  sentTo,
}: {
  invoiceId: string;
  number: string;
  defaultTo: string | null;
  sentTo: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Mail /> {sentTo ? "Send again" : "E-mail"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>E-mail invoice {number}</DialogTitle>
          <DialogDescription>
            The PDF is attached. Replies go to the e-mail in billing settings.
          </DialogDescription>
        </DialogHeader>
        <form
          id="send-form"
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            const result = await sendInvoiceAction({
              invoiceId,
              to: String(form.get("to")),
              message: String(form.get("message") ?? ""),
            });
            setBusy(false);
            const error = actionErrorMessage(result);
            if (error) return void toast.error(error);
            toast.success(`Invoice ${number} is on its way`);
            setOpen(false);
            router.refresh();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="send-to">To</Label>
            <Input
              id="send-to"
              name="to"
              type="email"
              required
              defaultValue={sentTo ?? defaultTo ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="send-message">Message</Label>
            <Textarea
              id="send-message"
              name="message"
              maxLength={1000}
              placeholder={`Please find attached our invoice ${number}.`}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Back
          </Button>
          <Button type="submit" form="send-form" disabled={busy}>
            {busy ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
