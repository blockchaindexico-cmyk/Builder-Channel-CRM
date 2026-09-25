import { z } from "zod";

import { CATALOG_PERMISSIONS } from "@/modules/catalog";
import type { AuthenticatedApiKey } from "@/platform/api/keys";
import { ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";

import { LEAD_PERMISSIONS } from "../permissions";
import { intakeLeadSchema } from "../schemas";
import { loadLeadLookups, type RawLeadValues, resolveLeadValues } from "./import/resolve";
import { createLead } from "./leads";

/**
 * Lead intake API (M04-20): websites, landing pages and portals send leads with an API key. The key acts with
 * exactly these permissions — it can create leads and read the project catalogue to match project codes.
 */
export const INTAKE_API_PERMISSIONS = [LEAD_PERMISSIONS.create, CATALOG_PERMISSIONS.projectsView];

export interface ReceivedLead {
  id: string;
  number: string;
  status: "NEW";
  duplicateOf: { id: string; number: string } | null;
}

/** API field names that differ from the import field keys. */
const API_FIELDS: Record<string, string> = { subSource: "sourceDetail" };

const text = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);
const list = (value: string | string[] | null | undefined) =>
  Array.isArray(value) ? value.join(", ") : (value ?? "");

export async function receiveLead(
  ctx: ServiceContext,
  apiKey: Pick<AuthenticatedApiKey, "id" | "name" | "defaultSourceId">,
  body: unknown,
): Promise<ReceivedLead> {
  const parsed = intakeLeadSchema.safeParse(body);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    throw new ValidationError(
      flat.formErrors[0] ?? "Some fields are missing or invalid.",
      flat.fieldErrors as Record<string, string[]>,
    );
  }
  const values = parsed.data;
  const raw: RawLeadValues = {
    name: values.name,
    mobile: text(values.mobile),
    alternateMobile: text(values.alternateMobile),
    email: text(values.email),
    city: text(values.city),
    locality: text(values.locality),
    address: text(values.address),
    source: text(values.source),
    campaign: text(values.campaign),
    subSource: text(values.sourceDetail),
    budgetMin: text(values.budgetMin),
    budgetMax: text(values.budgetMax),
    propertyType: text(values.propertyType),
    configurations: list(values.configurations),
    preferredLocations: list(values.preferredLocations),
    purpose: text(values.purpose),
    buyingTimeline: text(values.buyingTimeline),
    temperature: text(values.temperature),
    tags: list(values.tags),
    projects: list(values.projects),
    requirementNotes: text(values.requirementNotes),
    note: text(values.note),
  };

  const lookups = await loadLeadLookups(ctx);
  let defaultSourceId = apiKey.defaultSourceId;
  if (!defaultSourceId) {
    const apiSource = await ctx.db.leadSource.findFirst({
      where: { type: "API", isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    defaultSourceId = apiSource?.id ?? null;
  }
  const resolved = resolveLeadValues(raw, lookups, { defaultSourceId });
  if (!resolved.ok) {
    const fields: Record<string, string[]> = {};
    for (const problem of resolved.problems) {
      const field = API_FIELDS[problem.field] ?? (problem.field || "lead");
      (fields[field] ??= []).push(problem.message);
    }
    throw new ValidationError("Some fields are missing or invalid.", fields);
  }

  const created = await createLead(ctx, resolved.input, {
    channel: "API",
    origin: { apiKeyId: apiKey.id, apiKeyName: apiKey.name },
  });
  return {
    id: created.id,
    number: created.number,
    status: "NEW",
    duplicateOf: created.duplicateOf
      ? { id: created.duplicateOf.id, number: created.duplicateOf.number }
      : null,
  };
}
