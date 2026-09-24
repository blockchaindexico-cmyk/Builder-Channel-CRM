import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordAudit } from "@/platform/audit";
import { prisma } from "@/platform/db/client";
import { nextSequenceNumber, nextSequenceValue } from "@/platform/sequences";

import { createTestContext, createTestOrganization } from "../support/factories";

describe("per-organization sequences (T7)", () => {
  let orgA: { id: string };
  let orgB: { id: string };

  beforeAll(async () => {
    orgA = await createTestOrganization();
    orgB = await createTestOrganization();
  });

  it("increments per organization and key", async () => {
    const ctxA = createTestContext(orgA.id);
    const ctxB = createTestContext(orgB.id);
    expect(await nextSequenceValue(ctxA.db, ctxA, "lead")).toBe(1);
    expect(await nextSequenceValue(ctxA.db, ctxA, "lead")).toBe(2);
    expect(await nextSequenceValue(ctxB.db, ctxB, "lead")).toBe(1);
    expect(await nextSequenceValue(ctxA.db, ctxA, "booking")).toBe(1);
    expect(await nextSequenceNumber(ctxA.db, ctxA, "lead", "LD")).toBe("LD-000003");
  });

  it("hands out unique numbers under concurrency", async () => {
    const ctx = createTestContext(orgA.id);
    const values = await Promise.all(
      Array.from({ length: 25 }, () => nextSequenceValue(ctx.db, ctx, "concurrent")),
    );
    expect(new Set(values).size).toBe(25);
    expect(Math.max(...values)).toBe(25);
  });

  it("does not consume a number when the transaction rolls back", async () => {
    const ctx = createTestContext(orgA.id);
    await expect(
      ctx.db.$transaction(async (tx) => {
        await nextSequenceValue(tx, ctx, "rollback");
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await nextSequenceValue(ctx.db, ctx, "rollback")).toBe(1);
  });

  it("rejects malformed keys", async () => {
    const ctx = createTestContext(orgA.id);
    await expect(nextSequenceValue(ctx.db, ctx, "bad key; drop")).rejects.toThrow(
      "Invalid sequence key",
    );
  });
});

describe("audit log (PRD §28)", () => {
  let org: { id: string };

  beforeAll(async () => {
    org = await createTestOrganization();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("records actor, request metadata and a field-level diff", async () => {
    const ctx = createTestContext(org.id, { actor: { name: "Asha Admin" } });
    const entry = await recordAudit(ctx.db, ctx, {
      action: "lead.update",
      entityType: "Lead",
      entityId: "lead-1",
      before: { name: "Ravi", budget: 50, password: "old", updatedAt: new Date(0) },
      after: { name: "Ravi K", budget: 50, password: "new", updatedAt: new Date() },
    });
    expect(entry.organizationId).toBe(org.id);
    expect(entry.actorName).toBe("Asha Admin");
    expect(entry.requestId).toBe(ctx.requestId);
    expect(entry.ipAddress).toBe("127.0.0.1");
    expect(entry.changes).toEqual({
      name: { from: "Ravi", to: "Ravi K" },
      password: { from: "[redacted]", to: "[redacted]" },
    });
  });

  it("rolls back with the surrounding transaction", async () => {
    const ctx = createTestContext(org.id);
    await expect(
      ctx.db.$transaction(async (tx) => {
        await recordAudit(tx, ctx, { action: "should.not.persist", entityType: "Test" });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await prisma.auditLog.count({ where: { action: "should.not.persist" } })).toBe(0);
  });
});
