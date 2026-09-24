import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { env } from "@/config/env";
import { prisma } from "@/platform/db/client";
import { logger } from "@/platform/logger";

import { recordUserSecurityEvent, requestMetadata } from "./audit";
import { sendPasswordResetEmail } from "./emails";
import { findActiveMembership } from "./membership";
import { assertPasswordPolicy } from "./password-policy";

/** Sign-in lockout (M02-05): after this many consecutive failures the account is locked for LOCK_MINUTES. */
export const MAX_FAILED_SIGN_INS = 5;
export const LOCK_MINUTES = 15;

export const AUTH_COOKIE_PREFIX = "crm";

const PASSWORD_PATHS = new Set(["/reset-password", "/change-password", "/set-password"]);

/**
 * Better Auth configuration (M02-01): e-mail + password, database sessions, no public sign-up.
 * Users are created by administrators (M02-10) and set their own password through an e-mailed link.
 */
export const auth = betterAuth({
  appName: "Builder Channel CRM",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: false,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, token }) {
      await sendPasswordResetEmail({ userId: user.id, email: user.email, name: user.name, token });
    },
    async onPasswordReset({ user }, request) {
      // First password set by an invited user activates their memberships.
      const invited = await prisma.membership.updateMany({
        where: { userId: user.id, status: "INVITED" },
        data: { status: "ACTIVE", joinedAt: new Date() },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, emailVerified: true },
      });
      await recordUserSecurityEvent({
        userId: user.id,
        action: invited.count > 0 ? "auth.invitation_accepted" : "auth.password_reset",
        summary:
          invited.count > 0 ? "Accepted the invitation and set a password" : "Reset their password",
        request,
      });
    },
  },

  user: {
    additionalFields: {
      phone: { type: "string", required: false, input: false },
      failedLoginCount: { type: "number", required: false, input: false, defaultValue: 0 },
      lockedUntil: { type: "date", required: false, input: false },
      lastLoginAt: { type: "date", required: false, input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // No cookie cache: every request validates the session row, so revoking sessions (sign out other
    // devices, deactivation, password reset) takes effect immediately and profile changes show at once.
    cookieCache: { enabled: false },
    additionalFields: {
      activeOrganizationId: { type: "string", required: false, input: false },
    },
  },

  rateLimit: {
    enabled: env.AUTH_RATE_LIMIT_ENABLED,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/request-password-reset": { window: 15 * 60, max: 5 },
      "/reset-password": { window: 15 * 60, max: 10 },
      "/change-password": { window: 15 * 60, max: 10 },
    },
  },

  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    useSecureCookies: env.APP_URL.startsWith("https://"),
    database: { generateId: false },
  },

  databaseHooks: {
    session: {
      create: {
        /** Only members of an active organization may sign in; the session remembers that organization. */
        async before(session) {
          const membership = await findActiveMembership(session.userId);
          if (!membership) {
            throw APIError.from("FORBIDDEN", {
              code: "ACCOUNT_INACTIVE",
              message: "Your account is not active. Please contact your administrator.",
            });
          }
          return { data: { ...session, activeOrganizationId: membership.organizationId } };
        },
      },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        const email = String(
          (ctx.body as { email?: unknown } | undefined)?.email ?? "",
        ).toLowerCase();
        const user = email
          ? await prisma.user.findUnique({ where: { email }, select: { lockedUntil: true } })
          : null;
        if (user?.lockedUntil && user.lockedUntil > new Date()) {
          const minutes = Math.max(
            1,
            Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000),
          );
          throw APIError.from("TOO_MANY_REQUESTS", {
            code: "ACCOUNT_LOCKED",
            message: `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          });
        }
      }
      if (PASSWORD_PATHS.has(ctx.path)) {
        const body = ctx.body as { newPassword?: unknown } | undefined;
        if (typeof body?.newPassword === "string") {
          const problem = assertPasswordPolicy(body.newPassword);
          if (problem)
            throw APIError.from("BAD_REQUEST", { code: "WEAK_PASSWORD", message: problem });
        }
      }
      if (ctx.path === "/sign-out") {
        const current = await getSessionFromCtx(ctx).catch(() => null);
        if (current) {
          await recordUserSecurityEvent({
            userId: current.user.id,
            action: "auth.logout",
            summary: "Signed out",
            headers: ctx.headers,
          });
        }
      }
    }),

    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/change-password") {
        const returned = ctx.context.returned as { user?: { id?: string } } | undefined;
        const userId = returned?.user?.id ?? ctx.context.session?.user.id;
        if (userId && !isAPIError(ctx.context.returned)) {
          await recordUserSecurityEvent({
            userId,
            action: "auth.password_changed",
            summary: "Changed their password",
            headers: ctx.headers,
          });
        }
        return;
      }
      if (ctx.path !== "/sign-in/email") return;
      const email = String(
        (ctx.body as { email?: unknown } | undefined)?.email ?? "",
      ).toLowerCase();
      const returned = ctx.context.returned;

      if (ctx.context.newSession) {
        const { user } = ctx.context.newSession;
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await recordUserSecurityEvent({
          userId: user.id,
          action: "auth.login",
          summary: "Signed in",
          headers: ctx.headers,
        });
        return;
      }

      if (isAPIError(returned) && returned.status === "UNAUTHORIZED" && email) {
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, failedLoginCount: true },
        });
        if (!user) return;
        const failures = user.failedLoginCount + 1;
        const lock = failures >= MAX_FAILED_SIGN_INS;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: lock ? 0 : failures,
            lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
          },
        });
        await recordUserSecurityEvent({
          userId: user.id,
          action: lock ? "auth.account_locked" : "auth.login_failed",
          summary: lock
            ? `Account locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED_SIGN_INS} failed sign-in attempts`
            : "Failed sign-in attempt (wrong password)",
          headers: ctx.headers,
          actorName: "Unknown (failed sign-in)",
          actorType: "SYSTEM",
          metadata: { ...requestMetadata(ctx.headers), attempt: failures },
        });
      }
    }),
  },

  logger: {
    log(level, message, ...args) {
      const log = logger.child({ component: "better-auth" });
      if (level === "error") log.error({ args }, message);
      else if (level === "warn") log.warn({ args }, message);
      else log.debug({ args }, message);
    },
  },

  // Profile changes go through our audited services; account deletion/linking is not offered.
  disabledPaths: [
    "/sign-up/email",
    "/update-user",
    "/change-email",
    "/delete-user",
    "/delete-user/callback",
    "/link-social",
    "/unlink-account",
  ],

  // Must be last: lets auth.api calls from server actions set cookies.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
export type AuthSession = typeof auth.$Infer.Session;
