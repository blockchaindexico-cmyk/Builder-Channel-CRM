"use client";

import { Mail, Pencil, Phone, Plus, Star, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/action-result";
import { formatPhone } from "@/lib/phone";

import {
  addBuilderContactAction,
  deleteBuilderContactAction,
  updateBuilderContactAction,
} from "../../actions";
import type { BuilderDetail } from "../../server/builders";

type Contact = BuilderDetail["contacts"][number];
interface Draft {
  id?: string;
  name: string;
  designation: string;
  phone: string;
  email: string;
  notes: string;
  isPrimary: boolean;
}

const blank: Draft = {
  name: "",
  designation: "",
  phone: "",
  email: "",
  notes: "",
  isPrimary: false,
};

/** Builder contacts (M03-04): sales heads, channel-partner managers… with one primary contact. */
export function ContactsPanel({
  builderId,
  contacts,
  canManage,
}: {
  builderId: string;
  contacts: Contact[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setErrors({});
    const values = {
      name: draft.name,
      designation: draft.designation,
      phone: draft.phone,
      email: draft.email,
      notes: draft.notes,
      isPrimary: draft.isPrimary,
    };
    const result = draft.id
      ? await updateBuilderContactAction({ contactId: draft.id, ...values })
      : await addBuilderContactAction({ builderId, ...values });
    setBusy(false);
    const fieldErrors = (
      result?.validationErrors as { fieldErrors?: Record<string, string[]> } | undefined
    )?.fieldErrors;
    if (fieldErrors) {
      setErrors(
        Object.fromEntries(
          Object.entries(fieldErrors).map(([key, messages]) => [key, messages?.[0] ?? ""]),
        ),
      );
      return;
    }
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(draft.id ? "Contact saved" : `${draft.name} added`);
    setDraft(null);
    router.refresh();
  }

  async function remove(contact: Contact) {
    const error = actionErrorMessage(await deleteBuilderContactAction({ contactId: contact.id }));
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`${contact.name} removed`);
    router.refresh();
  }

  const field = (key: keyof Draft, label: string, type = "text") => (
    <div className="grid gap-2">
      <Label htmlFor={`contact-${key}`}>{label}</Label>
      <Input
        id={`contact-${key}`}
        type={type}
        value={String(draft?.[key] ?? "")}
        aria-invalid={Boolean(errors[key])}
        onChange={(event) => draft && setDraft({ ...draft, [key]: event.target.value })}
      />
      {errors[key] ? <p className="text-sm text-destructive">{errors[key]}</p> : null}
    </div>
  );

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => setDraft({ ...blank, isPrimary: contacts.length === 0 })}
          >
            <Plus /> Add contact
          </Button>
        </div>
      ) : null}
      {contacts.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No contacts yet"
          description="Add the people you deal with at this builder."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {contacts.map((contact) => (
            <div key={contact.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {contact.name}
                    {contact.isPrimary ? (
                      <Badge variant="info" className="gap-1">
                        <Star /> Primary
                      </Badge>
                    ) : null}
                  </p>
                  {contact.designation ? (
                    <p className="text-sm text-muted-foreground">{contact.designation}</p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${contact.name}`}
                      onClick={() =>
                        setDraft({
                          id: contact.id,
                          name: contact.name,
                          designation: contact.designation ?? "",
                          phone: contact.phone ?? "",
                          email: contact.email ?? "",
                          notes: contact.notes ?? "",
                          isPrimary: contact.isPrimary,
                        })
                      }
                    >
                      <Pencil />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${contact.name}`}
                        >
                          <Trash2 />
                        </Button>
                      }
                      title={`Remove ${contact.name}?`}
                      description={
                        contact.isPrimary && contacts.length > 1
                          ? "Another contact becomes the primary contact."
                          : "The contact is removed from this builder."
                      }
                      confirmLabel="Remove"
                      destructive
                      onConfirm={() => remove(contact)}
                    />
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 text-sm">
                {contact.phone ? (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <Phone className="size-4 text-muted-foreground" /> {formatPhone(contact.phone)}
                  </a>
                ) : null}
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <Mail className="size-4 text-muted-foreground" /> {contact.email}
                  </a>
                ) : null}
                {contact.notes ? <p className="text-muted-foreground">{contact.notes}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={draft !== null} onOpenChange={(next) => !next && !busy && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit contact" : "Add contact"}</DialogTitle>
            <DialogDescription>Sales head, channel-partner manager, site office…</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{field("name", "Name")}</div>
            {field("designation", "Designation")}
            {field("phone", "Phone", "tel")}
            <div className="sm:col-span-2">{field("email", "E-mail", "email")}</div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea
                id="contact-notes"
                rows={2}
                value={draft?.notes ?? ""}
                onChange={(event) => draft && setDraft({ ...draft, notes: event.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="contact-primary"
                checked={draft?.isPrimary ?? false}
                onCheckedChange={(checked) =>
                  draft && setDraft({ ...draft, isPrimary: checked === true })
                }
              />
              <Label htmlFor="contact-primary" className="font-normal">
                Primary contact for this builder
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
