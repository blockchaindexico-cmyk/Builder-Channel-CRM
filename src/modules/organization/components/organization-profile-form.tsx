"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { SubmitButton } from "@/components/shared/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyActionErrors } from "@/lib/action-result";

import { updateOrganizationProfileAction } from "../actions";
import {
  DATE_FORMATS,
  MONTHS,
  type OrganizationProfileInput,
  organizationProfileSchema,
  type OrganizationProfileValues,
  SUPPORTED_LOCALES,
  WEEKDAYS,
} from "../schemas";

const COMMON_CURRENCIES = [
  "INR",
  "USD",
  "AED",
  "EUR",
  "GBP",
  "SGD",
  "AUD",
  "CAD",
  "SAR",
  "QAR",
  "KWD",
  "OMR",
  "NZD",
];

function toFormValues(values: OrganizationProfileValues): OrganizationProfileInput {
  return {
    name: values.name,
    legalName: values.legalName ?? "",
    email: values.email ?? "",
    phone: values.phone ?? "",
    website: values.website ?? "",
    addressLine1: values.addressLine1 ?? "",
    addressLine2: values.addressLine2 ?? "",
    city: values.city ?? "",
    state: values.state ?? "",
    postalCode: values.postalCode ?? "",
    country: values.country,
    timezone: values.timezone,
    currency: values.currency,
    locale: values.locale,
    dateFormat: values.dateFormat,
    fiscalYearStartMonth: values.fiscalYearStartMonth,
    weekStartsOn: values.weekStartsOn,
  };
}

/** Organization profile & regional settings form (M01-24). */
export function OrganizationProfileForm({
  values,
  timezones,
  canEdit,
}: {
  values: OrganizationProfileValues;
  timezones: string[];
  canEdit: boolean;
}) {
  const form = useForm<OrganizationProfileInput, unknown, OrganizationProfileValues>({
    resolver: zodResolver(organizationProfileSchema),
    defaultValues: toFormValues(values),
    mode: "onBlur",
  });
  const { executeAsync, isPending } = useAction(updateOrganizationProfileAction);
  const currencies = COMMON_CURRENCIES.includes(values.currency)
    ? COMMON_CURRENCIES
    : [values.currency, ...COMMON_CURRENCIES];

  const onSubmit = form.handleSubmit(async (parsed) => {
    const result = await executeAsync(parsed);
    const error = applyActionErrors(form, result);
    if (error) {
      toast.error(error);
      return;
    }
    if (result?.data) form.reset(toFormValues(result.data));
    toast.success("Organization profile saved");
  });

  const text = (
    name: keyof OrganizationProfileInput,
    label: string,
    options: { placeholder?: string; type?: string; description?: string } = {},
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={options.type ?? "text"}
              placeholder={options.placeholder}
              disabled={!canEdit}
              {...field}
              value={(field.value as string | number | null | undefined) ?? ""}
            />
          </FormControl>
          {options.description ? <FormDescription>{options.description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const select = (
    name:
      "timezone" | "currency" | "locale" | "dateFormat" | "fiscalYearStartMonth" | "weekStartsOn",
    label: string,
    options: { value: string; label: string }[],
    description?: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={String(field.value)} onValueChange={field.onChange} disabled={!canEdit}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent className="max-h-72">
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Company details</CardTitle>
            <CardDescription>Shown in the app, on e-mails and later on invoices.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {text("name", "Display name", { placeholder: "Skyline Realty Partners" })}
            {text("legalName", "Legal name", { placeholder: "Skyline Realty Partners LLP" })}
            {text("email", "Contact e-mail", { type: "email", placeholder: "hello@example.com" })}
            {text("phone", "Phone", { type: "tel", placeholder: "+91 98200 00000" })}
            <div className="md:col-span-2">
              {text("website", "Website", { type: "url", placeholder: "https://example.com" })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">{text("addressLine1", "Address line 1")}</div>
            <div className="md:col-span-2">{text("addressLine2", "Address line 2")}</div>
            {text("city", "City")}
            {text("state", "State / region")}
            {text("postalCode", "Postal code")}
            {text("country", "Country code", {
              placeholder: "IN",
              description: "Two-letter ISO code. Also the default region for phone numbers.",
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Regional settings</CardTitle>
            <CardDescription>
              Dates and times are stored in UTC and shown in this timezone; amounts use this
              currency.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {select(
              "timezone",
              "Timezone",
              timezones.map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") })),
            )}
            {select(
              "currency",
              "Currency",
              currencies.map((code) => ({ value: code, label: code })),
            )}
            {select(
              "locale",
              "Number format",
              SUPPORTED_LOCALES.map((l) => ({ value: l.value, label: l.label })),
            )}
            {select(
              "dateFormat",
              "Date format",
              DATE_FORMATS.map((f) => ({ value: f.value, label: f.label })),
            )}
            {select(
              "fiscalYearStartMonth",
              "Financial year starts in",
              MONTHS.map((month, index) => ({ value: String(index + 1), label: month })),
              "Used for invoice numbering and financial reports.",
            )}
            {select(
              "weekStartsOn",
              "Week starts on",
              WEEKDAYS.map((day, index) => ({ value: String(index), label: day })),
            )}
          </CardContent>
          {canEdit ? (
            <CardFooter className="justify-end gap-2 border-t">
              <SubmitButton
                pending={isPending || form.formState.isSubmitting}
                disabled={!form.formState.isDirty}
              >
                Save changes
              </SubmitButton>
            </CardFooter>
          ) : null}
        </Card>
      </form>
    </Form>
  );
}
