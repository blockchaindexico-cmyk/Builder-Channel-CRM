/**
 * Lead import columns (M04-18), shared by the mapping screen and the import job. Headers are matched to fields by
 * their aliases (case, spaces and punctuation ignored), so files exported from this CRM or from common portals map
 * themselves.
 */
export const IMPORT_FIELDS = [
  {
    key: "name",
    label: "Name",
    required: true,
    aliases: [
      "name",
      "full name",
      "customer name",
      "customer",
      "lead name",
      "client name",
      "client",
    ],
  },
  {
    key: "mobile",
    label: "Mobile",
    aliases: [
      "mobile",
      "mobile number",
      "mobile no",
      "phone",
      "phone number",
      "phone no",
      "contact number",
      "contact no",
      "contact",
      "cell",
    ],
  },
  {
    key: "alternateMobile",
    label: "Alternate mobile",
    aliases: [
      "alternate mobile",
      "alternate number",
      "alt mobile",
      "alternate phone",
      "other phone",
      "secondary phone",
      "mobile 2",
      "phone 2",
    ],
  },
  {
    key: "email",
    label: "E-mail",
    aliases: ["e mail", "email", "email address", "email id", "mail"],
  },
  { key: "city", label: "City", aliases: ["city", "town"] },
  {
    key: "locality",
    label: "Locality",
    aliases: ["locality", "area", "location", "neighbourhood", "neighborhood"],
  },
  { key: "address", label: "Address", aliases: ["address", "full address"] },
  {
    key: "source",
    label: "Source",
    hint: "Name or code of a lead source",
    aliases: ["source", "lead source"],
  },
  {
    key: "campaign",
    label: "Campaign",
    hint: "Name or code of a campaign",
    aliases: ["campaign", "campaign name"],
  },
  {
    key: "subSource",
    label: "Source detail",
    aliases: ["source detail", "sub source", "subsource", "listing id", "referrer", "referred by"],
  },
  {
    key: "budgetMin",
    label: "Budget from",
    hint: "8500000, 85 L or 1.2 Cr",
    aliases: ["budget from", "budget min", "min budget", "minimum budget"],
  },
  {
    key: "budgetMax",
    label: "Budget up to",
    hint: "8500000, 85 L or 1.2 Cr",
    aliases: ["budget up to", "budget to", "budget max", "max budget", "maximum budget", "budget"],
  },
  {
    key: "propertyType",
    label: "Property type",
    aliases: ["property type", "type of property", "property"],
  },
  {
    key: "configurations",
    label: "Configurations",
    hint: "e.g. 2 BHK, 3 BHK",
    aliases: ["configurations", "configuration", "bhk", "unit type", "unit types"],
  },
  {
    key: "preferredLocations",
    label: "Preferred locations",
    hint: "Separated with commas",
    aliases: ["preferred locations", "preferred location", "locations"],
  },
  { key: "purpose", label: "Purpose", hint: "End use or Investment", aliases: ["purpose"] },
  {
    key: "buyingTimeline",
    label: "Buying timeline",
    aliases: ["buying timeline", "timeline", "purchase timeline"],
  },
  {
    key: "temperature",
    label: "Temperature",
    hint: "Hot, Warm or Cold",
    aliases: ["temperature", "lead temperature"],
  },
  { key: "tags", label: "Tags", hint: "Separated with commas", aliases: ["tags", "tag", "labels"] },
  {
    key: "projects",
    label: "Projects of interest",
    hint: "Project codes or names, separated with commas",
    aliases: [
      "projects of interest",
      "projects",
      "project",
      "interested project",
      "project interested",
    ],
  },
  {
    key: "requirementNotes",
    label: "Requirement notes",
    aliases: ["requirement notes", "requirement", "requirements"],
  },
  {
    key: "note",
    label: "Note",
    hint: "Added as the lead's first note",
    aliases: ["note", "notes", "remarks", "remark", "comments", "comment"],
  },
  {
    key: "owner",
    label: "Owner",
    hint: "E-mail or employee code of an active user",
    aliases: ["owner e mail", "owner email", "owner", "assigned to", "executive"],
  },
] as const satisfies readonly {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
  aliases: readonly string[];
}[];

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export const IMPORT_FIELD_KEYS = IMPORT_FIELDS.map((field) => field.key) as ImportFieldKey[];

/** Field → zero-based column index in the file (null = not imported). */
export type ImportMapping = Partial<Record<ImportFieldKey, number | null>>;

export interface ImportOptions {
  /** Source for rows without one. */
  defaultSourceId: string | null;
  /** Skip rows whose mobile or e-mail belongs to an existing lead (otherwise the duplicate policy applies). */
  skipDuplicates: boolean;
}

export const MAX_IMPORT_ROWS = 10_000;

/** "E-mail address" → "e mail address": lower case, punctuation as spaces. */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Suggests a column for every field whose alias matches a header (each column used once). */
export function suggestImportMapping(headers: readonly string[]): ImportMapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: ImportMapping = {};
  for (const field of IMPORT_FIELDS) {
    for (const alias of field.aliases) {
      const index = normalized.findIndex(
        (header, position) => header === alias && !used.has(position),
      );
      if (index >= 0) {
        mapping[field.key] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}
