import { z } from "zod";

import { assertRange, optionalAmount, optionalEmail, optionalText } from "@/lib/fields";

import { DEFAULT_LEAD_STATUSES } from "./constants";
import { IMPORT_FIELD_KEYS, type ImportMapping } from "./import-fields";

const optionalEnum = <T extends [string, ...string[]]>(values: T) =>
  z
    .union([z.literal(""), z.enum(values)])
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const optionalUuid = z
  .union([z.literal(""), z.uuid()])
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const shortList = (max: number, itemMax: number) =>
  z
    .array(z.string().trim().min(1).max(itemMax))
    .max(max)
    .default([])
    .transform((items) => [...new Set(items)]);

export const TEMPERATURE_VALUES = ["HOT", "WARM", "COLD"] as const;
export const PURPOSE_VALUES = ["END_USE", "INVESTMENT"] as const;
export const TIMELINE_VALUES = [
  "IMMEDIATE",
  "WITHIN_3_MONTHS",
  "WITHIN_6_MONTHS",
  "WITHIN_1_YEAR",
  "LATER",
] as const;
export const INTEREST_VALUES = ["HIGH", "MEDIUM", "LOW"] as const;

export const leadInterestSchema = z.object({
  projectId: z.uuid("Choose a project"),
  level: z.enum(INTEREST_VALUES).default("MEDIUM"),
});

const leadFields = {
  // Contact (PRD §5)
  name: z.string().trim().min(2, "Enter the customer's name").max(120),
  mobile: optionalText(30),
  alternateMobile: optionalText(30),
  email: optionalEmail,
  city: optionalText(80),
  locality: optionalText(80),
  address: optionalText(300),
  // Source
  sourceId: optionalUuid,
  campaignId: optionalUuid,
  subSource: optionalText(120),
  // Requirement
  budgetMin: optionalAmount,
  budgetMax: optionalAmount,
  propertyTypeId: optionalUuid,
  configurationTypeIds: z.array(z.uuid()).max(12).default([]),
  preferredLocations: shortList(10, 80),
  purpose: optionalEnum([...PURPOSE_VALUES]),
  buyingTimeline: optionalEnum([...TIMELINE_VALUES]),
  requirementNotes: optionalText(2000),
  temperature: optionalEnum([...TEMPERATURE_VALUES]),
  tags: shortList(20, 30),
  interests: z.array(leadInterestSchema).max(20).default([]),
};

function refineLead(
  value: {
    mobile?: string | null;
    email?: string | null;
    budgetMin?: string | null;
    budgetMax?: string | null;
    interests?: { projectId: string }[];
  },
  ctx: z.RefinementCtx,
) {
  if (!value.mobile && !value.email) {
    ctx.addIssue({
      code: "custom",
      path: ["mobile"],
      message: "Enter a mobile number or an e-mail address",
    });
  }
  assertRange(ctx, value.budgetMin, value.budgetMax, ["budgetMax"], "budget");
  const projects = value.interests?.map((interest) => interest.projectId) ?? [];
  if (new Set(projects).size !== projects.length) {
    ctx.addIssue({ code: "custom", path: ["interests"], message: "A project is listed twice" });
  }
}

/** Create lead (M04-05): contact, requirement, source, project interests and an optional first note. */
export const createLeadSchema = z
  .object({
    ...leadFields,
    note: optionalText(5000),
    /** "Assign to" (M05) — applied by the assignment module, which checks who may assign to whom. */
    assigneeId: optionalUuid,
  })
  .superRefine(refineLead);
export type CreateLeadInput = z.input<typeof createLeadSchema>;
export type CreateLeadValues = z.output<typeof createLeadSchema>;

/** Edit lead (M04-06). */
export const updateLeadSchema = z.object(leadFields).superRefine(refineLead);
export type UpdateLeadInput = z.input<typeof updateLeadSchema>;
export type UpdateLeadValues = z.output<typeof updateLeadSchema>;

export const changeStatusSchema = z.object({
  statusId: z.uuid("Choose a status"),
  reason: optionalText(500),
});
export type ChangeStatusInput = z.input<typeof changeStatusSchema>;

export const noteSchema = z.object({ body: z.string().trim().min(1, "Write something").max(5000) });

export const duplicateCheckSchema = z.object({
  mobile: optionalText(30),
  alternateMobile: optionalText(30),
  email: z.string().trim().max(200).optional().nullable(),
  excludeLeadId: optionalUuid,
});

// --- Masters (M04-03) ---------------------------------------------------------------------------------------

const code = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Use at least 2 characters")
  .max(40)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "Use letters, digits, dots, dashes or underscores");

export const leadSourceSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(60),
  code,
  type: z.enum([
    "WEBSITE",
    "PORTAL",
    "WALK_IN",
    "REFERRAL",
    "SOCIAL",
    "CAMPAIGN",
    "IMPORT",
    "API",
    "OTHER",
  ]),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
export type LeadSourceInput = z.input<typeof leadSourceSchema>;

export const campaignSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a name").max(80),
    code,
    sourceId: optionalUuid,
    startDate: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional()
      .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Choose a date"),
    endDate: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional()
      .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Choose a date"),
    cost: optionalAmount,
    notes: optionalText(500),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end date is before the start date",
      });
    }
  });
export type CampaignInput = z.input<typeof campaignSchema>;

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour");

export const leadStatusSchema = z.object({
  label: z.string().trim().min(2, "Enter a label").max(40),
  color: hexColor,
  category: z.enum(["OPEN", "ACTIVE", "BOOKING", "WON", "LOST", "INVALID"]),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isTerminal: z.boolean().default(false),
  requiresReason: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type LeadStatusInput = z.input<typeof leadStatusSchema>;

export const leadSettingsSchema = z.object({
  duplicatePolicy: z.enum(["FLAG", "BLOCK", "ALLOW"]).default("FLAG"),
});
export type LeadSettings = z.output<typeof leadSettingsSchema>;

export const savedViewSchema = z.object({
  name: z.string().trim().min(1, "Name the view").max(60),
  query: z.string().max(2000),
  isShared: z.boolean().default(false),
});

// --- Files ---------------------------------------------------------------------------------------------------

export const LEAD_ATTACHMENT_PURPOSE = "lead.attachment";
export const LEAD_IMPORT_PURPOSE = "lead.import";
/** Error reports written by the import job (server-generated, never uploaded). */
export const LEAD_IMPORT_REPORT_PURPOSE = "lead.import-report";
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
] as const;
export const IMPORT_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const requestAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  size: z
    .number()
    .int()
    .positive()
    .max(ATTACHMENT_MAX_BYTES, "Attachments must be 20 MB or smaller"),
});

// --- Import (M04-18) & export (M04-19) ----------------------------------------------------------------------

export const requestImportUploadSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/\.(csv|xlsx)$/i, "Choose a .csv or .xlsx file"),
  contentType: z.string().trim().min(1).max(120),
  size: z.number().int().positive().max(IMPORT_MAX_BYTES, "Import files must be 10 MB or smaller"),
});

const columnIndex = z.number().int().min(0).max(499).nullable().optional();
export const importMappingSchema = z
  .object(Object.fromEntries(IMPORT_FIELD_KEYS.map((field) => [field, columnIndex])))
  .transform((mapping) => mapping as ImportMapping)
  .superRefine((mapping, ctx) => {
    if (mapping.name === null || mapping.name === undefined) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "Choose the column with names" });
    }
    const hasMobile = mapping.mobile !== null && mapping.mobile !== undefined;
    const hasEmail = mapping.email !== null && mapping.email !== undefined;
    if (!hasMobile && !hasEmail) {
      ctx.addIssue({
        code: "custom",
        path: ["mobile"],
        message: "Choose the column with mobile numbers or e-mail addresses",
      });
    }
    const used = Object.values(mapping).filter((column) => column !== null && column !== undefined);
    if (new Set(used).size !== used.length) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "Each column can be used for one field only",
      });
    }
  });

export const importOptionsSchema = z.object({
  defaultSourceId: z
    .union([z.literal(""), z.uuid()])
    .nullable()
    .optional()
    .transform((value) => value || null),
  skipDuplicates: z.boolean().default(false),
});

export const importRequestSchema = z.object({
  fileId: z.uuid(),
  mapping: importMappingSchema,
  options: importOptionsSchema,
});
export type ImportRequestInput = z.input<typeof importRequestSchema>;

export const EXPORT_FORMATS = ["csv", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const MAX_EXPORT_ROWS = 50_000;
export const MAX_EXPORT_IDS = 500;

export const exportRequestSchema = z.object({
  format: z.enum(EXPORT_FORMATS).default("xlsx"),
  /** The lead list's query string (view, search and filters) — used when no ids are given. */
  query: z.string().max(4000).optional(),
  ids: z.array(z.uuid()).max(MAX_EXPORT_IDS).optional(),
});
export type ExportRequestInput = z.input<typeof exportRequestSchema>;

// --- API keys & intake API (M04-20) ------------------------------------------------------------------------

export const apiKeySchema = z.object({
  name: z.string().trim().min(2, "Name the key, e.g. the website or portal using it").max(60),
  defaultSourceId: optionalUuid,
});
export type ApiKeyInput = z.input<typeof apiKeySchema>;

const apiText = (max: number) => z.string().trim().max(max).optional().nullable();
const apiList = (max: number, itemMax: number) =>
  z
    .union([z.array(z.string().trim().max(itemMax)).max(max), z.string().max(max * itemMax)])
    .optional()
    .nullable();
const apiAmount = z
  .union([z.number().nonnegative().finite(), z.string().max(40)])
  .optional()
  .nullable();

/**
 * Body of `POST /api/v1/leads`. Masters are referenced by code or name ("99acres", "2 BHK", "PRJ-0001"); lists may
 * be arrays or comma-separated strings.
 */
export const intakeLeadSchema = z
  .object({
    name: z.string().trim().min(2, "Send the customer's name").max(120),
    mobile: apiText(30),
    alternateMobile: apiText(30),
    email: apiText(200),
    city: apiText(80),
    locality: apiText(80),
    address: apiText(300),
    source: apiText(60),
    campaign: apiText(60),
    sourceDetail: apiText(120),
    budgetMin: apiAmount,
    budgetMax: apiAmount,
    propertyType: apiText(60),
    configurations: apiList(12, 40),
    preferredLocations: apiList(10, 80),
    purpose: apiText(40),
    buyingTimeline: apiText(40),
    temperature: apiText(20),
    tags: apiList(20, 30),
    projects: apiList(20, 120),
    requirementNotes: apiText(2000),
    note: apiText(5000),
  })
  .strict();
export type IntakeLeadInput = z.input<typeof intakeLeadSchema>;

/** All default status keys (for settings screens and tests). */
export const DEFAULT_STATUS_KEYS = DEFAULT_LEAD_STATUSES.map((status) => status.key);
