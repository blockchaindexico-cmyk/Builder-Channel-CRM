import type { Prisma } from "@/generated/prisma/client";
import { isLeadInScope, leadScopeWhere } from "@/modules/leads";
import { NotFoundError } from "@/platform/errors";
import { resolveDataScope } from "@/platform/rbac/scope";
import type { ServiceContext } from "@/platform/tenant/context";

import { DEAL_PERMISSIONS } from "../permissions";

/**
 * Visibility of visits and bookings (BUILD_PLAN §2.5):
 * - lists (`/visits`, `/bookings`) follow the person responsible — the visit's executive, the booking's credited
 *   executive — within the actor's scope of `visits.view` / `bookings.view`;
 * - on a lead's page, everyone who may see the lead sees all its visits and bookings (its history);
 * - changes need `visits.manage` / `bookings.manage` / `bookings.close` for the lead's owner or, for bookings, the
 *   credited executive.
 */
export async function visitScopeWhere(
  ctx: ServiceContext,
  permission: string = DEAL_PERMISSIONS.visitsView,
): Promise<Prisma.SiteVisitWhereInput> {
  const scope = await resolveDataScope(ctx, permission);
  const base: Prisma.SiteVisitWhereInput = { lead: { deletedAt: null } };
  if (scope.scope === "ALL") return base;
  if (scope.scope === "TEAM") {
    // Visits of unassigned leads wait for a manager, like the leads themselves.
    return {
      ...base,
      OR: [{ assignedToId: { in: scope.membershipIds } }, { assignedToId: null }],
    };
  }
  return { ...base, assignedToId: { in: scope.membershipIds } };
}

export async function bookingScopeWhere(
  ctx: ServiceContext,
  permission: string = DEAL_PERMISSIONS.bookingsView,
): Promise<Prisma.BookingWhereInput> {
  const scope = await resolveDataScope(ctx, permission);
  const base: Prisma.BookingWhereInput = { lead: { deletedAt: null } };
  if (scope.scope === "ALL") return base;
  return { ...base, executiveId: { in: scope.membershipIds } };
}

/** True when the actor may act (`permission`) on a booking: its lead's owner or its executive is in scope. */
export async function canActOnBooking(
  ctx: ServiceContext,
  booking: { executiveId: string; lead: { ownerId: string | null } },
  permission: string,
): Promise<boolean> {
  const scope = await resolveDataScope(ctx, permission).catch(() => null);
  if (!scope) return false;
  if (scope.scope === "ALL") return true;
  if (scope.membershipIds.includes(booking.executiveId)) return true;
  return isLeadInScope(ctx, booking.lead, permission);
}

/**
 * A booking the actor may see: inside their `bookings.view` scope, or on a lead they can see. Others are reported
 * as "not found".
 */
export async function findVisibleBookingWhere(
  ctx: ServiceContext,
  bookingId: string,
): Promise<Prisma.BookingWhereInput> {
  ctx.permissions.assert(DEAL_PERMISSIONS.bookingsView);
  const [scoped, leads] = await Promise.all([bookingScopeWhere(ctx), leadScopeWhere(ctx)]);
  return { AND: [{ id: bookingId }, { OR: [scoped, { lead: leads }] }] };
}

export function notFoundBooking(bookingId: string): never {
  throw new NotFoundError("Booking", bookingId);
}
