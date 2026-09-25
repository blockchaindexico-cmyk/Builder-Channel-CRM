import type { Prisma, SiteVisit } from "@/generated/prisma/client";
import type { SiteVisitStatus, VisitNextStep } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/format";
import { plural } from "@/lib/utils";
import { findMembers } from "@/modules/identity";
import {
  ensureLeadInterest,
  findVisibleLead,
  listLeadSummaries,
  recordLeadActivity,
  setLeadMilestones,
} from "@/modules/leads";
import { notify } from "@/modules/notifications";
import { getRegionalSettings, type RegionalSettings } from "@/modules/organization";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx, TenantTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { DEAL_TYPES, OPEN_VISIT_STATUSES, VISIT_STATUSES } from "../constants";
import { DEAL_PERMISSIONS } from "../permissions";
import {
  cancelVisitSchema,
  type CompleteVisitInput,
  completeVisitSchema,
  noShowVisitSchema,
  type RescheduleVisitInput,
  rescheduleVisitSchema,
  type ScheduleVisitInput,
  scheduleVisitSchema,
  visitIdSchema,
} from "../schemas";
import { advanceLeadStatus, leadStatusOf } from "./lead-status";
import { cancelVisitReminder, scheduleVisitReminder } from "./reminders";
import { getDealSettings } from "./settings";

/**
 * Site visits and revisits (M08-03 → M08-05, M08-13). Every change writes the lead timeline, an audit entry and an
 * event in the same transaction. Nothing is deleted: completed, no-show, cancelled and rescheduled visits stay in
 * the history; a reschedule links the new visit to the old one and keeps its number.
 */
const OPEN = [...OPEN_VISIT_STATUSES] as SiteVisitStatus[];

/** Visits may be recorded up to this long after they happened (walk-ins logged later). */
const PAST_VISIT_DAYS = 30;

export interface VisitLead {
  id: string;
  number: string;
  name: string;
  ownerId: string | null;
}

export const visitLabel = (visit: { isRevisit: boolean; number: number }) =>
  `${visit.isRevisit ? "Revisit" : "Visit"} ${visit.number}`;

const statusLabel = (status: SiteVisitStatus) =>
  VISIT_STATUSES.find((entry) => entry.value === status)?.label.toLowerCase() ?? status;

/** A project to visit or book, with its builder. New visits and bookings need an active project. */
export async function loadDealProject(
  db: TenantDbOrTx,
  projectId: string,
  options: { allowInactive?: boolean } = {},
): Promise<{ id: string; name: string; code: string; builderId: string; builderName: string }> {
  const project = await db.project.findFirst({
    where: { id: projectId, ...(options.allowInactive ? {} : { isActive: true }) },
    select: {
      id: true,
      name: true,
      code: true,
      builderId: true,
      builder: { select: { name: true } },
    },
  });
  if (!project) {
    throw new ValidationError("Choose an active project.", { projectId: ["Unknown project"] });
  }
  return {
    id: project.id,
    name: project.name,
    code: project.code,
    builderId: project.builderId,
    builderName: project.builder.name,
  };
}

/** Closed leads (won, lost, invalid) get no new visits until they are reopened. */
async function assertLeadOpen(db: TenantDbOrTx, lead: VisitLead, what: string) {
  const status = await leadStatusOf(db, lead.id);
  if (status.isTerminal) {
    throw new ConflictError(
      `${lead.number} is closed ("${status.label}"). Reopen it to plan ${what}.`,
    );
  }
}

/**
 * Creates a visit inside `tx` for the lead's owner (or the person scheduling it while the lead has no owner), with
 * its reminder, and moves the lead to Visit / Revisit. Used by the lead page and by reschedules (which keep the
 * number, the revisit link and the executive of the visit they replace).
 */
export async function scheduleVisitInTx(
  tx: TenantTx,
  ctx: ServiceContext,
  lead: VisitLead,
  values: {
    projectId: string;
    scheduledAt: Date;
    pickupRequired: boolean;
    pickupAddress?: string | null;
    attendees?: number | null;
    notes?: string | null;
    parentVisitId?: string | null;
  },
  options: { rescheduledFrom?: SiteVisit; regional?: RegionalSettings; now?: Date } = {},
): Promise<SiteVisit> {
  const now = options.now ?? new Date();
  const previous = options.rescheduledFrom;
  if (previous) {
    if (values.scheduledAt.getTime() < now.getTime() - 60_000) {
      throw new ValidationError("Choose a time in the future.", {
        scheduledAt: ["This time has passed"],
      });
    }
  } else if (values.scheduledAt.getTime() < now.getTime() - PAST_VISIT_DAYS * 86_400_000) {
    throw new ValidationError(`Visits can be recorded up to ${PAST_VISIT_DAYS} days back.`, {
      scheduledAt: ["Too far in the past"],
    });
  }
  const project = await loadDealProject(tx, values.projectId, { allowInactive: Boolean(previous) });

  let isRevisit = previous?.isRevisit ?? false;
  let parentVisitId = previous?.parentVisitId ?? null;
  if (!previous) {
    const parent = values.parentVisitId
      ? await tx.siteVisit.findFirst({
          where: { id: values.parentVisitId, leadId: lead.id, status: "COMPLETED" },
          select: { id: true },
        })
      : // By default a revisit follows the latest completed visit, of the same project when there is one.
        ((await tx.siteVisit.findFirst({
          where: { leadId: lead.id, status: "COMPLETED", projectId: project.id },
          orderBy: { scheduledAt: "desc" },
          select: { id: true },
        })) ??
        (await tx.siteVisit.findFirst({
          where: { leadId: lead.id, status: "COMPLETED" },
          orderBy: { scheduledAt: "desc" },
          select: { id: true },
        })));
    if (values.parentVisitId && !parent) {
      throw new ValidationError("A revisit follows a completed visit of this lead.", {
        parentVisitId: ["Unknown or not completed visit"],
      });
    }
    isRevisit = Boolean(parent);
    parentVisitId = parent?.id ?? null;
  }
  const number =
    previous?.number ??
    (await tx.siteVisit.count({
      where: { leadId: lead.id, isRevisit, status: { not: "RESCHEDULED" } },
    })) + 1;
  const assignedToId = previous
    ? previous.assignedToId
    : (lead.ownerId ?? ctx.actor.membershipId ?? null);

  const visit = await tx.siteVisit.create({
    data: {
      organizationId: ctx.organizationId,
      leadId: lead.id,
      projectId: project.id,
      builderId: project.builderId,
      number,
      isRevisit,
      parentVisitId,
      scheduledAt: values.scheduledAt,
      assignedToId,
      pickupRequired: values.pickupRequired,
      pickupAddress: values.pickupRequired ? (values.pickupAddress ?? null) : null,
      attendees: values.attendees ?? null,
      notes: values.notes ?? null,
      createdById: ctx.actor.membershipId ?? null,
      createdByName: ctx.actor.name,
      rescheduledFromId: previous?.id ?? null,
    },
  });
  const regional = options.regional ?? (await getRegionalSettings(ctx));
  await scheduleVisitReminder(tx, ctx, visit, { lead, projectName: project.name, regional }, now);
  const label = visitLabel(visit);
  const when = formatDateTime(values.scheduledAt, regional);

  if (!previous) {
    // A project the lead had not listed joins its interests.
    const addedToInterests = await ensureLeadInterest(tx, ctx, lead.id, project.id);
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: DEAL_TYPES.VISIT_SCHEDULED,
      summary: `${label} to ${project.name} planned for ${when}${values.pickupRequired ? " · pickup" : ""}`,
      payload: {
        visitId: visit.id,
        number,
        isRevisit,
        project: { id: project.id, name: project.name },
        scheduledAt: values.scheduledAt.toISOString(),
        pickupRequired: values.pickupRequired,
        notes: values.notes ?? null,
        addedToInterests,
      },
    });
    await recordAudit(tx, ctx, {
      action: "deals.visit.schedule",
      entityType: "SiteVisit",
      entityId: visit.id,
      summary: `${lead.number}: ${label.toLowerCase()} to ${project.name} planned for ${when}`,
    });
    await publishEvent(tx, ctx, "visit.scheduled", {
      visitId: visit.id,
      leadId: lead.id,
      projectId: project.id,
      assignedToId,
      scheduledAt: values.scheduledAt.toISOString(),
      isRevisit,
    });
    await advanceLeadStatus(
      tx,
      ctx,
      lead.id,
      isRevisit ? "REVISIT" : "VISIT",
      `${label} to ${project.name} on ${when}`,
    );
  }
  if (assignedToId && assignedToId !== ctx.actor.membershipId) {
    await notify(
      ctx,
      {
        type: "visit.assigned",
        recipientIds: [assignedToId],
        title: `${label} of ${lead.number} · ${lead.name} to ${project.name} on ${when}`,
        body:
          [
            values.pickupRequired
              ? `Pickup${values.pickupAddress ? ` from ${values.pickupAddress}` : " needed"}`
              : null,
            values.notes,
          ]
            .filter(Boolean)
            .join("\n") || null,
        link: `/leads/${lead.id}?tab=visits`,
        entity: { type: "SiteVisit", id: visit.id },
        actorName: ctx.actor.name,
        idempotencyKey: `visit.assigned:${visit.id}`,
      },
      { tx },
    );
  }
  return visit;
}

/** Schedule from the lead page (M08-03, M08-05). */
export async function scheduleVisit(
  ctx: ServiceContext,
  input: ScheduleVisitInput,
): Promise<{ id: string; label: string; isRevisit: boolean }> {
  const values = parseInput(scheduleVisitSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, values.leadId, {
      permission: DEAL_PERMISSIONS.visitsManage,
      db: tx,
    });
    await assertLeadOpen(tx, lead, "a visit");
    const visit = await scheduleVisitInTx(tx, ctx, lead, values);
    return { id: visit.id, label: visitLabel(visit), isRevisit: visit.isRevisit };
  });
}

/** Loads an open visit whose lead the actor may manage visits for. */
async function loadOpenVisit(tx: TenantTx, ctx: ServiceContext, visitId: string) {
  const visit = await tx.siteVisit.findFirst({
    where: { id: visitId },
    include: { project: { select: { name: true } } },
  });
  if (!visit) throw new NotFoundError("Site visit", visitId);
  const lead = await findVisibleLead(ctx, visit.leadId, {
    permission: DEAL_PERMISSIONS.visitsManage,
    db: tx,
  });
  if (!OPEN.includes(visit.status)) {
    throw new ConflictError(`This visit is already ${statusLabel(visit.status)}.`);
  }
  return { visit, lead };
}

/** Claims an open visit for a new status; fails when someone else closed it meanwhile. */
async function claimVisit(
  tx: TenantTx,
  visitId: string,
  data: Prisma.SiteVisitUncheckedUpdateManyInput,
  from: readonly SiteVisitStatus[] = OPEN,
) {
  const { count } = await tx.siteVisit.updateMany({
    where: { id: visitId, status: { in: [...from] } },
    data,
  });
  if (count === 0)
    throw new ConflictError("This visit was updated meanwhile. Reload and try again.");
}

/** The customer confirmed they are coming. */
export async function confirmVisit(ctx: ServiceContext, input: { visitId: string }) {
  const { visitId } = parseInput(visitIdSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const { visit, lead } = await loadOpenVisit(tx, ctx, visitId);
    if (visit.status === "CONFIRMED") throw new ConflictError("This visit is confirmed already.");
    const now = new Date();
    await claimVisit(tx, visit.id, { status: "CONFIRMED", confirmedAt: now }, ["SCHEDULED"]);
    const label = visitLabel(visit);
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: DEAL_TYPES.VISIT_CONFIRMED,
      summary: `${label} to ${visit.project.name} confirmed by the customer`,
      payload: { visitId: visit.id, scheduledAt: visit.scheduledAt.toISOString() },
      occurredAt: now,
    });
    await recordAudit(tx, ctx, {
      action: "deals.visit.confirm",
      entityType: "SiteVisit",
      entityId: visit.id,
      summary: `${lead.number}: ${label.toLowerCase()} confirmed`,
    });
    await publishEvent(tx, ctx, "visit.confirmed", { visitId: visit.id, leadId: lead.id });
  });
}

/**
 * Records how the visit went (M08-04): outcome, the customer's feedback and who went with them. Sets the lead's
 * first-visit milestone and returns the next step the outcome suggests (revisit, follow-up, booking, close).
 */
export async function completeVisit(
  ctx: ServiceContext,
  input: CompleteVisitInput,
): Promise<{ nextStep: VisitNextStep | null; leadId: string }> {
  const values = parseInput(completeVisitSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const { visit, lead } = await loadOpenVisit(tx, ctx, values.visitId);
    const now = new Date();
    if (visit.scheduledAt.getTime() > now.getTime() + 12 * 3_600_000) {
      throw new ConflictError("This visit is planned for later. Move it to today first.");
    }
    const outcome = await tx.visitOutcome.findFirst({
      where: { id: values.outcomeId, isActive: true },
    });
    if (!outcome) {
      throw new ValidationError("Choose how the visit went.", { outcomeId: ["Unknown outcome"] });
    }
    const conductorId = values.conductedById ?? visit.assignedToId ?? ctx.actor.membershipId;
    const [conductor] = conductorId ? await findMembers(tx, { ids: [conductorId] }) : [];
    if (values.conductedById && !conductor) {
      throw new ValidationError("Choose who went with the customer.", {
        conductedById: ["Unknown member"],
      });
    }
    await claimVisit(tx, visit.id, {
      status: "COMPLETED",
      completedAt: now,
      outcomeId: outcome.id,
      feedback: values.feedback,
      conductedById: conductor?.membershipId ?? null,
      conductedByName: conductor?.name ?? ctx.actor.name,
    });
    await cancelVisitReminder(tx, ctx, visit.id);
    const visitedAt = visit.scheduledAt < now ? visit.scheduledAt : now;
    const milestones = await tx.lead.findFirstOrThrow({
      where: { id: lead.id },
      select: { firstVisitAt: true },
    });
    if (!milestones.firstVisitAt || milestones.firstVisitAt > visitedAt) {
      await setLeadMilestones(tx, lead.id, { firstVisitAt: visitedAt });
    }
    const label = visitLabel(visit);
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: DEAL_TYPES.VISIT_COMPLETED,
      summary: `${label} to ${visit.project.name} done · ${outcome.label}${
        values.feedback ? `: ${values.feedback}` : ""
      }`,
      payload: {
        visitId: visit.id,
        number: visit.number,
        isRevisit: visit.isRevisit,
        project: { id: visit.projectId, name: visit.project.name },
        outcome: { id: outcome.id, label: outcome.label, category: outcome.category },
        feedback: values.feedback,
        conductedBy: conductor?.name ?? ctx.actor.name,
      },
      occurredAt: now,
    });
    await recordAudit(tx, ctx, {
      action: "deals.visit.complete",
      entityType: "SiteVisit",
      entityId: visit.id,
      summary: `${lead.number}: ${label.toLowerCase()} done (${outcome.label})`,
    });
    await publishEvent(tx, ctx, "visit.completed", {
      visitId: visit.id,
      leadId: lead.id,
      projectId: visit.projectId,
      outcomeId: outcome.id,
      outcomeKey: outcome.key,
      conductedById: conductor?.membershipId ?? null,
      isRevisit: visit.isRevisit,
    });
    // A lead moved back by hand meanwhile moves forward again once the visit really happened.
    await advanceLeadStatus(
      tx,
      ctx,
      lead.id,
      visit.isRevisit ? "REVISIT" : "VISIT",
      `${label} to ${visit.project.name} done`,
    );
    return { nextStep: outcome.nextStep, leadId: lead.id };
  });
}

/** The customer did not come (M08-04). */
export async function markVisitNoShow(
  ctx: ServiceContext,
  input: { visitId: string; notes?: string | null },
) {
  const values = parseInput(noShowVisitSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const { visit, lead } = await loadOpenVisit(tx, ctx, values.visitId);
    const now = new Date();
    if (visit.scheduledAt > now) {
      throw new ConflictError("This visit has not started yet. Cancel or move it instead.");
    }
    await claimVisit(tx, visit.id, { status: "NO_SHOW", noShowAt: now, feedback: values.notes });
    await cancelVisitReminder(tx, ctx, visit.id);
    const label = visitLabel(visit);
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: DEAL_TYPES.VISIT_NO_SHOW,
      summary: `${label} to ${visit.project.name}: the customer did not come${
        values.notes ? ` — ${values.notes}` : ""
      }`,
      payload: {
        visitId: visit.id,
        scheduledAt: visit.scheduledAt.toISOString(),
        notes: values.notes,
      },
      occurredAt: now,
    });
    await recordAudit(tx, ctx, {
      action: "deals.visit.no_show",
      entityType: "SiteVisit",
      entityId: visit.id,
      summary: `${lead.number}: ${label.toLowerCase()} no-show`,
    });
    await publishEvent(tx, ctx, "visit.no_show", { visitId: visit.id, leadId: lead.id });
  });
}

/** Cancels an open visit inside `tx` (by a person, or because the lead was closed). */
export async function cancelVisitInTx(
  tx: TenantTx,
  ctx: ServiceContext,
  visit: SiteVisit & { project: { name: string } },
  leadId: string,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  await claimVisit(tx, visit.id, { status: "CANCELLED", cancelledAt: now, cancelReason: reason });
  await cancelVisitReminder(tx, ctx, visit.id);
  const label = visitLabel(visit);
  await recordLeadActivity(tx, ctx, {
    leadId,
    type: DEAL_TYPES.VISIT_CANCELLED,
    summary: `${label} to ${visit.project.name} cancelled: ${reason}`,
    payload: { visitId: visit.id, scheduledAt: visit.scheduledAt.toISOString(), reason },
    occurredAt: now,
  });
  await recordAudit(tx, ctx, {
    action: "deals.visit.cancel",
    entityType: "SiteVisit",
    entityId: visit.id,
    summary: `${label} cancelled (${reason})`,
  });
  await publishEvent(tx, ctx, "visit.cancelled", { visitId: visit.id, leadId, reason });
}

export async function cancelVisit(ctx: ServiceContext, input: { visitId: string; reason: string }) {
  const values = parseInput(cancelVisitSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const { visit, lead } = await loadOpenVisit(tx, ctx, values.visitId);
    await cancelVisitInTx(tx, ctx, visit, lead.id, values.reason);
  });
}

/** Moves a visit to a new time (M08-04); the old one stays as "rescheduled" and the new one points back to it. */
export async function rescheduleVisit(
  ctx: ServiceContext,
  input: RescheduleVisitInput,
): Promise<{ id: string }> {
  const values = parseInput(rescheduleVisitSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const { visit, lead } = await loadOpenVisit(tx, ctx, values.visitId);
    await claimVisit(tx, visit.id, { status: "RESCHEDULED" });
    await cancelVisitReminder(tx, ctx, visit.id);
    const regional = await getRegionalSettings(ctx);
    const next = await scheduleVisitInTx(
      tx,
      ctx,
      lead,
      {
        projectId: visit.projectId,
        scheduledAt: values.scheduledAt,
        pickupRequired: visit.pickupRequired,
        pickupAddress: visit.pickupAddress,
        attendees: visit.attendees,
        notes: values.notes ?? visit.notes,
      },
      { rescheduledFrom: visit, regional },
    );
    const label = visitLabel(visit);
    const summary = `${label} to ${visit.project.name} moved from ${formatDateTime(visit.scheduledAt, regional)} to ${formatDateTime(values.scheduledAt, regional)}`;
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: DEAL_TYPES.VISIT_RESCHEDULED,
      summary: `${summary}${values.notes ? `: ${values.notes}` : ""}`,
      payload: {
        visitId: next.id,
        previousId: visit.id,
        from: visit.scheduledAt.toISOString(),
        to: values.scheduledAt.toISOString(),
        notes: values.notes,
      },
    });
    await recordAudit(tx, ctx, {
      action: "deals.visit.reschedule",
      entityType: "SiteVisit",
      entityId: next.id,
      summary: `${lead.number}: ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`,
      metadata: { previousId: visit.id },
    });
    await publishEvent(tx, ctx, "visit.rescheduled", {
      visitId: visit.id,
      newVisitId: next.id,
      leadId: lead.id,
      scheduledAt: values.scheduledAt.toISOString(),
    });
    return { id: next.id };
  });
}

/** Cancels the lead's open visits inside `tx` — the lead was closed as lost, not interested or invalid. */
export async function cancelOpenVisitsOfLead(
  tx: TenantTx,
  ctx: ServiceContext,
  leadId: string,
  reason: string,
): Promise<number> {
  const open = await tx.siteVisit.findMany({
    where: { leadId, status: { in: OPEN } },
    include: { project: { select: { name: true } } },
  });
  const now = new Date();
  for (const visit of open) await cancelVisitInTx(tx, ctx, visit, leadId, reason, now);
  return open.length;
}

// --- Reassignment (M08-13) -----------------------------------------------------------------------------------------

/**
 * Upcoming visits follow the lead to its new owner (setting, on by default) and their reminders are re-targeted;
 * while the lead is unassigned they wait without an executive. Visits that already happened keep the executive who
 * went. `ctx` acts as the person who moved the lead, so the timeline shows who caused the transfer.
 */
export async function transferUpcomingVisits(
  ctx: ServiceContext,
  leadId: string,
  toMembershipId: string | null,
): Promise<number> {
  const settings = await getDealSettings(ctx.db, ctx);
  if (!settings.transferVisitsOnReassign) return 0;
  const regional = await getRegionalSettings(ctx);
  return ctx.db.$transaction(async (tx) => {
    const [lead] = await listLeadSummaries(tx, [leadId]);
    // A later change of owner wins: only transfer to whoever owns the lead now.
    if (!lead || lead.ownerId !== toMembershipId) return 0;
    const open = await tx.siteVisit.findMany({
      where: {
        leadId,
        status: { in: OPEN },
        ...(toMembershipId
          ? { OR: [{ assignedToId: null }, { assignedToId: { not: toMembershipId } }] }
          : { assignedToId: { not: null } }),
      },
      include: { project: { select: { name: true } } },
    });
    if (open.length === 0) return 0;
    await tx.siteVisit.updateMany({
      where: { id: { in: open.map((visit) => visit.id) } },
      data: { assignedToId: toMembershipId },
    });
    for (const visit of open) {
      await scheduleVisitReminder(
        tx,
        ctx,
        { ...visit, assignedToId: toMembershipId },
        { lead, projectName: visit.project.name, regional },
      );
    }
    const [member] = toMembershipId ? await findMembers(tx, { ids: [toMembershipId] }) : [];
    const what = plural(open.length, "upcoming visit");
    await recordLeadActivity(tx, ctx, {
      leadId,
      type: DEAL_TYPES.VISITS_TRANSFERRED,
      summary: member
        ? `${what} moved to ${member.name} with the lead`
        : `${what} wait for the lead's next owner`,
      payload: { visitIds: open.map((visit) => visit.id), to: toMembershipId },
      touch: false,
    });
    return open.length;
  });
}

// --- Lists (M08-06) --------------------------------------------------------------------------------------------------

export interface VisitRow {
  id: string;
  label: string;
  number: number;
  isRevisit: boolean;
  status: SiteVisitStatus;
  scheduledAt: string;
  project: { id: string; name: string; code: string };
  builder: { id: string; name: string };
  assignedToId: string | null;
  assignedToName: string | null;
  pickupRequired: boolean;
  pickupAddress: string | null;
  attendees: number | null;
  notes: string | null;
  createdByName: string;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  conductedByName: string | null;
  outcome: { id: string; label: string; category: string; nextStep: VisitNextStep | null } | null;
  feedback: string | null;
  noShowAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  rescheduledFromId: string | null;
  parentVisitId: string | null;
  lead: { id: string; number: string; name: string; mobile: string | null };
}

export const visitRowInclude = {
  project: { select: { id: true, name: true, code: true } },
  builder: { select: { id: true, name: true } },
  assignedTo: { select: { user: { select: { name: true } } } },
  outcome: { select: { id: true, label: true, category: true, nextStep: true } },
  lead: { select: { id: true, number: true, name: true, mobile: true } },
} satisfies Prisma.SiteVisitInclude;

type VisitRecord = Prisma.SiteVisitGetPayload<{ include: typeof visitRowInclude }>;

export function toVisitRow(record: VisitRecord): VisitRow {
  return {
    id: record.id,
    label: visitLabel(record),
    number: record.number,
    isRevisit: record.isRevisit,
    status: record.status,
    scheduledAt: record.scheduledAt.toISOString(),
    project: record.project,
    builder: record.builder,
    assignedToId: record.assignedToId,
    assignedToName: record.assignedTo?.user.name ?? null,
    pickupRequired: record.pickupRequired,
    pickupAddress: record.pickupAddress,
    attendees: record.attendees,
    notes: record.notes,
    createdByName: record.createdByName,
    createdAt: record.createdAt.toISOString(),
    confirmedAt: record.confirmedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    conductedByName: record.conductedByName,
    outcome: record.outcome,
    feedback: record.feedback,
    noShowAt: record.noShowAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancelReason: record.cancelReason,
    rescheduledFromId: record.rescheduledFromId,
    parentVisitId: record.parentVisitId,
    lead: record.lead,
  };
}

/** All visits of a lead: open ones first (soonest first), then the history (newest first). */
export async function listLeadVisits(ctx: ServiceContext, leadId: string): Promise<VisitRow[]> {
  ctx.permissions.assert(DEAL_PERMISSIONS.visitsView);
  await findVisibleLead(ctx, leadId);
  const records = await ctx.db.siteVisit.findMany({
    where: { leadId },
    include: visitRowInclude,
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const rows = records.map(toVisitRow);
  const open = rows
    .filter((row) => OPEN.includes(row.status))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return [...open, ...rows.filter((row) => !OPEN.includes(row.status))];
}
