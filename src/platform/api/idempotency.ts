import { createHash } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/platform/db/client";

/** Stored responses are replayed for 24 hours (then the key may be reused). */
export const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;
/** A request still "in progress" after this long is considered crashed and may be taken over. */
const STALE_IN_PROGRESS_MS = 60 * 1000;

export const IDEMPOTENCY_KEY_PATTERN = /^[\x20-\x7E]{1,255}$/;

export type IdempotencyStart =
  | { kind: "new"; recordId: string }
  | { kind: "replay"; statusCode: number; body: unknown }
  | { kind: "mismatch" }
  | { kind: "in_progress" };

export function hashRequestBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

/**
 * `Idempotency-Key` handling (M04-20): the first request with a key reserves it; retries with the same key and the
 * same body get the stored response, a different body is rejected, and a retry while the first request is still
 * running is told to wait.
 */
export async function beginIdempotentRequest(
  apiKey: { id: string; organizationId: string },
  key: string,
  requestHash: string,
): Promise<IdempotencyStart> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const record = await prisma.apiIdempotencyKey.create({
        data: { organizationId: apiKey.organizationId, apiKeyId: apiKey.id, key, requestHash },
        select: { id: true },
      });
      return { kind: "new", recordId: record.id };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
    }
    const existing = await prisma.apiIdempotencyKey.findUnique({
      where: { apiKeyId_key: { apiKeyId: apiKey.id, key } },
    });
    if (!existing) continue;
    const age = Date.now() - existing.createdAt.getTime();
    if (age > IDEMPOTENCY_TTL_MS) {
      await prisma.apiIdempotencyKey.deleteMany({ where: { id: existing.id } });
      continue;
    }
    if (existing.requestHash !== requestHash) return { kind: "mismatch" };
    if (existing.statusCode === null) {
      if (age < STALE_IN_PROGRESS_MS) return { kind: "in_progress" };
      const takenOver = await prisma.apiIdempotencyKey.updateMany({
        where: { id: existing.id, statusCode: null, createdAt: existing.createdAt },
        data: { createdAt: new Date() },
      });
      if (takenOver.count === 1) return { kind: "new", recordId: existing.id };
      continue;
    }
    return { kind: "replay", statusCode: existing.statusCode, body: existing.response };
  }
  return { kind: "in_progress" };
}

/** Stores the final response of a reserved key so retries replay it. */
export async function completeIdempotentRequest(
  recordId: string,
  statusCode: number,
  body: unknown,
): Promise<void> {
  await prisma.apiIdempotencyKey.update({
    where: { id: recordId },
    data: { statusCode, response: body as Prisma.InputJsonValue },
  });
}

/** Releases a reserved key after an unexpected failure so the client can retry. */
export async function abandonIdempotentRequest(recordId: string): Promise<void> {
  await prisma.apiIdempotencyKey.deleteMany({ where: { id: recordId, statusCode: null } });
}
