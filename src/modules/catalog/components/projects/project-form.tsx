"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { type ReactNode, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { applyActionErrors } from "@/lib/action-result";
import { parseAmountInput } from "@/lib/decimal";

import { createProjectAction, updateProjectAction } from "../../actions";
import {
  PROJECT_STATUSES,
  type ProjectInput,
  projectSchema,
  type ProjectValues,
} from "../../schemas";
import type { CatalogOptions } from "../../server/masters";
import type { ProjectDetail } from "../../server/projects";
import { PriceRange } from "../shared/price-range";

type FormInput = {
  [K in keyof ProjectInput]-?: NonNullable<ProjectInput[K]>;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function toDefaults(project: ProjectDetail | undefined, builderId: string | undefined): FormInput {
  return {
    builderId: project?.builder.id ?? builderId ?? "",
    name: project?.name ?? "",
    code: project?.code ?? "",
    status: project?.status ?? "UPCOMING",
    reraNumber: project?.reraNumber ?? "",
    addressLine: project?.addressLine ?? "",
    locality: project?.locality ?? "",
    city: project?.city ?? "",
    state: project?.state ?? "",
    postalCode: project?.postalCode ?? "",
    mapUrl: project?.mapUrl ?? "",
    launchDate: project?.launchDate ?? "",
    possessionDate: project?.possessionDate ?? "",
    possessionNote: project?.possessionNote ?? "",
    totalTowers:
      project?.totalTowers === null || project?.totalTowers === undefined
        ? ""
        : String(project.totalTowers),
    totalUnits:
      project?.totalUnits === null || project?.totalUnits === undefined
        ? ""
        : String(project.totalUnits),
    projectArea: project?.projectArea ?? "",
    description: project?.description ?? "",
    highlights: project?.highlights ?? [],
    propertyTypeIds: project?.propertyTypes.map((entry) => entry.id) ?? [],
    amenityIds: project?.amenities.map((entry) => entry.id) ?? [],
    configurations:
      project?.configurations.map((configuration) => ({
        configurationTypeId: configuration.configurationTypeId,
        carpetAreaMin: configuration.carpetAreaMin ?? "",
        carpetAreaMax: configuration.carpetAreaMax ?? "",
        priceMin: configuration.priceMin ?? "",
        priceMax: configuration.priceMax ?? "",
        notes: configuration.notes ?? "",
      })) ?? [],
  } as FormInput;
}

/** Sectioned project form (M03-07): basics, location, timeline, configurations & pricing, amenities, story. */
export function ProjectForm({
  project,
  builderId,
  builders,
  options,
}: {
  project?: ProjectDetail;
  builderId?: string;
  builders: { id: string; name: string; isActive: boolean }[];
  options: CatalogOptions;
}) {
  const router = useRouter();
  const form = useForm<FormInput, unknown, ProjectValues>({
    resolver: zodResolver(projectSchema) as never,
    defaultValues: toDefaults(project, builderId),
  });
  const configurations = useFieldArray({ control: form.control, name: "configurations" });
  const create = useAction(createProjectAction);
  const update = useAction(updateProjectAction);
  const [highlight, setHighlight] = useState("");
  const highlights = useWatch({ control: form.control, name: "highlights" }) ?? [];
  const watchedConfigurations = useWatch({ control: form.control, name: "configurations" }) ?? [];

  // Selected masters that were deactivated since stay selectable on this project.
  const withCurrent = <T extends { id: string; name: string }>(
    list: T[],
    current: { id: string; name: string }[],
  ) => [...list, ...current.filter((entry) => !list.some((item) => item.id === entry.id))];
  const propertyTypes = withCurrent(options.propertyTypes, project?.propertyTypes ?? []);
  const amenities = withCurrent(options.amenities, project?.amenities ?? []);
  const configurationTypes = withCurrent(
    options.configurationTypes,
    project?.configurations.map((entry) => ({ id: entry.configurationTypeId, name: entry.name })) ??
      [],
  );
  const builderChoices = builders.filter(
    (builder) => builder.isActive || builder.id === project?.builder.id,
  );

  const preview = (() => {
    let low: string | null = null;
    let high: string | null = null;
    for (const row of watchedConfigurations) {
      const min =
        parseAmountInput(String(row?.priceMin ?? "")) ??
        parseAmountInput(String(row?.priceMax ?? ""));
      const max = parseAmountInput(String(row?.priceMax ?? "")) ?? min;
      if (min && (!low || Number(min) < Number(low))) low = min;
      if (max && (!high || Number(max) > Number(high))) high = max;
    }
    return { low, high };
  })();

  const onSubmit = form.handleSubmit(async (values) => {
    if (project) {
      const result = await update.executeAsync({ projectId: project.id, ...values });
      const error = applyActionErrors(form, result);
      if (error) return void toast.error(error);
      toast.success("Project saved");
      router.push(`/projects/${project.id}`);
      router.refresh();
      return;
    }
    const result = await create.executeAsync(values);
    const error = applyActionErrors(form, result);
    if (error) return void toast.error(error);
    toast.success(`${values.name} added as ${result?.data?.code}`);
    if (result?.data) router.push(`/projects/${result.data.id}`);
  });

  const addHighlight = () => {
    const text = highlight.trim();
    if (!text) return;
    if (highlights.length >= 12) return void toast.error("Up to 12 highlights.");
    form.setValue("highlights", [...highlights, text], { shouldDirty: true });
    setHighlight("");
  };

  const textField = (
    name: keyof FormInput,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    span = false,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={span ? "sm:col-span-2" : undefined}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...props} {...field} value={String(field.value ?? "")} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <Section title="Basics" description="Who builds it and what it is.">
          <FormField
            control={form.control}
            name="builderId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Builder</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose the builder" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {builderChoices.map((builder) => (
                      <SelectItem key={builder.id} value={builder.id}>
                        {builder.name}
                        {builder.isActive ? "" : " (inactive)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {textField("name", "Project name", {
            autoFocus: !project,
            placeholder: "Riverfront Heights",
          })}
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PROJECT_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Code</FormLabel>
                <FormControl>
                  <Input
                    className="uppercase placeholder:normal-case"
                    placeholder={project ? undefined : "Generated if blank"}
                    {...field}
                    value={String(field.value ?? "")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {textField("reraNumber", "RERA / registration number", { placeholder: "P52100012345" })}
          <FormField
            control={form.control}
            name="propertyTypeIds"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Property types</FormLabel>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Property types">
                  {propertyTypes.map((type) => {
                    const checked = (field.value as string[]).includes(type.id);
                    return (
                      <label
                        key={type.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) =>
                            field.onChange(
                              next
                                ? [...(field.value as string[]), type.id]
                                : (field.value as string[]).filter((id) => id !== type.id),
                            )
                          }
                        />
                        {type.name}
                      </label>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <Section title="Location">
          {textField("addressLine", "Address", {}, true)}
          {textField("locality", "Locality", { placeholder: "Kharadi" })}
          {textField("city", "City", { placeholder: "Pune" })}
          {textField("state", "State")}
          {textField("postalCode", "PIN code", { inputMode: "numeric" })}
          {textField(
            "mapUrl",
            "Map link",
            { type: "url", placeholder: "https://maps.google.com/…" },
            true,
          )}
        </Section>

        <Section title="Launch & possession">
          {textField("launchDate", "Launch date", { type: "date" })}
          {textField("possessionDate", "Possession date", { type: "date" })}
          {textField(
            "possessionNote",
            "Possession note",
            { placeholder: "RERA possession Dec 2027; tower B earlier" },
            true,
          )}
        </Section>

        <Card>
          <CardHeader>
            <CardTitle>Configurations & pricing</CardTitle>
            <CardDescription>
              One row per unit type. Prices accept 8500000, 85,00,000, 85 L or 1.2 Cr. The
              project&apos;s price range is calculated from these rows:{" "}
              <span className="font-medium text-foreground">
                <PriceRange min={preview.low} max={preview.high} empty="not set yet" />
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {configurations.fields.map((row, index) => (
              <div
                key={row.id}
                className="grid gap-3 rounded-lg border p-3 md:grid-cols-12 md:items-start"
              >
                <FormField
                  control={form.control}
                  name={`configurations.${index}.configurationTypeId`}
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel className="md:sr-only">Configuration</FormLabel>
                      <Select value={String(field.value ?? "")} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger
                            className="w-full"
                            aria-label={`Configuration ${index + 1}`}
                          >
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {configurationTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(
                  [
                    ["carpetAreaMin", "Area from (sq ft)", "numeric"],
                    ["carpetAreaMax", "Area to (sq ft)", "numeric"],
                    ["priceMin", "Price from", "text"],
                    ["priceMax", "Price to", "text"],
                  ] as const
                ).map(([key, label, inputMode]) => (
                  <FormField
                    key={key}
                    control={form.control}
                    name={`configurations.${index}.${key}`}
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="md:sr-only">{label}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={label}
                            aria-label={`${label} (row ${index + 1})`}
                            inputMode={inputMode}
                            {...field}
                            value={String(field.value ?? "")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <FormField
                  control={form.control}
                  name={`configurations.${index}.notes`}
                  render={({ field }) => (
                    <FormItem className="md:col-span-1">
                      <FormLabel className="md:sr-only">Note</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Note"
                          aria-label={`Note (row ${index + 1})`}
                          {...field}
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="justify-self-end md:col-span-1"
                  aria-label={`Remove configuration ${index + 1}`}
                  onClick={() => configurations.remove(index)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                configurations.append({
                  configurationTypeId: "",
                  carpetAreaMin: "",
                  carpetAreaMax: "",
                  priceMin: "",
                  priceMax: "",
                  notes: "",
                })
              }
            >
              <Plus /> Add configuration
            </Button>
            {form.formState.errors.configurations?.message ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.configurations.message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Section title="Project facts">
          {textField("totalTowers", "Towers", { inputMode: "numeric" })}
          {textField("totalUnits", "Total units", { inputMode: "numeric" })}
          {textField("projectArea", "Land area", { placeholder: "12 acres" })}
        </Section>

        <Card>
          <CardHeader>
            <CardTitle>Amenities</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="amenityIds"
              render={({ field }) => (
                <FormItem>
                  <div
                    className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                    role="group"
                    aria-label="Amenities"
                  >
                    {amenities.map((amenity) => {
                      const checked = (field.value as string[]).includes(amenity.id);
                      return (
                        <label
                          key={amenity.id}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) =>
                              field.onChange(
                                next
                                  ? [...(field.value as string[]), amenity.id]
                                  : (field.value as string[]).filter((id) => id !== amenity.id),
                              )
                            }
                          />
                          {amenity.name}
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Description & highlights</CardTitle>
            <CardDescription>
              What executives should tell customers about the project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={5} {...field} value={String(field.value ?? "")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium">Highlights</p>
              <div className="flex gap-2">
                <Input
                  value={highlight}
                  placeholder="e.g. 5 minutes from the metro"
                  aria-label="New highlight"
                  maxLength={160}
                  onChange={(event) => setHighlight(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addHighlight();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addHighlight}>
                  <Plus /> Add
                </Button>
              </div>
              {highlights.length > 0 ? (
                <ul className="space-y-1">
                  {highlights.map((item, index) => (
                    <li
                      key={`${item}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-sm"
                    >
                      {item}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove highlight ${item}`}
                        onClick={() =>
                          form.setValue(
                            "highlights",
                            highlights.filter((_, position) => position !== index),
                            { shouldDirty: true },
                          )
                        }
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <FormDescription>
                  Short selling points shown on the project and in the quick-info drawer.
                </FormDescription>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <SubmitButton pending={form.formState.isSubmitting}>
            {project ? "Save project" : "Add project"}
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
