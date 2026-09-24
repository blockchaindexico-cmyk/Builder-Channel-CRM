import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/platform/db/client";
import { createTenantDb, TENANT_MODELS } from "@/platform/db/tenant-scope";
import { TenantViolationError } from "@/platform/errors";

import { createTestOrganization } from "../support/factories";

/** Rule T10: prove that a tenant client can never read or write another tenant's data. */
describe("tenant-scoped database client", () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let auditB: { id: string };

  beforeAll(async () => {
    orgA = await createTestOrganization();
    orgB = await createTestOrganization();
    await prisma.auditLog.createMany({
      data: [
        { organizationId: orgA.id, action: "test.a1", entityType: "Test" },
        { organizationId: orgA.id, action: "test.a2", entityType: "Test" },
        { organizationId: orgB.id, action: "test.b1", entityType: "Test" },
      ],
    });
    auditB = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: orgB.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("detects tenant-owned models from the schema", () => {
    expect(TENANT_MODELS.has("AuditLog")).toBe(true);
    expect(TENANT_MODELS.has("FileObject")).toBe(true);
    expect(TENANT_MODELS.has("OrganizationSetting")).toBe(true);
    expect(TENANT_MODELS.has("WorkerHeartbeat")).toBe(false);
    expect(TENANT_MODELS.has("Organization")).toBe(false);
  });

  it("scopes reads to the current tenant", async () => {
    const db = createTenantDb(orgA.id);
    const rows = await db.auditLog.findMany({ where: { entityType: "Test" } });
    expect(rows.map((row) => row.action).sort()).toEqual(["test.a1", "test.a2"]);
    expect(await db.auditLog.count()).toBe(2);
    expect(await db.auditLog.findUnique({ where: { id: auditB.id } })).toBeNull();
    expect(await db.auditLog.findFirst({ where: { id: auditB.id } })).toBeNull();

    const grouped = await db.auditLog.groupBy({ by: ["organizationId"], _count: true });
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.organizationId).toBe(orgA.id);
  });

  it("rejects queries that name another tenant", async () => {
    const db = createTenantDb(orgA.id);
    await expect(
      db.auditLog.findMany({ where: { organizationId: orgB.id } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });

  it("fills organizationId on create and refuses foreign tenants", async () => {
    const db = createTenantDb(orgA.id);
    const created = await db.auditLog.create({
      // organizationId intentionally omitted: the scope fills it in.
      data: { action: "test.created", entityType: "Test" } as never,
    });
    expect(created.organizationId).toBe(orgA.id);

    await expect(
      db.auditLog.create({ data: { organizationId: orgB.id, action: "x", entityType: "Test" } }),
    ).rejects.toBeInstanceOf(TenantViolationError);

    await expect(
      db.auditLog.createMany({
        data: [
          { organizationId: orgA.id, action: "ok", entityType: "Test" },
          { organizationId: orgB.id, action: "bad", entityType: "Test" },
        ],
      }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });

  it("cannot update or delete another tenant's rows", async () => {
    const db = createTenantDb(orgA.id);
    await expect(
      db.auditLog.update({ where: { id: auditB.id }, data: { summary: "hacked" } }),
    ).rejects.toThrow();
    const updated = await db.auditLog.updateMany({
      where: { id: auditB.id },
      data: { summary: "hacked" },
    });
    expect(updated.count).toBe(0);
    const deleted = await db.auditLog.deleteMany({ where: { id: auditB.id } });
    expect(deleted.count).toBe(0);

    const untouched = await prisma.auditLog.findUniqueOrThrow({ where: { id: auditB.id } });
    expect(untouched.summary).toBeNull();
  });

  it("never moves a row to another tenant", async () => {
    const db = createTenantDb(orgA.id);
    const row = await db.auditLog.findFirstOrThrow();
    await expect(
      db.auditLog.update({ where: { id: row.id }, data: { organizationId: orgB.id } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });

  it("restricts the Organization model to the current tenant", async () => {
    const db = createTenantDb(orgA.id);
    const organizations = await db.organization.findMany();
    expect(organizations.map((org) => org.id)).toEqual([orgA.id]);
    // Naming another tenant explicitly is a violation, not an empty result.
    await expect(db.organization.findUnique({ where: { id: orgB.id } })).rejects.toBeInstanceOf(
      TenantViolationError,
    );
    await expect(
      db.organization.update({ where: { id: orgB.id }, data: { name: "stolen" } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
    await expect(
      db.organization.create({ data: { name: "x", slug: "x-new" } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });

  it("keeps the scope inside interactive transactions", async () => {
    const db = createTenantDb(orgA.id);
    const count = await db.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { action: "test.tx", entityType: "Test" } as never });
      return tx.auditLog.count({ where: { entityType: "Test" } });
    });
    const expected = await prisma.auditLog.count({
      where: { organizationId: orgA.id, entityType: "Test" },
    });
    expect(count).toBe(expected);
    const txRow = await prisma.auditLog.findFirstOrThrow({ where: { action: "test.tx" } });
    expect(txRow.organizationId).toBe(orgA.id);
  });

  it("scopes upserts to the current tenant", async () => {
    const db = createTenantDb(orgA.id);
    await expect(
      db.organizationSetting.upsert({
        where: { organizationId: orgB.id },
        create: { organizationId: orgB.id },
        update: { city: "Pune" },
      }),
    ).rejects.toBeInstanceOf(TenantViolationError);

    const settings = await db.organizationSetting.upsert({
      where: { organizationId: orgA.id },
      create: { organizationId: orgA.id },
      update: { city: "Mumbai" },
    });
    expect(settings.city).toBe("Mumbai");
    const other = await prisma.organizationSetting.findUniqueOrThrow({
      where: { organizationId: orgB.id },
    });
    expect(other.city).toBeNull();
  });
});

describe("tenant client and global identity models (T5)", () => {
  it("only exposes users who are members of the current organization", async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const roleA = await prisma.role.create({
      data: { organizationId: orgA.id, key: "executive", name: "Executive" },
    });
    const roleB = await prisma.role.create({
      data: { organizationId: orgB.id, key: "executive", name: "Executive" },
    });
    const alice = await prisma.user.create({
      data: { name: "Alice", email: `alice-${orgA.id}@test.local` },
    });
    const bob = await prisma.user.create({
      data: { name: "Bob", email: `bob-${orgB.id}@test.local` },
    });
    await prisma.membership.create({
      data: { organizationId: orgA.id, userId: alice.id, roleId: roleA.id },
    });
    await prisma.membership.create({
      data: { organizationId: orgB.id, userId: bob.id, roleId: roleB.id },
    });

    const db = createTenantDb(orgA.id);
    expect((await db.user.findMany()).map((u) => u.id)).toEqual([alice.id]);
    expect(await db.user.findUnique({ where: { id: bob.id } })).toBeNull();
    expect(await db.user.findFirst({ where: { email: bob.email } })).toBeNull();
    const updated = await db.user.updateMany({ where: { id: bob.id }, data: { name: "Hacked" } });
    expect(updated.count).toBe(0);
    await expect(
      db.user.update({ where: { id: bob.id }, data: { name: "Hacked" } }),
    ).rejects.toThrow();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: bob.id } })).name).toBe("Bob");
  });

  it("blocks authentication internals and scopes sessions", async () => {
    const org = await createTestOrganization();
    const db = createTenantDb(org.id);
    await expect(db.account.findMany()).rejects.toBeInstanceOf(TenantViolationError);
    await expect(db.verification.findMany()).rejects.toBeInstanceOf(TenantViolationError);
    await expect(db.rateLimit.findMany()).rejects.toBeInstanceOf(TenantViolationError);
    await expect(
      db.session.create({ data: { token: "t", expiresAt: new Date(), userId: org.id } as never }),
    ).rejects.toBeInstanceOf(TenantViolationError);
    expect(await db.session.findMany()).toEqual([]);
  });
});
