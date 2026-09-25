"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { type ReactNode, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { SubmitButton } from "@/components/shared/submit-button";
import { TagInput } from "@/components/shared/tag-input";
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

import { checkDuplicatesAction, createLeadAction, updateLeadAction } from "../actions";
import { BUYING_TIMELINES, INTEREST_LEVELS, PURPOSES, TEMPERATURES } from "../constants";
import { type CreateLeadInput, createLeadSchema, type CreateLeadValues } from "../schemas";
import type { DuplicateMatch, LeadDetail } from "../server/leads";

const NONE = "__none__";

export interface LeadFormOptions {
  sources: { id: string; name: string }[];
  campaigns: { id: string; name: string; sourceId: string | null }[];
  propertyTypes: { id: string; name: string }[];
  configurationTypes: { id: string; name: string }[];
  projects: { id: string; name: string; builderName: string; isActive: boolean }[];
  duplicatePolicy: "FLAG" | "BLOCK" | "ALLOW";
}

type FormInput = { [K in keyof CreateLeadInput]-?: NonNullable<CreateLeadInput[K]> };

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

function toDefaults(lead?: LeadDetail): FormInput {
  return {
    name: lead?.name ?? "",
    mobile: lead?.mobile ?? "",
    alternateMobile: lead?.alternateMobile ?? "",
    email: lead?.email ?? "",
    city: lead?.city ?? "",
    locality: lead?.locality ?? "",
    address: lead?.address ?? "",
    sourceId: lead?.source?.id ?? "",
    campaignId: lead?.campaign?.id ?? "",
    subSource: lead?.subSource ?? "",
    budgetMin: lead?.budgetMin ?? "",
    budgetMax: lead?.budgetMax ?? "",
    propertyTypeId: lead?.propertyType?.id ?? "",
    configurationTypeIds: lead?.configurations.map((entry) => entry.id) ?? [],
    preferredLocations: lead?.preferredLocations ?? [],
    purpose: lead?.purpose ?? "",
    buyingTimeline: lead?.buyingTimeline ?? "",
    requirementNotes: lead?.requirementNotes ?? "",
    temperature: lead?.temperature ?? "",
    tags: lead?.tags ?? [],
    interests:
      lead?.interests.map((interest) => ({
        projectId: interest.projectId,
        level: interest.level,
      })) ?? [],
    note: "",
  } as FormInput;
}

/** Create / edit a lead (M04-05, M04-06) with a live duplicate check on the contact fields. */
export function LeadForm({ lead, options }: { lead?: LeadDetail; options: LeadFormOptions }) {
  const router = useRouter();
  const form = useForm<FormInput, unknown, CreateLeadValues>({
    resolver: zodResolver(createLeadSchema) as never,
    defaultValues: toDefaults(lead),
  });
  const interests = useFieldArray({ control: form.control, name: "interests" });
  const create = useAction(createLeadAction);
  const update = useAction(updateLeadAction);
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const sourceId = useWatch({ control: form.control, name: "sourceId" });
  const chosenProjects = useWatch({ control: form.control, name: "interests" }) ?? [];
  const [projectToAdd, setProjectToAdd] = useState<string>("");

  const campaigns = options.campaigns.filter(
    (campaign) => !campaign.sourceId || !sourceId || campaign.sourceId === sourceId,
  );

  async function checkDuplicates() {
    const values = form.getValues();
    if (!values.mobile && !values.email && !values.alternateMobile) return setMatches([]);
    const result = await checkDuplicatesAction({
      mobile: values.mobile,
      alternateMobile: values.alternateMobile,
      email: values.email,
      excludeLeadId: lead?.id ?? "",
    });
    setMatches(result?.data ?? []);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (lead) {
      const { note: _note, ...rest } = values;
      const result = await update.executeAsync({ leadId: lead.id, ...rest });
      const error = applyActionErrors(form, result);
      if (error) return void toast.error(error);
      toast.success(result?.data?.changed.length ? "Lead saved" : "No changes");
      router.push(`/leads/${lead.id}`);
      router.refresh();
      return;
    }
    const result = await create.executeAsync(values);
    const error = applyActionErrors(form, result);
    if (error) return void toast.error(error);
    if (!result?.data) return;
    if (result.data.duplicateOf) {
      toast.warning(
        `${result.data.number} created and flagged as a possible duplicate of ${result.data.duplicateOf.number}`,
      );
    } else toast.success(`Lead ${result.data.number} created`);
    router.push(`/leads/${result.data.id}`);
  });

  const text = (
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
            <Input
              {...props}
              {...field}
              value={String(field.value ?? "")}
              onBlur={(event) => {
                field.onBlur();
                props.onBlur?.(event);
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const select = (
    name: keyof FormInput,
    label: string,
    choices: readonly { value: string; label: string }[],
    placeholder = "Not specified",
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            value={String(field.value || NONE)}
            onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
          >
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NONE}>{placeholder}</SelectItem>
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const availableProjects = options.projects.filter(
    (project) =>
      !chosenProjects.some((interest) => interest?.projectId === project.id) &&
      (project.isActive || lead?.interests.some((interest) => interest.projectId === project.id)),
  );
  const projectLabel = (projectId: string) => {
    const project = options.projects.find((entry) => entry.id === projectId);
    return project ? `${project.name} · ${project.builderName}` : "Project";
  };

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <Section
          title="Customer"
          description="Enter a mobile number or an e-mail address (or both)."
        >
          {text(
            "name",
            "Full name",
            { autoFocus: !lead, placeholder: "Priya Sharma", autoComplete: "off" },
            true,
          )}
          {text("mobile", "Mobile", {
            type: "tel",
            placeholder: "+91 98200 00000",
            onBlur: () => void checkDuplicates(),
          })}
          {text("alternateMobile", "Alternate mobile", {
            type: "tel",
            onBlur: () => void checkDuplicates(),
          })}
          {text("email", "E-mail", { type: "email", onBlur: () => void checkDuplicates() })}
          {text("city", "City")}
          {text("locality", "Locality")}
          {text("address", "Address")}
          {matches.length > 0 ? (
            <div
              className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm sm:col-span-2"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="space-y-1">
                <p className="font-medium">
                  {options.duplicatePolicy === "BLOCK"
                    ? "This customer already exists — the lead cannot be saved with these details."
                    : options.duplicatePolicy === "FLAG"
                      ? "This customer may already exist. The lead will be flagged for duplicate review."
                      : "This customer may already exist."}
                </p>
                <ul className="space-y-0.5">
                  {matches.map((match) => (
                    <li key={match.id}>
                      {match.visible ? (
                        <Link
                          href={`/leads/${match.id}`}
                          className="font-medium text-primary hover:underline"
                          target="_blank"
                        >
                          {match.number} · {match.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{match.number}</span>
                      )}{" "}
                      — same {match.matchedOn.join(" and ")}, {match.statusLabel.toLowerCase()},{" "}
                      {match.ownerName ? `owned by ${match.ownerName}` : "unassigned"}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </Section>

        <Section title="Source">
          <FormField
            control={form.control}
            name="sourceId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source</FormLabel>
                <Select
                  value={String(field.value || NONE)}
                  onValueChange={(value) => {
                    field.onChange(value === NONE ? "" : value);
                    const campaign = options.campaigns.find(
                      (entry) => entry.id === form.getValues("campaignId"),
                    );
                    if (campaign?.sourceId && campaign.sourceId !== value)
                      form.setValue("campaignId", "");
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>Not specified</SelectItem>
                    {options.sources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {select(
            "campaignId",
            "Campaign",
            campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name })),
            "No campaign",
          )}
          {text(
            "subSource",
            "Source detail",
            { placeholder: "Listing ID, referrer, event…" },
            true,
          )}
        </Section>

        <Section title="Requirement">
          {text("budgetMin", "Budget from", { placeholder: "e.g. 80 L" })}
          {text("budgetMax", "Budget up to", { placeholder: "e.g. 1.2 Cr" })}
          {select(
            "propertyTypeId",
            "Property type",
            options.propertyTypes.map((type) => ({ value: type.id, label: type.name })),
          )}
          {select("purpose", "Purpose", PURPOSES)}
          <FormField
            control={form.control}
            name="configurationTypeIds"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Configurations</FormLabel>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Configurations">
                  {options.configurationTypes.map((type) => {
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
          <FormField
            control={form.control}
            name="preferredLocations"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preferred locations</FormLabel>
                <TagInput
                  value={field.value as string[]}
                  onChange={field.onChange}
                  placeholder="Type and press Enter"
                  max={10}
                  maxLength={80}
                  aria-label="Preferred locations"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          {select("buyingTimeline", "Buying timeline", BUYING_TIMELINES)}
          {select("temperature", "Temperature", TEMPERATURES)}
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tags</FormLabel>
                <TagInput
                  value={field.value as string[]}
                  onChange={field.onChange}
                  placeholder="e.g. NRI, loan"
                  aria-label="Tags"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="requirementNotes"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Requirement notes</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Floor, facing, parking, school nearby…"
                    {...field}
                    value={String(field.value ?? "")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <Card>
          <CardHeader>
            <CardTitle>Projects of interest</CardTitle>
            <CardDescription>Builders and projects the customer asked about.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {interests.fields.map((row, index) => (
              <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {projectLabel(chosenProjects[index]?.projectId ?? "")}
                </span>
                <FormField
                  control={form.control}
                  name={`interests.${index}.level`}
                  render={({ field }) => (
                    <Select value={String(field.value ?? "MEDIUM")} onValueChange={field.onChange}>
                      <SelectTrigger size="sm" className="w-44" aria-label="Interest level">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTEREST_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label} interest
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${projectLabel(chosenProjects[index]?.projectId ?? "")}`}
                  onClick={() => interests.remove(index)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {availableProjects.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Select value={projectToAdd} onValueChange={setProjectToAdd}>
                  <SelectTrigger className="w-full sm:w-80" aria-label="Project to add">
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name} · {project.builderName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!projectToAdd}
                  onClick={() => {
                    interests.append({ projectId: projectToAdd, level: "MEDIUM" });
                    setProjectToAdd("");
                  }}
                >
                  <Plus /> Add project
                </Button>
              </div>
            ) : options.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects available.</p>
            ) : null}
            {form.formState.errors.interests?.message ? (
              <p className="text-sm text-destructive">{form.formState.errors.interests.message}</p>
            ) : null}
          </CardContent>
        </Card>

        {!lead ? (
          <Card>
            <CardHeader>
              <CardTitle>First note</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="What did the customer say?"
                        {...field}
                        value={String(field.value ?? "")}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional — added to the lead&apos;s notes and timeline.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        ) : null}

        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <SubmitButton pending={form.formState.isSubmitting}>
            {lead ? "Save lead" : "Create lead"}
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
