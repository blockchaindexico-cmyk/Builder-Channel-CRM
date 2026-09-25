import type { Prisma } from "@/generated/prisma/client";
import type { BookingHistoryType, BookingStatus } from "@/generated/prisma/enums";
import { type DateRange, isIsoDate } from "@/lib/date-range";
import { compareDecimals } from "@/lib/decimal";
import { formatCalendarDate, formatMoney, toCalendarDateString } from "@/lib/format";
import type { TableQuery } from "@/lib/table-query";
import { findMembers } from "@/modules/identity";
import {
  ensureLeadInterest,
  findVisibleLead,
  isLeadInScope,
  recordLeadActivity,
  setLeadMilestones,
  setLeadStatusByKey,
} from "@/modules/leads";
import { notify } from "@/modules/notifications";
import { getRegionalSettings } from "@/modules/organization";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx, TenantTx } from "@/platform/db/tenant-scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import { resolveDataScope } from "@/platform/rbac/scope";
import { nextSequenceNumber } from "@/platform/sequences";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput, uuidOrNull } from "@/platform/validation";

import { BOOKING_STATUSES, BOOKING_VALUE_FIELDS, DEAL_TYPES } from "../constants";
import { DEAL_PERMISSIONS } from "../permissions";
import {
  type CancelBookingInput,
  cancelBookingSchema,
  closeBookingSchema,
  type CreateBookingInput,
  createBookingSchema,
  moveBookingStageSchema,
  type UpdateBookingInput,
  updateBookingSchema,
} from "../schemas";
import { advanceLeadStatus, leadStatusOf } from "./lead-status";
import { requireLossReason } from "./masters";
import { bookingScopeWhere, canActOnBooking, findVisibleBookingWhere } from "./scope";
import { loadDealProject } from "./visits";

/**
 * Bookings and closures (M08-07 → M08-10, PRD §12). A booking moves through the organization's stages (Q-09) to
 * Closed/Won, or is cancelled with a reason; every change is kept in `BookingHistory`, written with the lead
 * timeline, the audit log and an event in the same transaction. Values (agreement value, token amount) are seen and
 * changed only with `bookings.view_value` (Q-16).
 */

const VALUE_FIELDS: readonly string[] = BOOKING_VALUE_FIELDS;

const FIELD_LABELS: Record<string, string> = {
  projectId: "project",
  executiveId: "executive",
  customerName: "customer",
  coApplicantName: "co-applicant",
  unitNumber: "unit",
  tower: "tower",
  floor: "floor",
  configurationTypeId: "configuration",
  area: "area",
  bookingDate: "booking date",
  agreementValue: "agreement value",
  tokenAmount: "token amount",
  paymentPlan: "payment plan",
  builderReference: "builder reference",
  remarks: "remarks",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS);

export const canSeeBookingValues = (ctx: ServiceContext) =>
  ctx.permissions.has(DEAL_PERMISSIONS.bookingsViewValue);

function assertValueAccess(ctx: ServiceContext, values: Record<string, unknown>) {
  if (canSeeBookingValues(ctx)) return;
  if (VALUE_FIELDS.some((field) => values[field] !== undefined)) {
    throw new ForbiddenError(
      "Only people allowed to see booking values can enter them.",
      DEAL_PERMISSIONS.bookingsViewValue,
    );
  }
}

const statusLabel = (status: BookingStatus) =>
  BOOKING_STATUSES.find((entry) => entry.value === status)?.label ?? status;

/** "Tower B, unit 1203, 2 BHK" — how the booked unit reads in timelines and notifications. */
function unitSummary(unit: {
  tower?: string | null;
  unitNumber?: string | null;
  configuration?: string | null;
}) {
  return [
    unit.tower ? `Tower ${unit.tower}` : null,
    unit.unitNumber ? `unit ${unit.unitNumber}` : null,
    unit.configuration,
  ]
    .filter(Boolean)
    .join(", ");
}

/** An active member the actor may credit a booking to (their `bookings.manage` scope). */
async function requireCreditableExecutive(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  executiveId: string,
) {
  const [member] = await findMembers(tx, { ids: [executiveId], activeOnly: true });
  if (!member) {
    throw new ValidationError("Choose an active team member.", {
      executiveId: ["Unknown or inactive member"],
    });
  }
  const scope = await resolveDataScope(ctx, DEAL_PERMISSIONS.bookingsManage);
  if (scope.scope !== "ALL" && !scope.membershipIds.includes(member.membershipId)) {
    throw new ForbiddenError(
      "You can credit bookings only to yourself or your team.",
      DEAL_PERMISSIONS.bookingsManage,
    );
  }
  return member;
}

async function configurationName(tx: TenantDbOrTx, id: string | null | undefined) {
  if (!id) return null;
  const type = await tx.configurationType.findFirst({ where: { id }, select: { name: true } });
  if (!type) {
    throw new ValidationError("Choose a configuration.", {
      configurationTypeId: ["Unknown configuration"],
    });
  }
  return type.name;
}

async function writeHistory(
  tx: TenantDbOrTx,
  ctx: ServiceContext,
  bookingId: string,
  entry: {
    type: BookingHistoryType;
    fromStatus?: BookingStatus | null;
    toStatus?: BookingStatus | null;
    fromStage?: string | null;
    toStage?: string | null;
    changes?: Record<string, { from: string | null; to: string | null }>;
    note?: string | null;
    occurredAt?: Date;
  },
) {
  await tx.bookingHistory.create({
    data: {
      organizationId: ctx.organizationId,
      bookingId,
      type: entry.type,
      fromStatus: entry.fromStatus ?? null,
      toStatus: entry.toStatus ?? null,
      fromStage: entry.fromStage ?? null,
      toStage: entry.toStage ?? null,
      changes: (entry.changes ?? {}) as Prisma.InputJsonValue,
      note: entry.note ?? null,
      actorId: ctx.actor.membershipId ?? null,
      actorName: ctx.actor.name,
      ...(entry.occurredAt ? { occurredAt: entry.occurredAt } : {}),
    },
  });
}

/** Tells the booking's executive (when someone else acts), their manager and whoever oversees all bookings. */
async function notifyBookingUpdate(
  tx: TenantTx,
  ctx: ServiceContext,
  booking: { id: string; number: string; executiveId: string; managerId: string | null },
  event: "created" | "closed" | "cancelled",
  text: { title: string; body?: string | null },
) {
  const overseers = await findMembers(tx, {
    activeOnly: true,
    withPermission: DEAL_PERMISSIONS.bookingsView,
    scopes: ["ALL"],
  });
  const recipients = new Set<string>([
    booking.executiveId,
    ...(booking.managerId ? [booking.managerId] : []),
    ...overseers.map((member) => member.membershipId),
  ]);
  if (ctx.actor.membershipId) recipients.delete(ctx.actor.membershipId);
  if (recipients.size === 0) return;
  await notify(
    ctx,
    {
      type: "booking.update",
      recipientIds: [...recipients],
      title: text.title,
      body: text.body ?? null,
      link: `/bookings/${booking.id}`,
      entity: { type: "Booking", id: booking.id },
      actorName: ctx.actor.name,
      priority: event === "created" ? "NORMAL" : "HIGH",
      idempotencyKey: `booking.${event}:${booking.id}`,
    },
    { tx },
  );
}

// --- Create (M08-07) ---------------------------------------------------------------------------------------------

/**
 * Converts a lead to a booking: numbers it (BK-000001), credits the executive (the lead's owner unless someone else
 * is chosen, Q-10), snapshots their manager, starts it at the first active stage and moves the lead to Booking.
 */
export async function createBooking(
  ctx: ServiceContext,
  input: CreateBookingInput,
): Promise<{ id: string; number: string }> {
  const values = parseInput(createBookingSchema, input);
  assertValueAccess(ctx, input as Record<string, unknown>);
  return ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, values.leadId, {
      permission: DEAL_PERMISSIONS.bookingsManage,
      db: tx,
    });
    const status = await leadStatusOf(tx, lead.id);
    if (status.category === "LOST" || status.category === "INVALID") {
      throw new ConflictError(`${lead.number} is closed ("${status.label}"). Reopen it to book.`);
    }
    const project = await loadDealProject(tx, values.projectId);
    const executive = await requireCreditableExecutive(
      tx,
      ctx,
      values.executiveId ?? lead.ownerId ?? ctx.actor.membershipId ?? "",
    );
    const configuration = await configurationName(tx, values.configurationTypeId);
    if (values.visitId) {
      const visit = await tx.siteVisit.findFirst({
        where: { id: values.visitId, leadId: lead.id },
        select: { id: true },
      });
      if (!visit)
        throw new ValidationError("Choose a visit of this lead.", { visitId: ["Unknown"] });
    }
    const stage = await tx.bookingStage.findFirst({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: { id: true, label: true },
    });
    const number = await nextSequenceNumber(tx, ctx, "booking", "BK");
    const now = new Date();
    const booking = await tx.booking.create({
      data: {
        organizationId: ctx.organizationId,
        number,
        leadId: lead.id,
        projectId: project.id,
        builderId: project.builderId,
        visitId: values.visitId,
        executiveId: executive.membershipId,
        managerId: executive.reportsToId,
        customerName: values.customerName,
        coApplicantName: values.coApplicantName ?? null,
        unitNumber: values.unitNumber ?? null,
        tower: values.tower ?? null,
        floor: values.floor ?? null,
        configurationTypeId: values.configurationTypeId,
        area: values.area ?? null,
        bookingDate: new Date(`${values.bookingDate}T00:00:00.000Z`),
        agreementValue: values.agreementValue ?? null,
        tokenAmount: values.tokenAmount ?? null,
        paymentPlan: values.paymentPlan ?? null,
        builderReference: values.builderReference ?? null,
        stageId: stage?.id ?? null,
        remarks: values.remarks ?? null,
        createdById: ctx.actor.membershipId ?? null,
        createdByName: ctx.actor.name,
      },
    });
    await writeHistory(tx, ctx, booking.id, {
      type: "CREATED",
      toStatus: "ACTIVE",
      toStage: stage?.label ?? null,
      note: values.remarks ?? null,
      occurredAt: now,
    });
    await ensureLeadInterest(tx, ctx, lead.id, project.id);
    const milestones = await tx.lead.findFirstOrThrow({
      where: { id: lead.id },
      select: { bookedAt: true },
    });
    if (!milestones.bookedAt) await setLeadMilestones(tx, lead.id, { bookedAt: now });
    const unit = unitSummary({ ...values, configuration });
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: DEAL_TYPES.BOOKING_CREATED,
      summary: `Booking ${number} for ${project.name}${unit ? ` (${unit})` : ""} · credited to ${executive.name}`,
      payload: {
        bookingId: booking.id,
        number,
        project: { id: project.id, name: project.name },
        unit,
        executive: executive.name,
        stage: stage?.label ?? null,
      },
      occurredAt: now,
    });
    await recordAudit(tx, ctx, {
      action: "deals.booking.create",
      entityType: "Booking",
      entityId: booking.id,
      summary: `${lead.number}: booking ${number} for ${project.name}`,
      after: {
        project: project.name,
        executive: executive.name,
        bookingDate: values.bookingDate,
        ...(values.agreementValue ? { agreementValue: values.agreementValue } : {}),
        ...(values.tokenAmount ? { tokenAmount: values.tokenAmount } : {}),
      },
    });
    await publishEvent(tx, ctx, "booking.created", {
      bookingId: booking.id,
      leadId: lead.id,
      projectId: project.id,
      builderId: project.builderId,
      executiveId: executive.membershipId,
      managerId: executive.reportsToId,
    });
    await advanceLeadStatus(tx, ctx, lead.id, "BOOKING", `Booking ${number} · ${project.name}`);
    await notifyBookingUpdate(tx, ctx, booking, "created", {
      title: `New booking ${number}: ${lead.name} · ${project.name}`,
      body: [unit || null, `Credited to ${executive.name}`].filter(Boolean).join("\n"),
    });
    return { id: booking.id, number };
  });
}

// --- Change (M08-09) ---------------------------------------------------------------------------------------------

const bookingInclude = {
  lead: { select: { id: true, number: true, name: true, ownerId: true } },
  project: { select: { id: true, name: true, code: true } },
  builder: { select: { id: true, name: true } },
  stage: { select: { id: true, label: true } },
  executive: { select: { user: { select: { name: true } } } },
  manager: { select: { user: { select: { name: true } } } },
  configurationType: { select: { id: true, name: true } },
  cancelReason: { select: { id: true, label: true } },
  visit: { select: { id: true, number: true, isRevisit: true, scheduledAt: true } },
} satisfies Prisma.BookingInclude;

type BookingRecord = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

/** Loads a booking the actor may act on with `permission`. */
async function loadBookingFor(
  tx: TenantTx,
  ctx: ServiceContext,
  bookingId: string,
  permission: string,
): Promise<BookingRecord> {
  const booking = await tx.booking.findFirst({
    where: await findVisibleBookingWhere(ctx, bookingId),
    include: bookingInclude,
  });
  if (!booking) throw new NotFoundError("Booking", bookingId);
  if (!(await canActOnBooking(ctx, booking, permission))) {
    throw new ForbiddenError(undefined, permission);
  }
  return booking;
}

const text = (value: unknown) =>
  value === null || value === undefined || value === "" ? null : String(value);

/** Edits a booking's details (and values, with the permission); every changed field goes to its history. */
export async function updateBooking(
  ctx: ServiceContext,
  input: UpdateBookingInput,
): Promise<{ changed: string[] }> {
  const values = parseInput(updateBookingSchema, input);
  assertValueAccess(ctx, input as Record<string, unknown>);
  return ctx.db.$transaction(async (tx) => {
    const booking = await loadBookingFor(
      tx,
      ctx,
      values.bookingId,
      DEAL_PERMISSIONS.bookingsManage,
    );
    if (booking.status === "CANCELLED") {
      throw new ConflictError("A cancelled booking cannot be changed.");
    }
    const regional = await getRegionalSettings(ctx);
    const data: Prisma.BookingUncheckedUpdateInput = {};
    const changes: Record<string, { from: string | null; to: string | null }> = {};
    const track = (field: string, before: string | null, after: string | null) => {
      if (before !== after) changes[field] = { from: before, to: after };
    };

    if (values.projectId !== booking.projectId) {
      const project = await loadDealProject(tx, values.projectId);
      data.projectId = project.id;
      data.builderId = project.builderId;
      track("projectId", booking.project.name, project.name);
    }
    if (values.executiveId && values.executiveId !== booking.executiveId) {
      const executive = await requireCreditableExecutive(tx, ctx, values.executiveId);
      data.executiveId = executive.membershipId;
      data.managerId = executive.reportsToId;
      track("executiveId", booking.executive.user.name, executive.name);
    }
    if ((values.configurationTypeId ?? null) !== booking.configurationTypeId) {
      const name = await configurationName(tx, values.configurationTypeId);
      data.configurationTypeId = values.configurationTypeId;
      track("configurationTypeId", booking.configurationType?.name ?? null, name);
    }
    const bookingDate = toCalendarDateString(booking.bookingDate);
    if (values.bookingDate !== bookingDate) {
      data.bookingDate = new Date(`${values.bookingDate}T00:00:00.000Z`);
      track(
        "bookingDate",
        formatCalendarDate(bookingDate, regional),
        formatCalendarDate(values.bookingDate, regional),
      );
    }
    for (const field of [
      "customerName",
      "coApplicantName",
      "unitNumber",
      "tower",
      "floor",
      "paymentPlan",
      "builderReference",
      "remarks",
    ] as const) {
      const before = text(booking[field]);
      const after = text(values[field]);
      if (before !== after) {
        // The customer's name is required by the schema; the other fields may be cleared.
        (data as Record<string, unknown>)[field] = after;
        track(field, before, after);
      }
    }
    const sameAmount = (a: string | null, b: string | null) =>
      a === b || (a !== null && b !== null && compareDecimals(a, b) === 0);
    const areaBefore = text(booking.area?.toString());
    const areaAfter = text(values.area);
    if (!sameAmount(areaBefore, areaAfter)) {
      data.area = areaAfter;
      const sqft = (value: string | null) => (value ? `${value} sq ft` : null);
      track("area", sqft(areaBefore), sqft(areaAfter));
    }
    for (const field of VALUE_FIELDS as readonly ("agreementValue" | "tokenAmount")[]) {
      if (values[field] === undefined) continue;
      const before = text(booking[field]?.toString());
      const after = text(values[field]);
      if (!sameAmount(before, after)) {
        data[field] = after;
        const money = (value: string | null) => (value ? formatMoney(value, regional) : null);
        track(field, money(before), money(after));
      }
    }
    const fields = Object.keys(changes);
    if (fields.length === 0) return { changed: [] };

    await tx.booking.update({ where: { id: booking.id }, data });
    await writeHistory(tx, ctx, booking.id, { type: "UPDATED", changes, note: values.note });
    const visibleFields = fields.filter((field) => !VALUE_FIELDS.includes(field));
    await recordLeadActivity(tx, ctx, {
      leadId: booking.leadId,
      type: DEAL_TYPES.BOOKING_UPDATED,
      summary: `Booking ${booking.number} updated${
        visibleFields.length
          ? `: ${visibleFields.map((field) => FIELD_LABELS[field]).join(", ")}`
          : ""
      }${values.note ? ` — ${values.note}` : ""}`,
      payload: { bookingId: booking.id, number: booking.number, fields: visibleFields },
    });
    await recordAudit(tx, ctx, {
      action: "deals.booking.update",
      entityType: "Booking",
      entityId: booking.id,
      summary: `Booking ${booking.number} updated: ${fields.map((field) => FIELD_LABELS[field]).join(", ")}`,
      changes,
      metadata: values.note ? { note: values.note } : undefined,
    });
    await publishEvent(tx, ctx, "booking.updated", {
      bookingId: booking.id,
      leadId: booking.leadId,
      fields,
    });
    return { changed: fields.map((field) => FIELD_LABELS[field] ?? field) };
  });
}

/** Moves an open booking to another of the organization's stages (M08-09). */
export async function moveBookingToStage(
  ctx: ServiceContext,
  input: { bookingId: string; stageId: string; note?: string | null },
): Promise<{ stage: string }> {
  const values = parseInput(moveBookingStageSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const booking = await loadBookingFor(
      tx,
      ctx,
      values.bookingId,
      DEAL_PERMISSIONS.bookingsManage,
    );
    if (booking.status !== "ACTIVE") {
      throw new ConflictError(
        `Booking ${booking.number} is ${statusLabel(booking.status).toLowerCase()}.`,
      );
    }
    const stage = await tx.bookingStage.findFirst({
      where: { id: values.stageId, isActive: true },
      select: { id: true, label: true },
    });
    if (!stage)
      throw new ValidationError("Choose an active stage.", { stageId: ["Unknown stage"] });
    if (stage.id === booking.stageId) {
      throw new ConflictError(`Booking ${booking.number} is at "${stage.label}" already.`);
    }
    const now = new Date();
    await tx.booking.update({ where: { id: booking.id }, data: { stageId: stage.id } });
    await writeHistory(tx, ctx, booking.id, {
      type: "STAGE_CHANGED",
      fromStage: booking.stage?.label ?? null,
      toStage: stage.label,
      note: values.note,
      occurredAt: now,
    });
    const move = `${booking.stage?.label ?? "No stage"} → ${stage.label}`;
    await recordLeadActivity(tx, ctx, {
      leadId: booking.leadId,
      type: DEAL_TYPES.BOOKING_STAGE_CHANGED,
      summary: `Booking ${booking.number}: ${move}${values.note ? ` — ${values.note}` : ""}`,
      payload: {
        bookingId: booking.id,
        number: booking.number,
        from: booking.stage?.label ?? null,
        to: stage.label,
        note: values.note,
      },
      occurredAt: now,
    });
    await recordAudit(tx, ctx, {
      action: "deals.booking.stage",
      entityType: "Booking",
      entityId: booking.id,
      summary: `Booking ${booking.number}: ${move}`,
      changes: { stage: { from: booking.stage?.label ?? null, to: stage.label } },
    });
    await publishEvent(tx, ctx, "booking.updated", {
      bookingId: booking.id,
      leadId: booking.leadId,
      fields: ["stage"],
      stage: stage.label,
    });
    return { stage: stage.label };
  });
}

/** Closes the booking as won (M08-09): the deal is done and the lead moves to Closed/Won. */
export async function closeBooking(
  ctx: ServiceContext,
  input: { bookingId: string; note?: string | null },
): Promise<void> {
  const values = parseInput(closeBookingSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const booking = await loadBookingFor(tx, ctx, values.bookingId, DEAL_PERMISSIONS.bookingsClose);
    const now = new Date();
    const { count } = await tx.booking.updateMany({
      where: { id: booking.id, status: "ACTIVE" },
      data: { status: "CLOSED_WON", closedAt: now, closedByName: ctx.actor.name },
    });
    if (count === 0) {
      throw new ConflictError(
        `Booking ${booking.number} is ${statusLabel(booking.status).toLowerCase()}.`,
      );
    }
    await writeHistory(tx, ctx, booking.id, {
      type: "CLOSED",
      fromStatus: "ACTIVE",
      toStatus: "CLOSED_WON",
      fromStage: booking.stage?.label ?? null,
      note: values.note,
      occurredAt: now,
    });
    await recordLeadActivity(tx, ctx, {
      leadId: booking.leadId,
      type: DEAL_TYPES.BOOKING_CLOSED,
      summary: `Booking ${booking.number} closed — deal won with ${booking.project.name}${
        values.note ? `: ${values.note}` : ""
      }`,
      payload: { bookingId: booking.id, number: booking.number, note: values.note },
      occurredAt: now,
    });
    await recordAudit(tx, ctx, {
      action: "deals.booking.close",
      entityType: "Booking",
      entityId: booking.id,
      summary: `Booking ${booking.number} closed as won`,
      changes: { status: { from: "In progress", to: "Closed / Won" } },
    });
    await publishEvent(tx, ctx, "booking.closed", {
      bookingId: booking.id,
      leadId: booking.leadId,
      executiveId: booking.executiveId,
    });
    await advanceLeadStatus(
      tx,
      ctx,
      booking.leadId,
      "CLOSED_WON",
      `Booking ${booking.number} closed`,
    );
    await notifyBookingUpdate(tx, ctx, booking, "closed", {
      title: `Deal closed: ${booking.number} · ${booking.lead.name} · ${booking.project.name}`,
      body: `Credited to ${booking.executive.user.name}${values.note ? `\n${values.note}` : ""}`,
    });
  });
}

/** Status a lead goes back to when its only booking is cancelled: the one it had before Booking. */
export async function statusBeforeBooking(db: TenantDbOrTx, leadId: string): Promise<string> {
  const booking = await db.leadStatus.findFirst({
    where: { key: "BOOKING" },
    select: { id: true },
  });
  const entry = booking
    ? await db.leadStatusHistory.findFirst({
        where: { leadId, toStatusId: booking.id },
        orderBy: { changedAt: "desc" },
        select: { fromStatusId: true },
      })
    : null;
  const previous = entry?.fromStatusId
    ? await db.leadStatus.findFirst({
        where: { id: entry.fromStatusId, isActive: true, category: { in: ["OPEN", "ACTIVE"] } },
        select: { key: true },
      })
    : null;
  return previous?.key ?? "POSITIVE";
}

/**
 * Cancels a booking (M08-10) with a reason. When the lead has no other open or won booking, it becomes Lost (with
 * the cancellation reason) or goes back to an active status — the person's choice. History is kept.
 */
export async function cancelBooking(
  ctx: ServiceContext,
  input: CancelBookingInput,
): Promise<{ leadOutcome: "LOST" | "ACTIVE" | "UNCHANGED"; leadStatus: string | null }> {
  const values = parseInput(cancelBookingSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const booking = await loadBookingFor(tx, ctx, values.bookingId, DEAL_PERMISSIONS.bookingsClose);
    const reason = await requireLossReason(
      tx,
      values.reasonId,
      "BOOKING_CANCELLED",
      "reasonId",
      "Choose why the booking was cancelled.",
    );
    const now = new Date();
    const { count } = await tx.booking.updateMany({
      where: { id: booking.id, status: { in: ["ACTIVE", "CLOSED_WON"] } },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledByName: ctx.actor.name,
        cancelReasonId: reason.id,
        cancelNotes: values.notes ?? null,
      },
    });
    if (count === 0) throw new ConflictError(`Booking ${booking.number} is cancelled already.`);
    await writeHistory(tx, ctx, booking.id, {
      type: "CANCELLED",
      fromStatus: booking.status,
      toStatus: "CANCELLED",
      fromStage: booking.stage?.label ?? null,
      note: [reason.label, values.notes].filter(Boolean).join(" — "),
      occurredAt: now,
    });
    const why = `${reason.label}${values.notes ? ` — ${values.notes}` : ""}`;
    await recordLeadActivity(tx, ctx, {
      leadId: booking.leadId,
      type: DEAL_TYPES.BOOKING_CANCELLED,
      summary: `Booking ${booking.number} cancelled: ${why}`,
      payload: {
        bookingId: booking.id,
        number: booking.number,
        reason: { id: reason.id, label: reason.label },
        notes: values.notes ?? null,
        wasClosed: booking.status === "CLOSED_WON",
      },
      occurredAt: now,
    });
    await recordAudit(tx, ctx, {
      action: "deals.booking.cancel",
      entityType: "Booking",
      entityId: booking.id,
      summary: `Booking ${booking.number} cancelled (${why})`,
      changes: { status: { from: statusLabel(booking.status), to: "Cancelled" } },
    });

    // The lead: unchanged while another booking is open or won, else lost or back to work.
    const others = await tx.booking.count({
      where: {
        leadId: booking.leadId,
        id: { not: booking.id },
        status: { in: ["ACTIVE", "CLOSED_WON"] },
      },
    });
    let leadOutcome: "LOST" | "ACTIVE" | "UNCHANGED" = "UNCHANGED";
    let leadStatus: string | null = null;
    if (others === 0) {
      if (values.leadOutcome === "LOST") {
        const changed = await setLeadStatusByKey(
          tx,
          ctx,
          booking.leadId,
          "LOST",
          `Booking ${booking.number} cancelled: ${why}`,
          {
            workflow: true,
            details: { lossReasonId: reason.id, lossScope: "BOOKING_CANCELLED" },
          },
        );
        leadOutcome = "LOST";
        leadStatus = changed?.to.label ?? null;
      } else {
        const key = values.leadStatusKey || (await statusBeforeBooking(tx, booking.leadId));
        const target = await tx.leadStatus.findFirst({
          where: { key, isActive: true, category: { in: ["OPEN", "ACTIVE"] } },
          select: { key: true },
        });
        if (!target) {
          throw new ValidationError("Choose an active status for the lead.", {
            leadStatusKey: ["Choose an open or in-progress status"],
          });
        }
        const changed = await setLeadStatusByKey(
          tx,
          ctx,
          booking.leadId,
          target.key,
          `Booking ${booking.number} cancelled: ${why}`,
          {
            workflow: true,
          },
        );
        leadOutcome = "ACTIVE";
        leadStatus = changed?.to.label ?? null;
      }
    }
    await publishEvent(tx, ctx, "booking.cancelled", {
      bookingId: booking.id,
      leadId: booking.leadId,
      reasonId: reason.id,
      leadOutcome,
    });
    await notifyBookingUpdate(tx, ctx, booking, "cancelled", {
      title: `Booking cancelled: ${booking.number} · ${booking.lead.name} · ${booking.project.name}`,
      body: why,
    });
    return { leadOutcome, leadStatus };
  });
}

// --- Read (M08-08) -----------------------------------------------------------------------------------------------

export interface BookingRow {
  id: string;
  number: string;
  status: BookingStatus;
  stage: { id: string; label: string } | null;
  bookingDate: string;
  lead: { id: string; number: string; name: string };
  project: { id: string; name: string; code: string };
  builder: { id: string; name: string };
  executive: { id: string; name: string };
  manager: { id: string; name: string } | null;
  customerName: string;
  unitNumber: string | null;
  tower: string | null;
  floor: string | null;
  configuration: string | null;
  area: string | null;
  /** Null when not set — or hidden: see `valuesHidden`. */
  agreementValue: string | null;
  tokenAmount: string | null;
  valuesHidden: boolean;
  createdAt: string;
  closedAt: string | null;
  cancelledAt: string | null;
}

function toBookingRow(record: BookingRecord, showValues: boolean): BookingRow {
  return {
    id: record.id,
    number: record.number,
    status: record.status,
    stage: record.stage,
    bookingDate: toCalendarDateString(record.bookingDate)!,
    lead: { id: record.lead.id, number: record.lead.number, name: record.lead.name },
    project: record.project,
    builder: record.builder,
    executive: { id: record.executiveId, name: record.executive.user.name },
    manager:
      record.managerId && record.manager
        ? { id: record.managerId, name: record.manager.user.name }
        : null,
    customerName: record.customerName,
    unitNumber: record.unitNumber,
    tower: record.tower,
    floor: record.floor,
    configuration: record.configurationType?.name ?? null,
    area: record.area?.toString() ?? null,
    agreementValue: showValues ? (record.agreementValue?.toString() ?? null) : null,
    tokenAmount: showValues ? (record.tokenAmount?.toString() ?? null) : null,
    valuesHidden: !showValues,
    createdAt: record.createdAt.toISOString(),
    closedAt: record.closedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
  };
}

export interface BookingHistoryRow {
  id: string;
  type: BookingHistoryType;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus | null;
  fromStage: string | null;
  toStage: string | null;
  changes: {
    field: string;
    label: string;
    from: string | null;
    to: string | null;
    hidden: boolean;
  }[];
  note: string | null;
  actorName: string;
  occurredAt: string;
}

export interface BookingFileRow {
  id: string;
  title: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedByName: string;
  createdAt: string;
}

export interface BookingDetail extends BookingRow {
  coApplicantName: string | null;
  configurationTypeId: string | null;
  paymentPlan: string | null;
  builderReference: string | null;
  remarks: string | null;
  createdByName: string;
  closedByName: string | null;
  cancelledByName: string | null;
  cancelReason: { id: string; label: string } | null;
  cancelNotes: string | null;
  visit: { id: string; label: string; scheduledAt: string } | null;
  history: BookingHistoryRow[];
  files: BookingFileRow[];
  permissions: { canManage: boolean; canClose: boolean; canSeeValues: boolean };
}

/** A booking with its history and documents; values only with `bookings.view_value`. */
export async function getBooking(ctx: ServiceContext, bookingId: string): Promise<BookingDetail> {
  const record = await ctx.db.booking.findFirst({
    where: await findVisibleBookingWhere(ctx, bookingId),
    include: bookingInclude,
  });
  if (!record) throw new NotFoundError("Booking", bookingId);
  const showValues = canSeeBookingValues(ctx);
  const [history, files, canManage, canClose] = await Promise.all([
    ctx.db.bookingHistory.findMany({
      where: { bookingId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    }),
    ctx.db.bookingFile.findMany({
      where: { bookingId, deletedAt: null, file: { status: "READY" } },
      orderBy: { createdAt: "desc" },
      include: { file: { select: { fileName: true, contentType: true, size: true } } },
    }),
    canActOnBooking(ctx, record, DEAL_PERMISSIONS.bookingsManage),
    canActOnBooking(ctx, record, DEAL_PERMISSIONS.bookingsClose),
  ]);
  return {
    ...toBookingRow(record, showValues),
    coApplicantName: record.coApplicantName,
    configurationTypeId: record.configurationTypeId,
    paymentPlan: record.paymentPlan,
    builderReference: record.builderReference,
    remarks: record.remarks,
    createdByName: record.createdByName,
    closedByName: record.closedByName,
    cancelledByName: record.cancelledByName,
    cancelReason: record.cancelReason,
    cancelNotes: record.cancelNotes,
    visit: record.visit
      ? {
          id: record.visit.id,
          label: `${record.visit.isRevisit ? "Revisit" : "Visit"} ${record.visit.number}`,
          scheduledAt: record.visit.scheduledAt.toISOString(),
        }
      : null,
    history: history.map((entry) => ({
      id: entry.id,
      type: entry.type,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      fromStage: entry.fromStage,
      toStage: entry.toStage,
      changes: Object.entries(
        (entry.changes ?? {}) as Record<string, { from: string | null; to: string | null }>,
      )
        // Stored as JSON (no key order): show the fields in the form's order.
        .sort(([a], [b]) => FIELD_ORDER.indexOf(a) - FIELD_ORDER.indexOf(b))
        .map(([field, change]) => {
          const hidden = VALUE_FIELDS.includes(field) && !showValues;
          const label = FIELD_LABELS[field] ?? field;
          return {
            field,
            label: `${label.charAt(0).toUpperCase()}${label.slice(1)}`,
            from: hidden ? null : change.from,
            to: hidden ? null : change.to,
            hidden,
          };
        }),
      note: entry.note,
      actorName: entry.actorName,
      occurredAt: entry.occurredAt.toISOString(),
    })),
    files: files.map((row) => ({
      id: row.id,
      title: row.title,
      fileName: row.file.fileName,
      contentType: row.file.contentType,
      size: row.file.size,
      uploadedByName: row.uploadedByName,
      createdAt: row.createdAt.toISOString(),
    })),
    permissions: { canManage, canClose, canSeeValues: showValues },
  };
}

/** All bookings of a lead (its booking panel), newest first. */
export async function listLeadBookings(ctx: ServiceContext, leadId: string): Promise<BookingRow[]> {
  ctx.permissions.assert(DEAL_PERMISSIONS.bookingsView);
  await findVisibleLead(ctx, leadId);
  const records = await ctx.db.booking.findMany({
    where: { leadId },
    include: bookingInclude,
    orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
  });
  const showValues = canSeeBookingValues(ctx);
  return records.map((record) => toBookingRow(record, showValues));
}

export interface BookingFilters {
  builderId?: string | null;
  projectId?: string | null;
  managerId?: string | null;
  executiveId?: string | null;
  status?: string | null;
  stageId?: string | null;
  /** Booking dates (calendar dates, inclusive). */
  range?: DateRange | null;
}

export const BOOKING_SORTABLE_FIELDS = ["bookingDate", "number", "agreementValue"] as const;

function bookingFilterWhere(filters: BookingFilters): Prisma.BookingWhereInput[] {
  const and: Prisma.BookingWhereInput[] = [];
  const builderId = uuidOrNull(filters.builderId);
  if (builderId) and.push({ builderId });
  const projectId = uuidOrNull(filters.projectId);
  if (projectId) and.push({ projectId });
  const managerId = uuidOrNull(filters.managerId);
  if (managerId) and.push({ managerId });
  const executiveId = uuidOrNull(filters.executiveId);
  if (executiveId) and.push({ executiveId });
  const stageId = uuidOrNull(filters.stageId);
  if (stageId) and.push({ stageId, status: "ACTIVE" });
  if (BOOKING_STATUSES.some((entry) => entry.value === filters.status)) {
    and.push({ status: filters.status as BookingStatus });
  }
  if (filters.range && isIsoDate(filters.range.from) && isIsoDate(filters.range.to)) {
    and.push({
      bookingDate: {
        gte: new Date(`${filters.range.from}T00:00:00.000Z`),
        lte: new Date(`${filters.range.to}T00:00:00.000Z`),
      },
    });
  }
  return and;
}

/** Bookings within the actor's `bookings.view` scope (by credited executive), with filters (M08-08). */
export async function listBookings(
  ctx: ServiceContext,
  query: TableQuery,
  filters: BookingFilters,
): Promise<{ rows: BookingRow[]; total: number }> {
  const and: Prisma.BookingWhereInput[] = [
    await bookingScopeWhere(ctx),
    ...bookingFilterWhere(filters),
  ];
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { unitNumber: { contains: q, mode: "insensitive" } },
        { lead: { name: { contains: q, mode: "insensitive" } } },
        { lead: { number: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  const where: Prisma.BookingWhereInput = { AND: and };
  const showValues = canSeeBookingValues(ctx);
  const direction = query.sort?.direction ?? "desc";
  const orderBy: Prisma.BookingOrderByWithRelationInput[] =
    query.sort?.field === "number"
      ? [{ number: direction }]
      : query.sort?.field === "agreementValue" && showValues
        ? [{ agreementValue: { sort: direction, nulls: "last" } }, { id: "desc" }]
        : [{ bookingDate: direction }, { createdAt: direction }];
  const [total, records] = await Promise.all([
    ctx.db.booking.count({ where }),
    ctx.db.booking.findMany({
      where,
      include: bookingInclude,
      orderBy,
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return { total, rows: records.map((record) => toBookingRow(record, showValues)) };
}

/** Counts and (with the permission) totals of the bookings matching the filters, per status. */
export async function summarizeBookings(
  ctx: ServiceContext,
  filters: BookingFilters,
): Promise<{
  byStatus: Record<BookingStatus, number>;
  values: { agreementValue: string; tokenAmount: string } | null;
}> {
  const where: Prisma.BookingWhereInput = {
    AND: [await bookingScopeWhere(ctx), ...bookingFilterWhere({ ...filters, status: null })],
  };
  const groups = await ctx.db.booking.groupBy({ by: ["status"], where, _count: { _all: true } });
  const byStatus = { ACTIVE: 0, CLOSED_WON: 0, CANCELLED: 0 } as Record<BookingStatus, number>;
  for (const group of groups) byStatus[group.status] = group._count._all;
  let values: { agreementValue: string; tokenAmount: string } | null = null;
  if (canSeeBookingValues(ctx)) {
    const sums = await ctx.db.booking.aggregate({
      where: { AND: [where, { status: { in: ["ACTIVE", "CLOSED_WON"] } }] },
      _sum: { agreementValue: true, tokenAmount: true },
    });
    values = {
      agreementValue: sums._sum.agreementValue?.toString() ?? "0",
      tokenAmount: sums._sum.tokenAmount?.toString() ?? "0",
    };
  }
  return { byStatus, values };
}

/** Whether the actor may create a booking on this lead (header action, M08-07). */
export async function canBookLead(
  ctx: ServiceContext,
  lead: { ownerId: string | null },
): Promise<boolean> {
  return isLeadInScope(ctx, lead, DEAL_PERMISSIONS.bookingsManage);
}

/** What the booking form offers (M08-07): projects (the lead's interests first), people to credit, visits. */
export async function getBookingFormOptions(
  ctx: ServiceContext,
  leadId: string,
  current: { projectId?: string | null; executiveId?: string | null } = {},
) {
  const lead = await findVisibleLead(ctx, leadId, {
    include: { interests: { select: { projectId: true } } },
  });
  const interestIds = new Set(lead.interests.map((interest) => interest.projectId));
  const scope = await resolveDataScope(ctx, DEAL_PERMISSIONS.bookingsManage);
  const [projects, configurations, visits, members] = await Promise.all([
    ctx.db.project.findMany({
      where: {
        OR: [
          { isActive: true },
          { id: { in: [...interestIds, ...(current.projectId ? [current.projectId] : [])] } },
        ],
      },
      orderBy: [{ builder: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, isActive: true, builder: { select: { name: true } } },
    }),
    ctx.db.configurationType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { bedrooms: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    ctx.db.siteVisit.findMany({
      where: { leadId, status: "COMPLETED" },
      orderBy: { scheduledAt: "desc" },
      include: { project: { select: { name: true } } },
    }),
    // Executives within reach: the team (or everyone), plus whoever is credited now.
    scope.scope === "OWN"
      ? Promise.resolve([])
      : findMembers(ctx.db, {
          activeOnly: true,
          withPermission: DEAL_PERMISSIONS.bookingsView,
          ...(scope.scope === "TEAM" ? { ids: scope.membershipIds } : {}),
        }),
  ]);
  const regional = await getRegionalSettings(ctx);
  return {
    lead: { id: lead.id, number: lead.number, name: lead.name, ownerId: lead.ownerId },
    options: {
      projects: projects
        .filter(
          (project) =>
            project.isActive || interestIds.has(project.id) || project.id === current.projectId,
        )
        .map((project) => ({
          id: project.id,
          name: project.name,
          builderName: project.builder.name,
          interested: interestIds.has(project.id),
        })),
      configurations,
      executives: members.map((member) => ({ id: member.membershipId, name: member.name })),
      visits: visits.map((visit) => ({
        id: visit.id,
        projectId: visit.projectId,
        label: `${visit.isRevisit ? "Revisit" : "Visit"} ${visit.number} · ${visit.project.name} · ${formatCalendarDate(toCalendarDateString(visit.scheduledAt), regional)}`,
      })),
      canSeeValues: canSeeBookingValues(ctx),
    },
  };
}
