import { recordAudit } from "@/platform/audit";
import { NotFoundError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";

export interface MySession {
  id: string;
  current: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

function requireUserId(ctx: ServiceContext): string {
  if (ctx.actor.type !== "USER" || !ctx.actor.id) throw new NotFoundError("Session");
  return ctx.actor.id;
}

/** The signed-in user's active sessions (devices) in this organization (M02-16). */
export async function listMySessions(
  ctx: ServiceContext,
  currentSessionId: string | null,
): Promise<MySession[]> {
  const userId = requireUserId(ctx);
  const sessions = await ctx.db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      updatedAt: true,
      expiresAt: true,
    },
  });
  return sessions
    .map((session) => ({
      id: session.id,
      current: session.id === currentSessionId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.updatedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** Signs out one of the user's other devices. The current session is ended with the normal sign-out. */
export async function revokeMySession(
  ctx: ServiceContext,
  sessionId: string,
  currentSessionId: string | null,
): Promise<void> {
  const userId = requireUserId(ctx);
  if (sessionId === currentSessionId) throw new NotFoundError("Session", sessionId);
  await ctx.db.$transaction(async (tx) => {
    const { count } = await tx.session.deleteMany({ where: { id: sessionId, userId } });
    if (count === 0) throw new NotFoundError("Session", sessionId);
    await recordAudit(tx, ctx, {
      action: "auth.session_revoked",
      entityType: "User",
      entityId: userId,
      summary: "Signed out another device",
    });
  });
}

/** Signs out every other device of the user (M02-16). Returns how many sessions ended. */
export async function revokeMyOtherSessions(
  ctx: ServiceContext,
  currentSessionId: string | null,
): Promise<number> {
  const userId = requireUserId(ctx);
  return ctx.db.$transaction(async (tx) => {
    const { count } = await tx.session.deleteMany({
      where: { userId, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) },
    });
    if (count > 0) {
      await recordAudit(tx, ctx, {
        action: "auth.sessions_revoked",
        entityType: "User",
        entityId: userId,
        summary: `Signed out ${count} other device(s)`,
        metadata: { sessionsEnded: count },
      });
    }
    return count;
  });
}
