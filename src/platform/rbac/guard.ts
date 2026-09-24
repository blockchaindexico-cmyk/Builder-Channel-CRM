import "server-only";

import { forbidden } from "next/navigation";

import type { ServiceContext } from "@/platform/tenant/context";

/** Renders the 403 page (app/forbidden.tsx) when the actor lacks a permission. For pages/layouts only. */
export function requirePermission(ctx: ServiceContext, permission: string): void {
  if (!ctx.permissions.has(permission)) forbidden();
}
