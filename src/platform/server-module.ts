import { z } from "zod";

import { IDEMPOTENCY_TTL_MS } from "@/platform/api/idempotency";
import { prisma } from "@/platform/db/client";
import { EMAIL_SEND_JOB } from "@/platform/email/constants";
import { getEmailTransport } from "@/platform/email/transport";
import { defineJob } from "@/platform/jobs/define";
import type { ServerModule } from "@/platform/registry/server";
import { getStorage } from "@/platform/storage";

const emailMessageSchema = z.object({
  to: z.union([z.string().min(3), z.array(z.string().min(3)).min(1)]),
  subject: z.string().min(1),
  html: z.string(),
  text: z.string(),
  from: z.string().optional(),
  replyTo: z.string().optional(),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
});

/** Delivers queued e-mails (see `queueEmail`). Retries with backoff on SMTP failures. */
const sendEmailJob = defineJob({
  name: EMAIL_SEND_JOB,
  description: "Deliver a rendered e-mail",
  schema: emailMessageSchema,
  concurrency: 3,
  queue: { retryLimit: 5, retryDelay: 30, retryBackoff: true, retryDelayMax: 1800 },
  async handler(message, job) {
    const result = await getEmailTransport().send(message);
    job.logger.info(
      { to: message.to, subject: message.subject, messageId: result.messageId },
      "e-mail sent",
    );
  },
});

/** Keeps the outbox/event log bounded: removes events older than 90 days (daily, 02:30 UTC). */
const pruneOutboxJob = defineJob({
  name: "platform.outbox.prune",
  description: "Delete outbox events older than the retention window",
  cron: { expression: "30 2 * * *" },
  async handler(_data, job) {
    const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const { count } = await prisma.outboxEvent.deleteMany({
      where: { occurredAt: { lt: cutoff } },
    });
    job.logger.info({ deleted: count }, "pruned outbox events");
  },
});

/** Removes uploads that were requested but never completed (hourly). */
const cleanupPendingUploadsJob = defineJob({
  name: "platform.files.cleanup-pending",
  description: "Delete abandoned uploads older than 24 hours",
  cron: { expression: "15 * * * *" },
  async handler(_data, job) {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
    const stale = await prisma.fileObject.findMany({
      where: { status: "PENDING", createdAt: { lt: cutoff } },
      select: { id: true, key: true },
      take: 500,
    });
    const storage = getStorage();
    for (const file of stale) {
      await storage.deleteObject(file.key).catch(() => undefined);
      await prisma.fileObject.update({
        where: { id: file.id },
        data: { status: "DELETED", deletedAt: new Date() },
      });
    }
    job.logger.info({ removed: stale.length }, "cleaned up abandoned uploads");
  },
});

/** Drops expired idempotency records and finished rate-limit windows of the public API (hourly). */
const cleanupApiStateJob = defineJob({
  name: "platform.api.cleanup",
  description: "Delete idempotency records older than 24 hours and stale rate-limit windows",
  cron: { expression: "40 * * * *" },
  async handler(_data, job) {
    const now = Date.now();
    const idempotency = await prisma.apiIdempotencyKey.deleteMany({
      where: { createdAt: { lt: new Date(now - IDEMPOTENCY_TTL_MS) } },
    });
    const windows = await prisma.rateLimitWindow.deleteMany({
      where: { windowStart: { lt: new Date(now - 24 * 3600 * 1000) } },
    });
    job.logger.info(
      { idempotency: idempotency.count, rateLimitWindows: windows.count },
      "cleaned up public API state",
    );
  },
});

export const platformServerModule: ServerModule = {
  key: "platform",
  jobs: [sendEmailJob, pruneOutboxJob, cleanupPendingUploadsJob, cleanupApiStateJob],
};
