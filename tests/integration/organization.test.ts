import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as organization from "@/modules/organization/server/service";
import { prisma } from "@/platform/db/client";
import { EMAIL_SEND_JOB } from "@/platform/email";
import { ForbiddenError, ValidationError } from "@/platform/errors";
import { getBoss, stopBoss } from "@/platform/jobs/boss";
import { getStorage } from "@/platform/storage";

import { createTestContext, createTestOrganization } from "../support/factories";

const validProfile = {
  name: "Skyline Realty Partners",
  legalName: "Skyline Realty Partners LLP",
  email: "hello@skyline.test",
  phone: "+91 98200 00000",
  website: "https://skyline.test",
  addressLine1: "5th Floor, Trade Centre",
  addressLine2: "",
  city: "Pune",
  state: "Maharashtra",
  postalCode: "411001",
  country: "in",
  timezone: "Asia/Kolkata",
  currency: "inr",
  locale: "en-IN",
  dateFormat: "dd MMM yyyy",
  fiscalYearStartMonth: 4,
  weekStartsOn: 1,
};

async function simulateBrowserUpload(fileId: string, bytes: number, contentType = "image/png") {
  const file = await prisma.fileObject.findUniqueOrThrow({ where: { id: fileId } });
  await getStorage().putObject(file.key, new Uint8Array(bytes), contentType);
  return file;
}

describe("organization settings (M01-08, M01-24)", () => {
  let org: { id: string; name: string };

  beforeAll(async () => {
    org = await createTestOrganization({ name: "Skyline" });
  });

  afterAll(async () => {
    await stopBoss({ graceful: false });
    await prisma.$disconnect();
  });

  it("returns defaults for a new organization", async () => {
    const ctx = createTestContext(org.id);
    const profile = await organization.getOrganizationProfile(ctx);
    expect(profile.organization.name).toBe("Skyline");
    expect(profile.values).toMatchObject({
      country: "IN",
      timezone: "Asia/Kolkata",
      currency: "INR",
      locale: "en-IN",
      fiscalYearStartMonth: 4,
    });
    expect(profile.logo).toBeNull();
  });

  it("updates the profile with an audit entry and a domain event", async () => {
    const ctx = createTestContext(org.id, { actor: { name: "Asha Admin" } });
    const values = await organization.updateOrganizationProfile(ctx, validProfile);
    expect(values).toMatchObject({
      name: "Skyline Realty Partners",
      country: "IN",
      currency: "INR",
      addressLine2: null,
    });

    const saved = await prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      include: { settings: true },
    });
    expect(saved.name).toBe("Skyline Realty Partners");
    expect(saved.settings?.city).toBe("Pune");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: org.id, action: "organization.profile.update" },
    });
    expect(audit.actorName).toBe("Asha Admin");
    expect(audit.changes).toMatchObject({
      name: { from: "Skyline", to: "Skyline Realty Partners" },
      city: { from: null, to: "Pune" },
    });

    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { organizationId: org.id, type: "organization.settings_updated" },
    });
    expect((event.payload as { changedFields: string[] }).changedFields).toEqual(
      expect.arrayContaining(["name", "city", "legalName"]),
    );
  });

  it("does not audit or emit events when nothing changed", async () => {
    const ctx = createTestContext(org.id);
    const before = await prisma.auditLog.count({ where: { organizationId: org.id } });
    await organization.updateOrganizationProfile(ctx, validProfile);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id } })).toBe(before);
  });

  it("rejects invalid input with field errors", async () => {
    const ctx = createTestContext(org.id);
    const error = await organization
      .updateOrganizationProfile(ctx, {
        ...validProfile,
        timezone: "Mars/Olympus",
        website: "not a url",
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toMatchObject({
      timezone: ["Unknown timezone"],
      website: [expect.stringContaining("valid URL")],
    });
  });

  it("enforces permissions in the service layer", async () => {
    const viewer = createTestContext(org.id, { permissions: ["settings.organization.view"] });
    await expect(organization.getOrganizationProfile(viewer)).resolves.toBeDefined();
    await expect(
      organization.updateOrganizationProfile(viewer, validProfile),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const outsider = createTestContext(org.id, { permissions: [] });
    await expect(organization.getOrganizationProfile(outsider)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("uploads, replaces and removes the organization logo", async () => {
    const ctx = createTestContext(org.id);
    const first = await organization.requestLogoUpload(ctx, {
      fileName: "logo.png",
      contentType: "image/png",
      size: 1200,
    });
    expect(first.upload.method).toBe("PUT");
    const firstFile = await simulateBrowserUpload(first.fileId, 1200);
    expect(firstFile.key).toMatch(
      new RegExp(`^orgs/${org.id}/organization/logo/\\d{4}/\\d{2}/[0-9a-f-]+/logo\\.png$`),
    );

    await organization.completeLogoUpload(ctx, first.fileId);
    let profile = await organization.getOrganizationProfile(ctx);
    expect(profile.logo?.fileId).toBe(first.fileId);
    expect(profile.logo?.url).toContain("memory://download/");

    const second = await organization.requestLogoUpload(ctx, {
      fileName: "logo-v2.webp",
      contentType: "image/webp",
      size: 800,
    });
    await simulateBrowserUpload(second.fileId, 800, "image/webp");
    await organization.completeLogoUpload(ctx, second.fileId);
    profile = await organization.getOrganizationProfile(ctx);
    expect(profile.logo?.fileId).toBe(second.fileId);
    const retired = await prisma.fileObject.findUniqueOrThrow({ where: { id: first.fileId } });
    expect(retired.status).toBe("DELETED");

    await organization.removeLogo(ctx);
    profile = await organization.getOrganizationProfile(ctx);
    expect(profile.logo).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { organizationId: org.id, action: { startsWith: "organization.logo" } },
      }),
    ).toBe(3);
  });

  it("rejects wrong file types, oversized files and uploads that never arrived", async () => {
    const ctx = createTestContext(org.id);
    await expect(
      organization.requestLogoUpload(ctx, {
        fileName: "x.gif",
        contentType: "image/gif",
        size: 10,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      organization.requestLogoUpload(ctx, {
        fileName: "x.png",
        contentType: "image/png",
        size: 5 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const missing = await organization.requestLogoUpload(ctx, {
      fileName: "x.png",
      contentType: "image/png",
      size: 10,
    });
    await expect(organization.completeLogoUpload(ctx, missing.fileId)).rejects.toBeInstanceOf(
      ValidationError,
    );

    const lying = await organization.requestLogoUpload(ctx, {
      fileName: "y.png",
      contentType: "image/png",
      size: 10,
    });
    await simulateBrowserUpload(lying.fileId, 3 * 1024 * 1024);
    await expect(organization.completeLogoUpload(ctx, lying.fileId)).rejects.toThrow(
      "exceeds the allowed size",
    );
    const rejected = await prisma.fileObject.findUniqueOrThrow({ where: { id: lying.fileId } });
    expect(rejected.status).toBe("DELETED");
  });

  it("cannot complete another organization's upload", async () => {
    const other = await createTestOrganization();
    const ctxOther = createTestContext(other.id);
    const upload = await organization.requestLogoUpload(ctxOther, {
      fileName: "o.png",
      contentType: "image/png",
      size: 10,
    });
    await simulateBrowserUpload(upload.fileId, 10);
    const ctx = createTestContext(org.id);
    await expect(organization.completeLogoUpload(ctx, upload.fileId)).rejects.toThrow("not found");
  });

  it("queues a test e-mail for the worker", async () => {
    const ctx = createTestContext(org.id);
    await organization.sendTestEmail(ctx, "owner@skyline.test");
    const boss = await getBoss();
    const jobs = await boss.findJobs<{ to: string; subject: string }>(EMAIL_SEND_JOB);
    const job = jobs.find((j) => j.data.to === "owner@skyline.test");
    expect(job?.data.subject).toBe("Test e-mail from Skyline Realty Partners");
  });
});
