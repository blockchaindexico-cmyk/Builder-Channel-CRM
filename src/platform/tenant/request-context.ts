import "server-only";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/platform/auth/auth";
import { type ActiveMembership, findActiveMembership } from "@/platform/auth/membership";
import { PermissionSet } from "@/platform/rbac/permissions";

import { createServiceContext, type ServiceContext } from "./context";

/** Header set by `src/proxy.ts` on every request. */
export const REQUEST_ID_HEADER = "x-request-id";
/** Path + query of the current request (set by `src/proxy.ts`) — used to return after signing in. */
export const PATHNAME_HEADER = "x-pathname";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  membershipId: string;
  roleKey: string;
  roleName: string;
  organizationName: string;
}

interface SessionState {
  context: ServiceContext;
  user: CurrentUser;
  membership: ActiveMembership;
}

/** The current Better Auth session (memoized per request). */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

function loginUrl(path: string | null, error?: string): string {
  const params = new URLSearchParams();
  if (path && path.startsWith("/") && !path.startsWith("/login")) params.set("next", path);
  if (error) params.set("error", error);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

const loadSessionState = cache(async (): Promise<SessionState> => {
  const requestHeaders = await headers();
  const session = await getSession();
  if (!session) redirect(loginUrl(requestHeaders.get(PATHNAME_HEADER)));

  const activeOrganizationId = (session.session as { activeOrganizationId?: string | null })
    .activeOrganizationId;
  const membership = await findActiveMembership(session.user.id, activeOrganizationId);
  // Deactivated (or removed) members are signed out immediately, even with a valid session cookie.
  if (!membership) redirect(loginUrl(null, "inactive"));

  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const context = createServiceContext({
    organizationId: membership.organizationId,
    actor: {
      type: "USER",
      id: session.user.id,
      name: session.user.name,
      membershipId: membership.id,
    },
    permissions: PermissionSet.fromGrants(membership.role.permissions),
    requestId: requestHeaders.get(REQUEST_ID_HEADER) ?? randomUUID(),
    ipAddress: forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent"),
  });

  return {
    context,
    membership,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: (session.user as { phone?: string | null }).phone ?? null,
      membershipId: membership.id,
      roleKey: membership.role.key,
      roleName: membership.role.name,
      organizationName: membership.organization.name,
    },
  };
});

/** Id of the auth session behind the current request (to mark "this device" and keep it when signing out others). */
export async function getCurrentSessionId(): Promise<string | null> {
  return (await getSession())?.session.id ?? null;
}

/**
 * Service context for the current request (server components, server actions, route handlers): the signed-in
 * user's active membership decides the tenant (rule T4) and the permissions. Redirects to /login when there
 * is no valid session or the membership is no longer active.
 */
export async function getRequestContext(): Promise<ServiceContext> {
  return (await loadSessionState()).context;
}

/** The signed-in user with role and organization, for the UI. */
export async function getCurrentUser(): Promise<CurrentUser> {
  return (await loadSessionState()).user;
}
