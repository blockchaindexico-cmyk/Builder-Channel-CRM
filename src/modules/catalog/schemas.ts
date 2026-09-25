import { z } from "zod";

import {
  assertRange,
  optionalAmount,
  optionalArea,
  optionalCode,
  optionalDate,
  optionalEmail,
  optionalInt,
  optionalText,
  optionalUrl,
} from "@/lib/fields";

// --- Labels -------------------------------------------------------------------------------------------------

export const PROJECT_STATUSES = [
  { value: "UPCOMING", label: "Upcoming", tone: "muted" },
  { value: "PRE_LAUNCH", label: "Pre-launch", tone: "info" },
  { value: "UNDER_CONSTRUCTION", label: "Under construction", tone: "warning" },
  { value: "READY_TO_MOVE", label: "Ready to move", tone: "success" },
  { value: "COMPLETED", label: "Completed", tone: "secondary" },
] as const;
export type ProjectStatusValue = (typeof PROJECT_STATUSES)[number]["value"];
export const PROJECT_STATUS_VALUES = PROJECT_STATUSES.map((status) => status.value) as [
  ProjectStatusValue,
  ...ProjectStatusValue[],
];

export const PROPERTY_CATEGORIES = [
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "LAND", label: "Land" },
] as const;
export type PropertyCategoryValue = (typeof PROPERTY_CATEGORIES)[number]["value"];

export const DOCUMENT_CATEGORIES = [
  { value: "BROCHURE", label: "Brochure" },
  { value: "FLOOR_PLAN", label: "Floor plan" },
  { value: "PRICE_SHEET", label: "Price sheet" },
  { value: "IMAGE", label: "Image" },
  { value: "LEGAL", label: "Legal / RERA" },
  { value: "AGREEMENT", label: "Agreement" },
  { value: "OTHER", label: "Other" },
] as const;
export type DocumentCategoryValue = (typeof DOCUMENT_CATEGORIES)[number]["value"];
export const DOCUMENT_CATEGORY_VALUES = DOCUMENT_CATEGORIES.map((category) => category.value) as [
  DocumentCategoryValue,
  ...DocumentCategoryValue[],
];

// --- Files --------------------------------------------------------------------------------------------------

export const PROJECT_DOCUMENT_PURPOSE = "project.document";
export const BUILDER_DOCUMENT_PURPOSE = "builder.document";
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const DOCUMENT_TYPES = [
  "application/pdf",
  ...IMAGE_TYPES,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

// --- Masters (M03-10) ---------------------------------------------------------------------------------------

const masterBase = {
  name: z.string().trim().min(1, "Enter a name").max(60),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
};

export const propertyTypeSchema = z.object({
  ...masterBase,
  category: z.enum(["RESIDENTIAL", "COMMERCIAL", "LAND"]).default("RESIDENTIAL"),
});
export type PropertyTypeInput = z.input<typeof propertyTypeSchema>;

export const configurationTypeSchema = z.object({
  ...masterBase,
  bedrooms: z
    .union([z.literal(""), z.coerce.number().min(0).max(20).multipleOf(0.5, "Use steps of 0.5")])
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
});
export type ConfigurationTypeInput = z.input<typeof configurationTypeSchema>;

export const amenitySchema = z.object(masterBase);
export type AmenityInput = z.input<typeof amenitySchema>;

export const MASTER_KINDS = ["propertyType", "configurationType", "amenity"] as const;
export type MasterKind = (typeof MASTER_KINDS)[number];

// --- Builders (M03-02) --------------------------------------------------------------------------------------

export const builderSchema = z.object({
  name: z.string().trim().min(2, "Enter the builder's name").max(120),
  code: optionalCode,
  legalName: optionalText(160),
  website: optionalUrl,
  email: optionalEmail,
  phone: optionalText(30),
  taxId: optionalText(30),
  addressLine: optionalText(200),
  city: optionalText(80),
  state: optionalText(80),
  postalCode: optionalText(12),
  description: optionalText(2000),
});
export type BuilderInput = z.input<typeof builderSchema>;
export type BuilderValues = z.output<typeof builderSchema>;

export const builderContactSchema = z.object({
  name: z.string().trim().min(2, "Enter the contact's name").max(120),
  designation: optionalText(80),
  phone: optionalText(30),
  email: optionalEmail,
  isPrimary: z.boolean().default(false),
  notes: optionalText(500),
});
export type BuilderContactInput = z.input<typeof builderContactSchema>;

// --- Projects (M03-05, M03-07) ------------------------------------------------------------------------------

export const projectConfigurationSchema = z
  .object({
    configurationTypeId: z.uuid("Choose a configuration"),
    carpetAreaMin: optionalArea,
    carpetAreaMax: optionalArea,
    priceMin: optionalAmount,
    priceMax: optionalAmount,
    notes: optionalText(200),
  })
  .superRefine((value, ctx) => {
    assertRange(ctx, value.carpetAreaMin, value.carpetAreaMax, ["carpetAreaMax"], "area");
    assertRange(ctx, value.priceMin, value.priceMax, ["priceMax"], "price");
  });
export type ProjectConfigurationInput = z.input<typeof projectConfigurationSchema>;

export const projectSchema = z
  .object({
    builderId: z.uuid("Choose the builder"),
    name: z.string().trim().min(2, "Enter the project name").max(120),
    code: optionalCode,
    status: z.enum(PROJECT_STATUS_VALUES).default("UPCOMING"),
    reraNumber: optionalText(60),
    addressLine: optionalText(200),
    locality: optionalText(80),
    city: optionalText(80),
    state: optionalText(80),
    postalCode: optionalText(12),
    mapUrl: optionalUrl,
    launchDate: optionalDate,
    possessionDate: optionalDate,
    possessionNote: optionalText(120),
    totalTowers: optionalInt(500),
    totalUnits: optionalInt(100_000),
    projectArea: optionalText(60),
    description: optionalText(5000),
    highlights: z
      .array(z.string().trim().min(1).max(160))
      .max(12, "Up to 12 highlights")
      .default([]),
    propertyTypeIds: z.array(z.uuid()).max(20).default([]),
    amenityIds: z.array(z.uuid()).max(100).default([]),
    configurations: z
      .array(projectConfigurationSchema)
      .max(30, "Up to 30 configurations")
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (value.launchDate && value.possessionDate && value.possessionDate < value.launchDate) {
      ctx.addIssue({
        code: "custom",
        path: ["possessionDate"],
        message: "Possession cannot be before the launch date",
      });
    }
    const seen = new Set<string>();
    value.configurations.forEach((configuration, index) => {
      const key = `${configuration.configurationTypeId}|${configuration.notes ?? ""}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["configurations", index, "configurationTypeId"],
          message: "This configuration is listed twice — add a note to tell them apart",
        });
      }
      seen.add(key);
    });
  });
export type ProjectInput = z.input<typeof projectSchema>;
export type ProjectValues = z.output<typeof projectSchema>;

export const projectStatusSchema = z.object({ status: z.enum(PROJECT_STATUS_VALUES) });

// --- Documents (M03-08) -------------------------------------------------------------------------------------

export const requestDocumentUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  size: z.number().int().positive().max(DOCUMENT_MAX_BYTES, "Files must be 25 MB or smaller"),
});

export const attachDocumentSchema = z.object({
  fileId: z.uuid(),
  category: z.enum(DOCUMENT_CATEGORY_VALUES),
  title: z.string().trim().min(1, "Enter a title").max(160),
  isInternal: z.boolean().default(false),
});
export type AttachDocumentInput = z.input<typeof attachDocumentSchema>;
