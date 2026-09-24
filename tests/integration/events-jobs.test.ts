import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  getServerRegistry,
  serverModules,
  setServerRegistryForTesting,
} from "@/modules/registry.server";
import { prisma } from "@/platform/db/client";
import { defineEventHandler, eventHandlerQueueName } from "@/platform/events/define";
import { publishEvent } from "@/platform/events/publish";
import { getBoss, stopBoss } from "@/platform/jobs/boss";
import { defineJob } from "@/platform/jobs/define";
import { enqueueJob } from "@/platform/jobs/enqueue";
import { startJobWorkers } from "@/platform/jobs/runner";
import { buildServerRegistry } from "@/platform/registry/server";

import { createTestContext, createTestOrganization } from "../support/factories";

const handled: { eventId: string; organizationId: string; changedFields: string[] }[] = [];
const processedJobs: string[] = [];

const testHandler = defineEventHandler({
  name: "test.record-settings-change",
  event: "organization.settings_updated",
  async handle(event, ctx) {
    handled.push({
      eventId: event.id,
      organizationId: ctx.organizationId,
      changedFields: event.payload.changedFields,
    });
  },
});

const testJob = defineJob<{ value: string }>({
  name: "test.echo",
  async handler(data) {
    processedJobs.push(data.value);
  },
});

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 15_000) {
  const started = Date.now();
  while (!(await predicate())) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe("domain events and background jobs (M01-12, M01-13)", () => {
  let org: { id: string };

  beforeAll(async () => {
    setServerRegistryForTesting(
      buildServerRegistry([
        ...serverModules,
        { key: "test", jobs: [testJob], eventHandlers: [testHandler] },
      ]),
    );
    org = await createTestOrganization();
    const boss = await getBoss("worker");
    await startJobWorkers(boss, getServerRegistry());
  });

  afterAll(async () => {
    await stopBoss({ graceful: false, timeout: 5_000 });
    setServerRegistryForTesting(undefined);
    await prisma.$disconnect();
  });

  it("writes the outbox row and dispatches handlers after commit", async () => {
    const ctx = createTestContext(org.id);
    const event = await ctx.db.$transaction((tx) =>
      publishEvent(tx, ctx, "organization.settings_updated", { changedFields: ["city"] }),
    );

    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.organizationId).toBe(org.id);
    expect(row.dispatchedTo).toContain("test.record-settings-change");
    expect(row.dispatchedTo).toContain("organization.log-settings-change");

    await waitFor(() => handled.some((h) => h.eventId === event.id));
    const record = handled.find((h) => h.eventId === event.id);
    expect(record).toEqual({ eventId: event.id, organizationId: org.id, changedFields: ["city"] });
  });

  it("drops the event and its handler jobs when the transaction rolls back", async () => {
    const ctx = createTestContext(org.id);
    let eventId: string | undefined;
    await expect(
      ctx.db.$transaction(async (tx) => {
        const event = await publishEvent(tx, ctx, "organization.settings_updated", {
          changedFields: ["x"],
        });
        eventId = event.id;
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");

    expect(eventId).toBeDefined();
    expect(await prisma.outboxEvent.findUnique({ where: { id: eventId! } })).toBeNull();
    const boss = await getBoss();
    const jobs = await boss.findJobs(eventHandlerQueueName(testHandler.name));
    expect(jobs.some((job) => (job.data as { event: { id: string } }).event.id === eventId)).toBe(
      false,
    );
  });

  it("runs enqueued jobs in the worker, including transactional enqueue", async () => {
    const value = randomUUID();
    await enqueueJob("test.echo", { value });
    await waitFor(() => processedJobs.includes(value));

    const ctx = createTestContext(org.id);
    const inTx = randomUUID();
    await ctx.db.$transaction(async (tx) => {
      await enqueueJob("test.echo", { value: inTx }, { tx });
    });
    await waitFor(() => processedJobs.includes(inTx));
  });

  it("rejects unknown jobs", async () => {
    await expect(enqueueJob("nope.missing", {})).rejects.toThrow('Unknown job "nope.missing"');
  });

  it("retries failed handlers", async () => {
    let attempts = 0;
    const flaky = defineJob({
      name: "test.flaky",
      queue: { retryLimit: 2, retryDelay: 1, retryBackoff: false },
      async handler() {
        attempts += 1;
        if (attempts < 2) throw new Error("transient");
      },
    });
    const registry = buildServerRegistry([...serverModules, { key: "test2", jobs: [flaky] }]);
    setServerRegistryForTesting(registry);
    const boss = await getBoss();
    await boss.createQueue(flaky.name, { retryLimit: 2, retryDelay: 1 });
    await boss.work(flaky.name, { pollingIntervalSeconds: 0.5 }, async () =>
      flaky.handler(undefined, {} as never),
    );
    await enqueueJob(flaky.name, {});
    await waitFor(() => attempts >= 2, 20_000);
    expect(attempts).toBe(2);
    vi.restoreAllMocks();
  });
});
