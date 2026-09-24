import { createElement } from "react";

import type { OrganizationSetting, Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/platform/audit";
import { diffRecords } from "@/platform/audit/diff";
import { queueEmail } from "@/platform/email";
import { TestEmail } from "@/platform/email/templates/test-email";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import {
  completeUpload,
  getFileDownloadUrl,
  requestUpload,
  softDeleteFile,
} from "@/platform/storage/files";
import type { ServiceContext } from "@/platform/tenant/context";
import { clearTenantCache } from "@/platform/tenant/resolve";
import { parseInput } from "@/platform/validation";

import { ORGANIZATION_PERMISSIONS } from "../permissions";
import {
  LOGO_PURPOSE,
  type OrganizationProfileInput,
  organizationProfileSchema,
  type OrganizationProfileValues,
} from "../schemas";

/** Regional settings other modules need for formatting and date bucketing. */
export interface RegionalSettings {
  timezone: string;
  currency: string;
  locale: string;
  dateFormat: string;
  country: string;
  fiscalYearStartMonth: number;
  weekStartsOn: number;
}

export interface OrganizationProfile {
  organization: { id: string; name: string; slug: string };
  values: OrganizationProfileValues;
  logo: { fileId: string; url: string } | null;
}

function toSettingsUpdate(
  values: OrganizationProfileValues,
): Prisma.OrganizationSettingUncheckedUpdateInput {
  return {
    legalName: values.legalName ?? null,
    email: values.email ?? null,
    phone: values.phone ?? null,
    website: values.website ?? null,
    addressLine1: values.addressLine1 ?? null,
    addressLine2: values.addressLine2 ?? null,
    city: values.city ?? null,
    state: values.state ?? null,
    postalCode: values.postalCode ?? null,
    country: values.country,
    timezone: values.timezone,
    currency: values.currency,
    locale: values.locale,
    dateFormat: values.dateFormat,
    fiscalYearStartMonth: values.fiscalYearStartMonth,
    weekStartsOn: values.weekStartsOn,
  };
}

function toProfileValues(name: string, settings: OrganizationSetting): OrganizationProfileValues {
  return {
    name,
    legalName: settings.legalName,
    email: settings.email,
    phone: settings.phone,
    website: settings.website,
    addressLine1: settings.addressLine1,
    addressLine2: settings.addressLine2,
    city: settings.city,
    state: settings.state,
    postalCode: settings.postalCode,
    country: settings.country,
    timezone: settings.timezone,
    currency: settings.currency,
    locale: settings.locale,
    dateFormat: settings.dateFormat,
    fiscalYearStartMonth: settings.fiscalYearStartMonth,
    weekStartsOn: settings.weekStartsOn,
  };
}

async function loadSettings(ctx: ServiceContext): Promise<OrganizationSetting> {
  // The settings row is created with the organization; upsert keeps older tenants working.
  return ctx.db.organizationSetting.upsert({
    where: { organizationId: ctx.organizationId },
    create: { organizationId: ctx.organizationId },
    update: {},
  });
}

/** Regional settings for formatting (safe for any member of the organization). */
export async function getRegionalSettings(ctx: ServiceContext): Promise<RegionalSettings> {
  const settings = await loadSettings(ctx);
  return {
    timezone: settings.timezone,
    currency: settings.currency,
    locale: settings.locale,
    dateFormat: settings.dateFormat,
    country: settings.country,
    fiscalYearStartMonth: settings.fiscalYearStartMonth,
    weekStartsOn: settings.weekStartsOn,
  };
}

/** Name and logo for the app shell — visible to every member of the organization. */
export async function getOrganizationBranding(
  ctx: ServiceContext,
): Promise<{ name: string; logoUrl: string | null }> {
  const organization = await ctx.db.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { name: true, settings: { select: { logoFileId: true } } },
  });
  if (!organization) throw new NotFoundError("Organization", ctx.organizationId);
  let logoUrl: string | null = null;
  const logoFileId = organization.settings?.logoFileId;
  if (logoFileId) {
    logoUrl = await getFileDownloadUrl(ctx, logoFileId, {
      disposition: "inline",
      expiresInSeconds: 3600,
    }).catch(() => null);
  }
  return { name: organization.name, logoUrl };
}

export async function getOrganizationProfile(ctx: ServiceContext): Promise<OrganizationProfile> {
  ctx.permissions.assert(ORGANIZATION_PERMISSIONS.view);
  const organization = await ctx.db.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) throw new NotFoundError("Organization", ctx.organizationId);
  const settings = await loadSettings(ctx);

  let logo: OrganizationProfile["logo"] = null;
  if (settings.logoFileId) {
    try {
      const url = await getFileDownloadUrl(ctx, settings.logoFileId, {
        disposition: "inline",
        expiresInSeconds: 3600,
      });
      logo = { fileId: settings.logoFileId, url };
    } catch {
      logo = null; // missing/deleted logo file: render without it
    }
  }

  return { organization, values: toProfileValues(organization.name, settings), logo };
}

/** Updates the organization profile and regional settings (audited, emits `organization.settings_updated`). */
export async function updateOrganizationProfile(
  ctx: ServiceContext,
  input: OrganizationProfileInput,
): Promise<OrganizationProfileValues> {
  ctx.permissions.assert(ORGANIZATION_PERMISSIONS.manage);
  const values = parseInput(organizationProfileSchema, input);

  const result = await ctx.db.$transaction(async (tx) => {
    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
    });
    const before = await tx.organizationSetting.upsert({
      where: { organizationId: ctx.organizationId },
      create: { organizationId: ctx.organizationId },
      update: {},
    });

    if (organization.name !== values.name) {
      await tx.organization.update({
        where: { id: ctx.organizationId },
        data: { name: values.name },
      });
    }
    const after = await tx.organizationSetting.update({
      where: { organizationId: ctx.organizationId },
      data: toSettingsUpdate(values),
    });

    const previous = toProfileValues(organization.name, before);
    const next = toProfileValues(values.name, after);
    const changes = diffRecords(previous, next);
    const changedFields = Object.keys(changes);

    if (changedFields.length > 0) {
      await recordAudit(tx, ctx, {
        action: "organization.profile.update",
        entityType: "Organization",
        entityId: ctx.organizationId,
        summary: `Updated organization profile (${changedFields.join(", ")})`,
        changes,
      });
      await publishEvent(tx, ctx, "organization.settings_updated", { changedFields });
    }
    return next;
  });

  clearTenantCache();
  return result;
}

/** Step 1 of a logo upload: returns a presigned URL for the browser. */
export async function requestLogoUpload(
  ctx: ServiceContext,
  input: { fileName: string; contentType: string; size: number },
) {
  ctx.permissions.assert(ORGANIZATION_PERMISSIONS.manage);
  return requestUpload(ctx, { purpose: LOGO_PURPOSE, ...input });
}

/** Step 2: verifies the uploaded logo and makes it the organization logo (the previous one is retired). */
export async function completeLogoUpload(ctx: ServiceContext, fileId: string) {
  ctx.permissions.assert(ORGANIZATION_PERMISSIONS.manage);
  const file = await completeUpload(ctx, fileId);
  if (file.purpose !== LOGO_PURPOSE) {
    throw new ValidationError("This file is not an organization logo upload.");
  }

  const previousLogoId = await ctx.db.$transaction(async (tx) => {
    const current = await tx.organizationSetting.upsert({
      where: { organizationId: ctx.organizationId },
      create: { organizationId: ctx.organizationId },
      update: {},
    });
    await tx.organizationSetting.update({
      where: { organizationId: ctx.organizationId },
      data: { logoFileId: file.id },
    });
    await recordAudit(tx, ctx, {
      action: "organization.logo.update",
      entityType: "Organization",
      entityId: ctx.organizationId,
      summary: `Uploaded a new logo (${file.fileName})`,
      changes: { logoFileId: { from: current.logoFileId, to: file.id } },
    });
    return current.logoFileId && current.logoFileId !== file.id ? current.logoFileId : null;
  });
  if (previousLogoId) await softDeleteFile(ctx, previousLogoId);
  return { fileId: file.id };
}

export async function removeLogo(ctx: ServiceContext): Promise<void> {
  ctx.permissions.assert(ORGANIZATION_PERMISSIONS.manage);
  const settings = await loadSettings(ctx);
  if (!settings.logoFileId) return;
  await ctx.db.$transaction(async (tx) => {
    await tx.organizationSetting.update({
      where: { organizationId: ctx.organizationId },
      data: { logoFileId: null },
    });
    await recordAudit(tx, ctx, {
      action: "organization.logo.remove",
      entityType: "Organization",
      entityId: ctx.organizationId,
      summary: "Removed the organization logo",
      metadata: { fileId: settings.logoFileId },
    });
  });
  await softDeleteFile(ctx, settings.logoFileId);
}

/** Queues a test e-mail (delivered by the worker) to verify e-mail configuration. */
export async function sendTestEmail(ctx: ServiceContext, to: string): Promise<void> {
  ctx.permissions.assert(ORGANIZATION_PERMISSIONS.manage);
  const organization = await ctx.db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { name: true },
  });
  await queueEmail({
    to,
    subject: `Test e-mail from ${organization.name}`,
    react: createElement(TestEmail, {
      organizationName: organization.name,
      sentAt: new Date().toISOString(),
    }),
  });
}
