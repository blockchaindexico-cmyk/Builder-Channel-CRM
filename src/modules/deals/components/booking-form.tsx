"use client";

import { FileUp, Loader2, X } from "lucide-react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage, type ClientActionError } from "@/lib/action-result";

import { createBookingAction, updateBookingAction } from "../actions";
import { isBookingDocument, uploadBookingDocument } from "./upload-document";

export interface BookingFormOptions {
  projects: { id: string; name: string; builderName: string; interested: boolean }[];
  configurations: { id: string; name: string }[];
  /** People the booking may be credited to; empty = only the default. */
  executives: { id: string; name: string }[];
  visits: { id: string; label: string }[];
  canSeeValues: boolean;
}

export interface BookingFormValues {
  projectId: string;
  executiveId: string;
  visitId: string;
  customerName: string;
  coApplicantName: string;
  unitNumber: string;
  tower: string;
  floor: string;
  configurationTypeId: string;
  area: string;
  bookingDate: string;
  agreementValue: string;
  tokenAmount: string;
  paymentPlan: string;
  builderReference: string;
  remarks: string;
}

const NONE = "__none__";

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Booking form (M08-07, M08-09): project and unit, dates, the customer, values (only with `bookings.view_value`),
 * the credited executive and documents. Text fields are read from the form on submit, so what was typed before the
 * page finished loading is kept.
 */
export function BookingForm({
  mode,
  leadId,
  bookingId,
  initial,
  options,
}: {
  mode: "create" | "edit";
  leadId: string;
  bookingId?: string;
  initial: BookingFormValues;
  options: BookingFormOptions;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initial.projectId);
  const [executiveId, setExecutiveId] = useState(initial.executiveId);
  const [visitId, setVisitId] = useState(initial.visitId || NONE);
  const [configurationTypeId, setConfigurationTypeId] = useState(
    initial.configurationTypeId || NONE,
  );
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const interested = options.projects.filter((project) => project.interested);
  const others = options.projects.filter((project) => !project.interested);

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    if (!projectId) return void setErrors({ projectId: "Choose the project" });
    const values: Record<string, unknown> = {
      projectId,
      customerName: text("customerName"),
      coApplicantName: text("coApplicantName") || null,
      unitNumber: text("unitNumber") || null,
      tower: text("tower") || null,
      floor: text("floor") || null,
      configurationTypeId: configurationTypeId === NONE ? null : configurationTypeId,
      area: text("area") || null,
      bookingDate: text("bookingDate"),
      paymentPlan: text("paymentPlan") || null,
      builderReference: text("builderReference") || null,
      remarks: text("remarks") || null,
      ...(options.canSeeValues
        ? {
            agreementValue: text("agreementValue") || null,
            tokenAmount: text("tokenAmount") || null,
          }
        : {}),
      ...(executiveId ? { executiveId } : {}),
    };
    setErrors({});
    setBusy("Saving…");
    const result =
      mode === "create"
        ? await createBookingAction({
            values: { ...values, leadId, visitId: visitId === NONE ? null : visitId },
          })
        : await updateBookingAction({
            values: { ...values, bookingId, note: text("note") || null },
          });
    const error = actionErrorMessage(result);
    if (error) {
      setBusy(null);
      const fields = (result?.serverError as ClientActionError | undefined)?.fieldErrors ?? {};
      setErrors(
        Object.fromEntries(Object.entries(fields).map(([key, list]) => [key, list[0] ?? ""])),
      );
      toast.error(error);
      return;
    }
    if (mode === "create") {
      const created = result?.data as { id: string; number: string };
      let failed = 0;
      for (const [index, file] of files.entries()) {
        setBusy(`Uploading ${index + 1} of ${files.length}…`);
        try {
          await uploadBookingDocument(created.id, file);
        } catch (uploadError) {
          failed += 1;
          toast.error((uploadError as Error).message);
        }
      }
      toast.success(
        `Booking ${created.number} created${failed ? ` — ${failed} document(s) could not be added` : ""}`,
      );
      router.push(`/bookings/${created.id}`);
      return;
    }
    const changed = (result?.data as { changed: string[] } | undefined)?.changed ?? [];
    toast.success(changed.length ? `Booking updated: ${changed.join(", ")}` : "Nothing changed");
    router.push(`/bookings/${bookingId}`);
    router.refresh();
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project and unit</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field id="booking-project" label="Project" error={errors.projectId}>
                <Select
                  value={projectId}
                  onValueChange={(value) => {
                    setProjectId(value);
                    setErrors({});
                  }}
                >
                  <SelectTrigger
                    id="booking-project"
                    className="w-full"
                    aria-invalid={Boolean(errors.projectId)}
                  >
                    <SelectValue placeholder="Choose the project" />
                  </SelectTrigger>
                  <SelectContent>
                    {interested.length ? (
                      <SelectGroup>
                        <SelectLabel>Interested in</SelectLabel>
                        {interested.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name} · {project.builderName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                    {others.length ? (
                      <SelectGroup>
                        <SelectLabel>Other projects</SelectLabel>
                        {others.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name} · {project.builderName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field id="booking-tower" label="Tower / wing" error={errors.tower}>
              <Input id="booking-tower" name="tower" maxLength={60} defaultValue={initial.tower} />
            </Field>
            <Field id="booking-unit" label="Unit number" error={errors.unitNumber}>
              <Input
                id="booking-unit"
                name="unitNumber"
                maxLength={30}
                defaultValue={initial.unitNumber}
              />
            </Field>
            <Field id="booking-floor" label="Floor" error={errors.floor}>
              <Input id="booking-floor" name="floor" maxLength={20} defaultValue={initial.floor} />
            </Field>
            <Field id="booking-configuration" label="Configuration">
              <Select value={configurationTypeId} onValueChange={setConfigurationTypeId}>
                <SelectTrigger id="booking-configuration" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not recorded</SelectItem>
                  {options.configurations.map((configuration) => (
                    <SelectItem key={configuration.id} value={configuration.id}>
                      {configuration.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="booking-area" label="Carpet area (sq ft)" error={errors.area}>
              <Input
                id="booking-area"
                name="area"
                inputMode="decimal"
                maxLength={20}
                defaultValue={initial.area}
              />
            </Field>
            <Field id="booking-date" label="Booking date" error={errors.bookingDate}>
              <Input
                id="booking-date"
                name="bookingDate"
                type="date"
                required
                defaultValue={initial.bookingDate}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="booking-customer" label="Customer name" error={errors.customerName}>
              <Input
                id="booking-customer"
                name="customerName"
                required
                maxLength={120}
                defaultValue={initial.customerName}
              />
            </Field>
            <Field id="booking-co-applicant" label="Co-applicant" error={errors.coApplicantName}>
              <Input
                id="booking-co-applicant"
                name="coApplicantName"
                maxLength={120}
                defaultValue={initial.coApplicantName}
              />
            </Field>
            {options.executives.length > 0 ? (
              <Field
                id="booking-executive"
                label="Credited to"
                error={errors.executiveId}
                hint="The executive who gets the booking in reports."
              >
                <Select value={executiveId} onValueChange={setExecutiveId}>
                  <SelectTrigger id="booking-executive" className="w-full">
                    <SelectValue placeholder="The lead's owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.executives.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {mode === "create" && options.visits.length > 0 ? (
              <Field id="booking-visit" label="After the visit">
                <Select value={visitId} onValueChange={setVisitId}>
                  <SelectTrigger id="booking-visit" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not after a visit</SelectItem>
                    {options.visits.map((visit) => (
                      <SelectItem key={visit.id} value={visit.id}>
                        {visit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
            {!options.canSeeValues ? (
              <CardDescription>
                Agreement value and token amount are entered by people allowed to see booking
                values.
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {options.canSeeValues ? (
              <>
                <Field
                  id="booking-agreement-value"
                  label="Agreement value"
                  error={errors.agreementValue}
                  hint="e.g. 8500000, 85 L or 1.2 Cr"
                >
                  <Input
                    id="booking-agreement-value"
                    name="agreementValue"
                    maxLength={40}
                    defaultValue={initial.agreementValue}
                  />
                </Field>
                <Field id="booking-token" label="Token amount" error={errors.tokenAmount}>
                  <Input
                    id="booking-token"
                    name="tokenAmount"
                    maxLength={40}
                    defaultValue={initial.tokenAmount}
                  />
                </Field>
              </>
            ) : null}
            <Field id="booking-payment-plan" label="Payment plan" error={errors.paymentPlan}>
              <Input
                id="booking-payment-plan"
                name="paymentPlan"
                maxLength={200}
                placeholder="Construction linked, 20:80…"
                defaultValue={initial.paymentPlan}
              />
            </Field>
            <Field
              id="booking-builder-reference"
              label="Builder's reference"
              error={errors.builderReference}
            >
              <Input
                id="booking-builder-reference"
                name="builderReference"
                maxLength={60}
                defaultValue={initial.builderReference}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{mode === "create" ? "Remarks and documents" : "Remarks"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="booking-remarks" label="Remarks" error={errors.remarks}>
              <Textarea
                id="booking-remarks"
                name="remarks"
                rows={3}
                maxLength={2000}
                defaultValue={initial.remarks}
              />
            </Field>
            {mode === "create" ? (
              <div className="space-y-2">
                <Label htmlFor="booking-documents">Documents</Label>
                <Input
                  id="booking-documents"
                  type="file"
                  multiple
                  accept="application/pdf,image/*,.doc,.docx"
                  onChange={(event) => {
                    const picked = [...(event.target.files ?? [])];
                    const accepted = picked.filter(isBookingDocument);
                    if (accepted.length < picked.length) {
                      toast.error("Only PDF, image and Word files can be added.");
                    }
                    setFiles((current) => [...current, ...accepted]);
                    event.target.value = "";
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Booking form, cheque copy, KYC… up to 20 MB each.
                </p>
                {files.length ? (
                  <ul className="space-y-1 text-sm">
                    {files.map((file, index) => (
                      <li key={`${file.name}-${index}`} className="flex items-center gap-2">
                        <FileUp className="size-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Remove ${file.name}`}
                          onClick={() =>
                            setFiles((current) =>
                              current.filter((_, position) => position !== index),
                            )
                          }
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <Field
                id="booking-note"
                label="Why the change?"
                hint="Kept with the change in the booking's history."
              >
                <Input id="booking-note" name="note" maxLength={500} />
              </Field>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={Boolean(busy)}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> {busy}
            </>
          ) : mode === "create" ? (
            "Create booking"
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
