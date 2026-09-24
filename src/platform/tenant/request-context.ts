import "server-only";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { cache } from "react";

import { PermissionSet } from "@/platform/rbac/permissions";

import { type Actor, createServiceContext, type ServiceContext } from "./context";
import { resolveDefaultOrganization } from "./resolve";

/** Header set by `src/proxy.ts` on every request. */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Temporary actor for single-tenant bootstrap mode (M01). M02 replaces it with the signed-in user and their
 * role permissions; until then every request acts as this setup actor.
 */
const BOOTSTRAP_ACTOR: Actor = { type: "SYSTEM", id: null, name: "Setup (unauthenticated)" };

/**
 * Builds the service context for the current request (server components, server actions, route handlers).
 * Memoized per request with React `cache`.
 */
export const getRequestContext = cache(async (): Promise<ServiceContext> => {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip");

  const organization = await resolveDefaultOrganization();

  return createServiceContext({
    organizationId: organization.id,
    actor: BOOTSTRAP_ACTOR,
    permissions: PermissionSet.all(),
    requestId: requestHeaders.get(REQUEST_ID_HEADER) ?? randomUUID(),
    ipAddress: ipAddress ?? null,
    userAgent: requestHeaders.get("user-agent"),
  });
});
