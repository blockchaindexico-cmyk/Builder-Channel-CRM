import { getCatalogOptions, listProjectOptions } from "@/modules/catalog";
import { listMemberOptions } from "@/modules/identity";
import { getRegionalSettings } from "@/modules/organization";
import type { ServiceContext } from "@/platform/tenant/context";

import { BUYING_TIMELINES, PURPOSES, TEMPERATURES } from "../../constants";
import {
  IMPORT_FIELDS,
  type ImportFieldKey,
  type ImportMapping,
  type ImportOptions,
} from "../../import-fields";
import { type CreateLeadInput, createLeadSchema } from "../../schemas";
import { contactNumberErrors } from "../normalize";

/**
 * Turns names and codes typed in a file or sent to the intake API ("99acres", "2 BHK, 3 BHK", "PRJ-0001",
 * "rahul@…") into the organization's records, with readable errors per row (M04-18, M04-20).
 */
export interface LeadLookups {
  /** Organization's default phone country (ISO 3166 alpha-2). */
  country: string;
  sources: Map<string, { id: string; name: string; isActive: boolean }>;
  campaigns: Map<string, { id: string; name: string; isActive: boolean }>;
  propertyTypes: Map<string, string>;
  configurations: Map<string, string>;
  projects: Map<string, { id: string; name: string; isActive: boolean }>;
  owners: Map<string, string | null>;
}

const key = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function addUnique<T>(map: Map<string, T | null>, name: string, value: T) {
  const normalized = key(name);
  if (!normalized) return;
  // A name shared by two records is ambiguous: keep it, but resolve to nothing.
  map.set(normalized, map.has(normalized) && map.get(normalized) !== value ? null : value);
}

export async function loadLeadLookups(ctx: ServiceContext): Promise<LeadLookups> {
  const [regional, sources, campaigns, catalog, projects, members] = await Promise.all([
    getRegionalSettings(ctx),
    ctx.db.leadSource.findMany({ select: { id: true, name: true, code: true, isActive: true } }),
    ctx.db.campaign.findMany({ select: { id: true, name: true, code: true, isActive: true } }),
    getCatalogOptions(ctx).catch(() => ({ propertyTypes: [], configurationTypes: [] })),
    listProjectOptions(ctx),
    listMemberOptions(ctx),
  ]);
  const lookups: LeadLookups = {
    country: regional.country,
    sources: new Map(),
    campaigns: new Map(),
    propertyTypes: new Map(),
    configurations: new Map(),
    projects: new Map(),
    owners: new Map(),
  };
  for (const source of sources) {
    lookups.sources.set(key(source.name), source);
    lookups.sources.set(key(source.code), source);
  }
  for (const campaign of campaigns) {
    lookups.campaigns.set(key(campaign.name), campaign);
    lookups.campaigns.set(key(campaign.code), campaign);
  }
  for (const type of catalog.propertyTypes) lookups.propertyTypes.set(key(type.name), type.id);
  for (const type of catalog.configurationTypes)
    lookups.configurations.set(key(type.name), type.id);
  for (const project of projects) {
    lookups.projects.set(key(project.code), project);
    lookups.projects.set(key(project.name), project);
  }
  for (const member of members) {
    if (member.status !== "ACTIVE") continue;
    lookups.owners.set(key(member.email), member.membershipId);
    if (member.employeeCode) addUnique(lookups.owners, member.employeeCode, member.membershipId);
    addUnique(lookups.owners, member.name, member.membershipId);
  }
  return lookups;
}

/** Splits "2 BHK, 3 BHK" / "Kharadi; Wakad" / "a | b" into items. */
export function splitList(value: string): string[] {
  return value
    .split(/[,;|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchChoice<T extends string>(
  value: string,
  choices: readonly { value: T; label: string }[],
): T | null {
  const wanted = key(value);
  return (
    choices.find((choice) => key(choice.value) === wanted || key(choice.label) === wanted)?.value ??
    null
  );
}

const choiceList = (choices: readonly { label: string }[]) =>
  choices.map((choice) => choice.label).join(", ");

/** Raw values of one lead, keyed by import field (from a file row or an API request). */
export type RawLeadValues = Partial<Record<ImportFieldKey, string>>;

export interface FieldProblem {
  /** Import field key (e.g. "mobile", "source"), or "" for problems of the whole lead. */
  field: string;
  message: string;
}

export type ResolvedLead =
  | { ok: true; input: CreateLeadInput; ownerId: string | null | undefined }
  | { ok: false; problems: FieldProblem[]; errors: string[] };

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  IMPORT_FIELDS.map((field) => [field.key, field.label]),
);
/** Lead-form field → import field, for messages of the lead schema. */
const SCHEMA_FIELDS: Record<string, string> = {
  sourceId: "source",
  campaignId: "campaign",
  propertyTypeId: "propertyType",
  configurationTypeIds: "configurations",
  interests: "projects",
};

/** "Mobile: Enter a valid mobile number". */
export function describeProblem(problem: FieldProblem): string {
  const label = FIELD_LABELS[problem.field];
  return label ? `${label}: ${problem.message}` : problem.message;
}

export function resolveLeadValues(
  raw: RawLeadValues,
  lookups: LeadLookups,
  options: Pick<ImportOptions, "defaultSourceId">,
): ResolvedLead {
  const problems: FieldProblem[] = [];
  const problem = (field: string, message: string) => problems.push({ field, message });
  const text = (field: ImportFieldKey) => raw[field]?.trim() ?? "";

  let sourceId = options.defaultSourceId;
  if (text("source")) {
    const source = lookups.sources.get(key(text("source")));
    if (!source) problem("source", `"${text("source")}" is not a lead source`);
    else if (!source.isActive) problem("source", `"${source.name}" is inactive`);
    else sourceId = source.id;
  }
  let campaignId: string | null = null;
  if (text("campaign")) {
    const campaign = lookups.campaigns.get(key(text("campaign")));
    if (!campaign) problem("campaign", `"${text("campaign")}" is not a campaign`);
    else if (!campaign.isActive) problem("campaign", `"${campaign.name}" is inactive`);
    else campaignId = campaign.id;
  }
  let propertyTypeId: string | null = null;
  if (text("propertyType")) {
    propertyTypeId = lookups.propertyTypes.get(key(text("propertyType"))) ?? null;
    if (!propertyTypeId)
      problem("propertyType", `"${text("propertyType")}" is not a property type`);
  }
  const configurationTypeIds: string[] = [];
  for (const name of splitList(text("configurations"))) {
    const id = lookups.configurations.get(key(name));
    if (id) configurationTypeIds.push(id);
    else problem("configurations", `"${name}" is not a configuration`);
  }
  const interests: { projectId: string }[] = [];
  for (const name of splitList(text("projects"))) {
    const project = lookups.projects.get(key(name));
    if (!project) problem("projects", `"${name}" is not a project`);
    else if (!interests.some((interest) => interest.projectId === project.id))
      interests.push({ projectId: project.id });
  }
  let purpose: string | null = null;
  if (text("purpose")) {
    purpose = matchChoice(text("purpose"), PURPOSES);
    if (!purpose) problem("purpose", `use ${choiceList(PURPOSES)}`);
  }
  let buyingTimeline: string | null = null;
  if (text("buyingTimeline")) {
    buyingTimeline = matchChoice(text("buyingTimeline"), BUYING_TIMELINES);
    if (!buyingTimeline) problem("buyingTimeline", `use ${choiceList(BUYING_TIMELINES)}`);
  }
  let temperature: string | null = null;
  if (text("temperature")) {
    temperature = matchChoice(text("temperature"), TEMPERATURES);
    if (!temperature) problem("temperature", `use ${choiceList(TEMPERATURES)}`);
  }
  let ownerId: string | null | undefined;
  if (text("owner")) {
    ownerId = lookups.owners.get(key(text("owner"))) ?? undefined;
    if (!ownerId) problem("owner", `"${text("owner")}" is not an active user`);
  }

  const input: CreateLeadInput = {
    name: text("name"),
    mobile: text("mobile"),
    alternateMobile: text("alternateMobile"),
    email: text("email"),
    city: text("city"),
    locality: text("locality"),
    address: text("address"),
    sourceId: sourceId ?? "",
    campaignId: campaignId ?? "",
    subSource: text("subSource"),
    budgetMin: text("budgetMin"),
    budgetMax: text("budgetMax"),
    propertyTypeId: propertyTypeId ?? "",
    configurationTypeIds,
    preferredLocations: splitList(text("preferredLocations")),
    purpose: (purpose ?? "") as CreateLeadInput["purpose"],
    buyingTimeline: (buyingTimeline ?? "") as CreateLeadInput["buyingTimeline"],
    temperature: (temperature ?? "") as CreateLeadInput["temperature"],
    tags: splitList(text("tags")),
    requirementNotes: text("requirementNotes"),
    interests,
    note: text("note"),
  };
  for (const [field, messages] of Object.entries(contactNumberErrors(input, lookups.country))) {
    problem(field, messages[0]!);
  }
  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      problem(SCHEMA_FIELDS[field] ?? field, issue.message);
    }
  }
  if (problems.length) {
    const unique = problems.filter(
      (entry, index) =>
        problems.findIndex(
          (other) => other.field === entry.field && other.message === entry.message,
        ) === index,
    );
    return { ok: false, problems: unique, errors: unique.map(describeProblem) };
  }
  return { ok: true, input, ownerId };
}

/** Values of one file row according to the column mapping. */
export function rowValues(cells: readonly string[], mapping: ImportMapping): RawLeadValues {
  const values: RawLeadValues = {};
  for (const [field, column] of Object.entries(mapping) as [ImportFieldKey, number | null][]) {
    if (column !== null && column !== undefined) values[field] = cells[column] ?? "";
  }
  return values;
}
