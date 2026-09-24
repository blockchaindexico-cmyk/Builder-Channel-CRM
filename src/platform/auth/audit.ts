import { Prisma } from "@/generated/prisma/client";
import type { ActorType } from "@/generated/prisma/enums";
import { prisma } from "@/platform/db/client";
import { logger } from "@/platform/logger";

export function requestMetadata(headers: Headers | null | undefined): {
  ip: string | null;
  userAgent: string | null;
} {
  if (!headers) return { ip: null, userAgent: null };
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || headers.get("x-real-ip") || null,
    userAgent: headers.get("user-agent"),
  };
}

/**
 * Records an authentication event (sign-in, sign-out, lockout, password reset) in the audit log of every
 * organization the user belongs to (PRD §20, §28). Never throws: auditing must not break authentication.
 */
export async function recordUserSecurityEvent(input: {
  userId: string;
  action: string;
  summary: string;
  headers?: Headers | null;
  request?: Request;
  actorType?: ActorType;
  actorName?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { name: true, memberships: { select: { organizationId: true } } },
    });
    if (!user || user.memberships.length === 0) return;
    const { ip, userAgent } = requestMetadata(input.headers ?? input.request?.headers);
    const actorType = input.actorType ?? "USER";
    await prisma.auditLog.createMany({
      data: user.memberships.map((membership) => ({
        organizationId: membership.organizationId,
        actorType,
        actorId: actorType === "USER" ? input.userId : null,
        actorName: input.actorName ?? user.name,
        action: input.action,
        entityType: "User",
        entityId: input.userId,
        summary: input.summary,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.DbNull,
        ipAddress: ip,
        userAgent,
      })),
    });
  } catch (error) {
    logger.error({ err: error, action: input.action }, "failed to record security event");
  }
}
