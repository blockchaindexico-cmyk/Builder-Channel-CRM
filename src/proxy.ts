import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

import { buildContentSecurityPolicy, storageOriginsFromEnv } from "@/platform/security/csp";
import { normalizeRequestId } from "@/platform/security/request-id";

/** Routes reachable without a session. Everything else requires signing in. */
const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/api/health",
  "/api/v1",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Runs before every request (Next.js 16 `proxy`, formerly middleware):
 * - assigns a request id (`x-request-id`) used to correlate logs, audit entries and events;
 * - redirects visitors without a session cookie to /login (an optimistic check — every page, action and
 *   route handler verifies the session and permissions again on the server);
 * - sets a nonce-based Content-Security-Policy on page requests (M01-18).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId = normalizeRequestId(request.headers.get("x-request-id")) ?? crypto.randomUUID();

  if (!isPublic(pathname) && !getSessionCookie(request, { cookiePrefix: "crm" })) {
    const url = new URL("/login", request.url);
    if (pathname !== "/" && !pathname.startsWith("/api/"))
      url.searchParams.set("next", `${pathname}${search}`);
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED" },
        { status: 401, headers: { "x-request-id": requestId } },
      );
    }
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("x-request-id", requestId);
    return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-pathname", `${pathname}${search}`);

  const isApi = pathname.startsWith("/api/");
  let csp: string | null = null;
  if (!isApi) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    csp = buildContentSecurityPolicy({
      nonce,
      isDev: process.env.NODE_ENV === "development",
      storageOrigins: storageOriginsFromEnv(process.env),
      upgradeInsecureRequests: process.env.APP_URL?.startsWith("https://") ?? false,
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
