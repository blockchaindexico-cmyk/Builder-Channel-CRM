import { type NextRequest, NextResponse } from "next/server";

import { buildContentSecurityPolicy, storageOriginsFromEnv } from "@/platform/security/csp";
import { normalizeRequestId } from "@/platform/security/request-id";

/**
 * Runs before every request (Next.js 16 `proxy`, formerly middleware):
 * - assigns a request id (`x-request-id`) used to correlate logs, audit entries and events;
 * - sets a nonce-based Content-Security-Policy on page requests (M01-18).
 *
 * Authentication checks are added in M02 — and are always repeated server-side in every page, action and
 * route handler, because proxy coverage alone is not a security boundary.
 */
export function proxy(request: NextRequest) {
  const requestId = normalizeRequestId(request.headers.get("x-request-id")) ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const isApi = request.nextUrl.pathname.startsWith("/api/");
  let csp: string | null = null;
  if (!isApi) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    csp = buildContentSecurityPolicy({
      nonce,
      isDev: process.env.NODE_ENV === "development",
      storageOrigins: storageOriginsFromEnv(process.env),
    });
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  if (csp) response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except static assets and image optimization.
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
