import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toTableQuery } from "@/lib/table-query";
import { logCall } from "@/modules/activities/server/calls";
import { seedActivityMasters } from "@/modules/activities/server/masters";
import { assignLead } from "@/modules/assignment/server/assign";
import { seedAssignmentMasters } from "@/modules/assignment/server/reasons";
import { seedCatalogMasters } from "@/modules/catalog/server/masters";
import {
  cancelBooking,
  closeBooking,
  createBooking,
  getBooking,
  listBookings,
  listLeadBookings,
  moveBookingToStage,
  summarizeBookings,
  updateBooking,
} from "@/modules/deals/server/bookings";
import { markLeadLost } from "@/modules/deals/server/closure";
import { dealsDigestSection, visitsPendingOutcomeRule } from "@/modules/deals/server/insights";
import {
  deleteLossReason,
  listBookingStages,
  listLossReasons,
  listVisitOutcomes,
  saveLossReason,
  seedDealMasters,
} from "@/modules/deals/server/masters";
import { updateDealSettings } from "@/modules/deals/server/settings";
import {
  cancelVisit,
  completeVisit,
  confirmVisit,
  listLeadVisits,
  markVisitNoShow,
  rescheduleVisit,
  scheduleVisit,
} from "@/modules/deals/server/visits";
import { createLead, listLeads } from "@/modules/leads/server/leads";
import { seedLeadMasters } from "@/modules/leads/server/masters";
import { changeLeadStatus } from "@/modules/leads/server/status";
import { getServerRegistry } from "@/modules/registry.server";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { eventHandlerQueueName } from "@/platform/events/define";
import type { DomainEvent } from "@/platform/events/types";
import { stopBoss } from "@/platform/jobs/boss";
import { createSystemContext } from "@/platform/tenant/context";

import { contextFor, createMember, createOrganizationWithRoles } from "../support/identity";

const everything = toTableQuery({ page: 1, pageSize: 100, sort: "", q: "" }, { sortable: [] });
const HOUR = 3600 * 1000;
const future = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const past = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
const today = () => new Date().toISOString().slice(0, 10);

async function setup() {
  const org = await createOrganizationWithRoles();
  const orgId = org.organization.id;
  const db = createTenantDb(orgId);
  await seedCatalogMasters(db, orgId);
  await seedLeadMasters(db, orgId);
  await seedAssignmentMasters(db, orgId);
  await seedActivityMasters(db, orgId);
  await seedDealMasters(db, orgId);
  await seedDealMasters(db, orgId);
  const { role } = org;
  const admin = await createMember(orgId, role("admin").id, { name: "Asha Admin" });
  const manager = await createMember(orgId, role("manager").id, {
    name: "Meera Manager",
    reportsToId: admin.membership.id,
  });
  const exec1 = await createMember(orgId, role("executive").id, {
    name: "Esha Exec",
    reportsToId: manager.membership.id,
  });
  const exec2 = await createMember(orgId, role("executive").id, {
    name: "Ravi Exec",
    reportsToId: manager.membership.id,
  });
  const m = {
    admin: admin.membership.id,
    manager: manager.membership.id,
    exec1: exec1.membership.id,
    exec2: exec2.membership.id,
  };
  const ctx = {
    admin: await contextFor(m.admin),
    manager: await contextFor(m.manager),
    exec1: await contextFor(m.exec1),
    exec2: await contextFor(m.exec2),
  };
  const builder = await prisma.builder.create({
    data: { organizationId: orgId, code: "BLD-DEALS", name: "Skyline Developers" },
  });
  const project = await prisma.project.create({
    data: { organizationId: orgId, builderId: builder.id, code: "PRJ-HILL", name: "Hill View" },
  });
  const other = await prisma.project.create({
    data: { organizationId: orgId, builderId: builder.id, code: "PRJ-LAKE", name: "Lake Side" },
  });
  const outcomes = await prisma.visitOutcome.findMany({ where: { organizationId: orgId } });
  const outcome = (key: string) => outcomes.find((entry) => entry.key === key)!.id;
  const reasons = await prisma.lossReason.findMany({ where: { organizationId: orgId } });
  const reason = (key: string) => reasons.find((entry) => entry.key === key)!.id;
  const stages = await prisma.bookingStage.findMany({ where: { organizationId: orgId } });
  const stage = (key: string) => stages.find((entry) => entry.key === key)!.id;
  const callOutcomes = await prisma.callOutcome.findMany({ where: { organizationId: orgId } });
  const callOutcome = (key: string) => callOutcomes.find((entry) => entry.key === key)!.id;
  return { orgId, m, ctx, builder, project, other, outcome, reason, stage, callOutcome };
}

let phone = 9840000000;
const nextMobile = () => String((phone += 1));

const leadOf = (id: string) =>
  prisma.lead.findUniqueOrThrow({ where: { id }, include: { status: true } });

/** Runs the queued event handlers of one module for an organization (what the worker does). */
async function runHandlers(organizationId: string, prefix: string): Promise<number> {
  const handlers = new Map(
    getServerRegistry()
      .eventHandlers.filter((handler) => handler.name.startsWith(prefix))
      .map((handler) => [eventHandlerQueueName(handler.name), handler]),
  );
  const jobs = await prisma.$queryRawUnsafe<
    { id: string; name: string; data: { event: DomainEvent } }[]
  >(
    `SELECT id, name, data FROM pgboss.job
     WHERE name = ANY($1) AND state = 'created' AND data->'event'->>'organizationId' = $2
     ORDER BY created_on, id`,
    [...handlers.keys()],
    organizationId,
  );
  for (const job of jobs) {
    await handlers.get(job.name)!.handle(job.data.event, createSystemContext(organizationId));
    await prisma.$executeRawUnsafe(`DELETE FROM pgboss.job WHERE id = $1::uuid`, job.id);
  }
  return jobs.length;
}

describe("site visits, bookings & closures (M08)", () => {
  let env: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => {
    env = await setup();
  });

  afterAll(async () => {
    await stopBoss();
  });

  async function newLead(name: string, ctx = env.ctx.exec1) {
    return createLead(ctx, { name, mobile: nextMobile() });
  }

  it("seeds visit outcomes, loss reasons and booking stages once", async () => {
    expect((await listVisitOutcomes(env.ctx.exec1)).map((outcome) => outcome.label)).toEqual([
      "Liked it — wants to book",
      "Liked it — thinking it over",
      "Wants to come again with family",
      "Wants to see other options",
      "Found the price too high",
      "Did not like the project",
    ]);
    expect(await listLossReasons(env.ctx.exec1)).toHaveLength(9);
    expect(
      (await listLossReasons(env.ctx.exec1, { scope: "NOT_INTERESTED" })).map((r) => r.label),
    ).toContain("No real requirement");
    expect(
      (await listBookingStages(env.ctx.exec1)).map((stage) => [stage.label, stage.isActive]),
    ).toEqual([
      ["Booked", true],
      ["Agreement signed", true],
      ["Registration done", false],
    ]);
  });

  describe("visits and revisits", () => {
    it("plans a visit: status Visit, reminder, interest, timeline and event", async () => {
      const { id } = await newLead("Visiting Vani");
      const scheduledAt = future(30);
      const visit = await scheduleVisit(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        scheduledAt,
        pickupRequired: true,
        pickupAddress: "Andheri station",
        attendees: 3,
        notes: "Coming with parents",
      });
      expect(visit).toMatchObject({ label: "Visit 1", isRevisit: false });
      const lead = await leadOf(id);
      expect(lead.status.key).toBe("VISIT");
      const row = await prisma.siteVisit.findUniqueOrThrow({ where: { id: visit.id } });
      expect(row).toMatchObject({
        number: 1,
        isRevisit: false,
        status: "SCHEDULED",
        assignedToId: env.m.exec1,
        builderId: env.builder.id,
        pickupAddress: "Andheri station",
        attendees: 3,
      });
      const reminder = await prisma.scheduledReminder.findFirstOrThrow({
        where: { dedupeKey: `visit:${visit.id}` },
      });
      // Two hours before, by default.
      expect(reminder.recipientId).toBe(env.m.exec1);
      expect(reminder.fireAt.getTime()).toBe(new Date(scheduledAt).getTime() - 2 * HOUR);
      expect(
        await prisma.leadProjectInterest.count({
          where: { leadId: id, projectId: env.project.id },
        }),
      ).toBe(1);
      const entry = await prisma.leadActivity.findFirstOrThrow({
        where: { leadId: id, type: "VISIT_SCHEDULED" },
      });
      expect(entry.summary).toMatch(/^Visit 1 to Hill View planned for .* · pickup$/);
      expect(
        await prisma.outboxEvent.count({
          where: { organizationId: env.orgId, type: "visit.scheduled" },
        }),
      ).toBeGreaterThan(0);
      expect(
        await prisma.auditLog.count({
          where: { entityId: visit.id, action: "deals.visit.schedule" },
        }),
      ).toBe(1);
    });

    it("keeps visits to the people allowed to manage the lead", async () => {
      const { id } = await newLead("Private Pooja");
      await expect(
        scheduleVisit(env.ctx.exec2, {
          leadId: id,
          projectId: env.project.id,
          scheduledAt: future(5),
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      const byManager = await scheduleVisit(env.ctx.manager, {
        leadId: id,
        projectId: env.project.id,
        scheduledAt: future(5),
      });
      // Planned by the manager for the lead's owner, who is told about it.
      expect(
        (await prisma.siteVisit.findUniqueOrThrow({ where: { id: byManager.id } })).assignedToId,
      ).toBe(env.m.exec1);
      expect(
        await prisma.notification.count({
          where: { recipientId: env.m.exec1, type: "visit.assigned", entityId: byManager.id },
        }),
      ).toBe(1);
      await expect(
        scheduleVisit(env.ctx.exec1, {
          leadId: id,
          projectId: env.project.id,
          scheduledAt: past(24 * 40),
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("chains visit → revisit with numbering, reschedules, no-shows and cancellations", async () => {
      const { id } = await newLead("Returning Rohan");
      const first = await scheduleVisit(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        scheduledAt: past(3),
      });
      await confirmVisit(env.ctx.exec1, { visitId: first.id });
      await expect(confirmVisit(env.ctx.exec1, { visitId: first.id })).rejects.toBeInstanceOf(
        ConflictError,
      );
      const done = await completeVisit(env.ctx.exec1, {
        visitId: first.id,
        outcomeId: env.outcome("REVISIT_WITH_FAMILY"),
        feedback: "Liked the clubhouse; wants his wife to see it",
      });
      expect(done.nextStep).toBe("REVISIT");
      let lead = await leadOf(id);
      expect(lead.status.key).toBe("VISIT");
      expect(lead.firstVisitAt).not.toBeNull();
      const completed = await prisma.siteVisit.findUniqueOrThrow({ where: { id: first.id } });
      expect(completed).toMatchObject({ status: "COMPLETED", conductedByName: "Esha Exec" });
      // Recorded after it happened: nothing to remind about.
      expect(
        await prisma.scheduledReminder.findFirst({ where: { dedupeKey: `visit:${first.id}` } }),
      ).toBeNull();

      // The next visit is a revisit of the first one.
      const revisit = await scheduleVisit(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        scheduledAt: future(48),
      });
      expect(revisit).toMatchObject({ label: "Revisit 1", isRevisit: true });
      expect(
        (await prisma.siteVisit.findUniqueOrThrow({ where: { id: revisit.id } })).parentVisitId,
      ).toBe(first.id);
      lead = await leadOf(id);
      expect(lead.status.key).toBe("REVISIT");

      // Moving keeps the number; the old visit stays as "rescheduled".
      const moved = await rescheduleVisit(env.ctx.exec1, {
        visitId: revisit.id,
        scheduledAt: future(72),
        notes: "Sunday suits them better",
      });
      const [oldRow, newRow] = await Promise.all([
        prisma.siteVisit.findUniqueOrThrow({ where: { id: revisit.id } }),
        prisma.siteVisit.findUniqueOrThrow({ where: { id: moved.id } }),
      ]);
      expect(oldRow.status).toBe("RESCHEDULED");
      expect(newRow).toMatchObject({
        status: "SCHEDULED",
        number: 1,
        isRevisit: true,
        parentVisitId: first.id,
        rescheduledFromId: revisit.id,
      });
      await expect(markVisitNoShow(env.ctx.exec1, { visitId: moved.id })).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(
        await prisma.scheduledReminder.findFirstOrThrow({
          where: { dedupeKey: `visit:${moved.id}` },
        }),
      ).toMatchObject({ status: "SCHEDULED" });
      await cancelVisit(env.ctx.exec1, { visitId: moved.id, reason: "Family trip postponed" });
      expect(
        await prisma.scheduledReminder.findFirstOrThrow({
          where: { dedupeKey: `visit:${moved.id}` },
        }),
      ).toMatchObject({ status: "CANCELLED" });

      // A second revisit to another project, planned after it happened: no-show.
      const second = await scheduleVisit(env.ctx.exec1, {
        leadId: id,
        projectId: env.other.id,
        scheduledAt: past(2),
      });
      expect(second.label).toBe("Revisit 2");
      await markVisitNoShow(env.ctx.exec1, { visitId: second.id, notes: "Phone switched off" });

      const rows = await listLeadVisits(env.ctx.exec1, id);
      // Nothing open any more: the history, latest visit time first.
      expect(rows.map((row) => [row.label, row.status])).toEqual([
        ["Revisit 1", "CANCELLED"],
        ["Revisit 1", "RESCHEDULED"],
        ["Revisit 2", "NO_SHOW"],
        ["Visit 1", "COMPLETED"],
      ]);
      const types = (
        await prisma.leadActivity.findMany({
          where: { leadId: id, type: { startsWith: "VISIT_" } },
          orderBy: { occurredAt: "asc" },
        })
      ).map((entry) => entry.type);
      expect(types).toEqual([
        "VISIT_SCHEDULED",
        "VISIT_CONFIRMED",
        "VISIT_COMPLETED",
        "VISIT_SCHEDULED",
        "VISIT_RESCHEDULED",
        "VISIT_CANCELLED",
        "VISIT_SCHEDULED",
        "VISIT_NO_SHOW",
      ]);
    });

    it("never moves a booked lead back and refuses visits on closed leads", async () => {
      const { id } = await newLead("Booked Bina");
      await createBooking(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        customerName: "Bina Shah",
        bookingDate: today(),
      });
      await scheduleVisit(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        scheduledAt: future(10),
      });
      expect((await leadOf(id)).status.key).toBe("BOOKING");

      const closed = await newLead("Closed Chetan");
      await markLeadLost(env.ctx.exec1, {
        leadId: closed.id,
        statusKey: "LOST",
        lossReasonId: env.reason("BUDGET"),
        notes: "Went for a resale flat",
      });
      await expect(
        scheduleVisit(env.ctx.exec1, {
          leadId: closed.id,
          projectId: env.project.id,
          scheduledAt: future(10),
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("moves upcoming visits with a reassigned lead (setting), not the ones that happened", async () => {
      const { id } = await newLead("Handed Hema");
      const happened = await scheduleVisit(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        scheduledAt: past(2),
      });
      await completeVisit(env.ctx.exec1, {
        visitId: happened.id,
        outcomeId: env.outcome("THINKING"),
      });
      const upcoming = await scheduleVisit(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        scheduledAt: future(20),
      });
      await assignLead(env.ctx.manager, {
        leadId: id,
        assigneeId: env.m.exec2,
        expectedOwnerId: env.m.exec1,
        reason: "Esha is on leave",
      });
      expect(await runHandlers(env.orgId, "deals.")).toBeGreaterThan(0);
      const [old, next] = await Promise.all([
        prisma.siteVisit.findUniqueOrThrow({ where: { id: happened.id } }),
        prisma.siteVisit.findUniqueOrThrow({ where: { id: upcoming.id } }),
      ]);
      expect(old.assignedToId).toBe(env.m.exec1);
      expect(next.assignedToId).toBe(env.m.exec2);
      expect(
        await prisma.scheduledReminder.findFirstOrThrow({
          where: { dedupeKey: `visit:${upcoming.id}` },
        }),
      ).toMatchObject({ recipientId: env.m.exec2, status: "SCHEDULED" });
      expect(
        await prisma.leadActivity.findFirstOrThrow({
          where: { leadId: id, type: "VISITS_TRANSFERRED" },
        }),
      ).toMatchObject({
        summary: "1 upcoming visit moved to Ravi Exec with the lead",
        actorName: "Meera Manager",
      });

      await updateDealSettings(env.ctx.admin, { transferVisitsOnReassign: false });
      await assignLead(env.ctx.manager, {
        leadId: id,
        assigneeId: env.m.exec1,
        expectedOwnerId: env.m.exec2,
        reason: "Esha is back",
      });
      await runHandlers(env.orgId, "deals.");
      expect(
        (await prisma.siteVisit.findUniqueOrThrow({ where: { id: upcoming.id } })).assignedToId,
      ).toBe(env.m.exec2);
      await updateDealSettings(env.ctx.admin, { transferVisitsOnReassign: true });
    });
  });

  describe("bookings", () => {
    it("converts a lead to a booking and keeps its values to the people allowed", async () => {
      const { id } = await newLead("Buyer Bhavna");
      await expect(
        createBooking(env.ctx.exec1, {
          leadId: id,
          projectId: env.project.id,
          customerName: "Bhavna Rao",
          bookingDate: today(),
          agreementValue: "85 L",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const created = await createBooking(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        customerName: "Bhavna Rao",
        coApplicantName: "Kiran Rao",
        tower: "B",
        unitNumber: "1203",
        floor: "12",
        area: "742.5",
        bookingDate: today(),
        paymentPlan: "Construction linked",
      });
      expect(created.number).toMatch(/^BK-\d{6}$/);
      const lead = await leadOf(id);
      expect(lead.status.key).toBe("BOOKING");
      expect(lead.bookedAt).not.toBeNull();
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: created.id },
        include: { stage: true },
      });
      expect(booking).toMatchObject({
        status: "ACTIVE",
        executiveId: env.m.exec1,
        managerId: env.m.manager,
        builderId: env.builder.id,
      });
      expect(booking.stage?.label).toBe("Booked");
      expect(
        await prisma.notification.count({
          where: { type: "booking.update", entityId: created.id },
        }),
      ).toBe(2); // Esha's manager and the admin (who sees all bookings); not Esha herself.

      // Values: the admin enters them; executives and managers see neither the values nor their changes.
      await updateBooking(env.ctx.admin, {
        bookingId: created.id,
        projectId: env.project.id,
        customerName: "Bhavna Rao",
        coApplicantName: "Kiran Rao",
        tower: "B",
        unitNumber: "1203",
        floor: "12",
        area: "742.5",
        bookingDate: today(),
        paymentPlan: "Construction linked",
        agreementValue: "1.2 Cr",
        tokenAmount: "5,00,000",
        note: "Values from the builder's booking form",
      });
      const asAdmin = await getBooking(env.ctx.admin, created.id);
      expect(asAdmin).toMatchObject({
        agreementValue: "12000000",
        tokenAmount: "500000",
        valuesHidden: false,
      });
      const asExec = await getBooking(env.ctx.exec1, created.id);
      expect(asExec).toMatchObject({ agreementValue: null, tokenAmount: null, valuesHidden: true });
      const valueChange = asExec.history.find((entry) => entry.type === "UPDATED")!;
      expect(valueChange.changes.every((change) => change.hidden && change.to === null)).toBe(true);
      expect((await getBooking(env.ctx.manager, created.id)).valuesHidden).toBe(true);
      await expect(getBooking(env.ctx.exec2, created.id)).rejects.toBeInstanceOf(NotFoundError);

      // Details: the executive edits, the history keeps every change.
      const edit = await updateBooking(env.ctx.exec1, {
        bookingId: created.id,
        projectId: env.project.id,
        customerName: "Bhavna Rao",
        coApplicantName: "Kiran Rao",
        tower: "C",
        unitNumber: "1504",
        floor: "15",
        area: "742.5",
        bookingDate: today(),
        paymentPlan: "Construction linked",
        note: "Unit changed at the builder's office",
      });
      expect(edit.changed).toEqual(["unit", "tower", "floor"]);
      const detail = await getBooking(env.ctx.exec1, created.id);
      expect(detail.history.map((entry) => entry.type)).toEqual(["UPDATED", "UPDATED", "CREATED"]);
      expect(detail.history[0]!.changes.find((change) => change.field === "tower")).toMatchObject({
        from: "B",
        to: "C",
        hidden: false,
      });
      expect(
        await prisma.auditLog.count({
          where: { entityId: created.id, action: "deals.booking.update" },
        }),
      ).toBe(2);
    });

    it("moves through the stages to Closed/Won with the history and milestones", async () => {
      const { id } = await newLead("Closing Chitra");
      const visit = await scheduleVisit(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        scheduledAt: past(4),
      });
      await completeVisit(env.ctx.exec1, {
        visitId: visit.id,
        outcomeId: env.outcome("WANTS_TO_BOOK"),
      });
      const { id: bookingId } = await createBooking(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        visitId: visit.id,
        customerName: "Chitra Iyer",
        bookingDate: today(),
      });
      await moveBookingToStage(env.ctx.exec1, {
        bookingId,
        stageId: env.stage("AGREEMENT"),
        note: "Agreement signed at the builder's office",
      });
      await expect(
        moveBookingToStage(env.ctx.exec1, { bookingId, stageId: env.stage("REGISTRATION") }),
      ).rejects.toBeInstanceOf(ValidationError); // inactive stage
      await expect(closeBooking(env.ctx.exec1, { bookingId })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await closeBooking(env.ctx.manager, { bookingId, note: "Registration done" });
      await expect(closeBooking(env.ctx.manager, { bookingId })).rejects.toBeInstanceOf(
        ConflictError,
      );

      const lead = await leadOf(id);
      expect(lead.status.key).toBe("CLOSED_WON");
      expect(lead.closedAt).not.toBeNull();
      expect(lead.firstVisitAt).not.toBeNull();
      expect(lead.bookedAt).not.toBeNull();
      expect(lead.lostAt).toBeNull();
      const history = (await getBooking(env.ctx.exec1, bookingId)).history;
      expect(history.map((entry) => [entry.type, entry.fromStage, entry.toStage])).toEqual([
        ["CLOSED", "Agreement signed", null],
        ["STAGE_CHANGED", "Booked", "Agreement signed"],
        ["CREATED", null, "Booked"],
      ]);
      const timeline = (
        await prisma.leadActivity.findMany({
          where: { leadId: id },
          orderBy: { occurredAt: "asc" },
        })
      ).map((entry) => entry.type);
      expect(timeline).toEqual(
        expect.arrayContaining([
          "VISIT_SCHEDULED",
          "VISIT_COMPLETED",
          "BOOKING_CREATED",
          "BOOKING_STAGE_CHANGED",
          "BOOKING_CLOSED",
        ]),
      );
      const statuses = await prisma.leadStatusHistory.findMany({
        where: { leadId: id },
        orderBy: { changedAt: "asc" },
      });
      const keys = await prisma.leadStatus.findMany({
        where: { id: { in: statuses.map((row) => row.toStatusId) } },
      });
      expect(
        statuses.map((row) => keys.find((status) => status.id === row.toStatusId)!.key),
      ).toEqual(["NEW", "ASSIGNED", "VISIT", "BOOKING", "CLOSED_WON"]);
      expect(
        await prisma.notification.count({ where: { type: "booking.update", entityId: bookingId } }),
      ).toBe(4); // created → manager + admin; closed by the manager → Esha + admin.
    });

    it("cancels a booking: the lead is lost with the reason, or goes back to work", async () => {
      const lost = await newLead("Cancelling Kabir");
      const first = await createBooking(env.ctx.exec1, {
        leadId: lost.id,
        projectId: env.project.id,
        customerName: "Kabir Das",
        bookingDate: today(),
      });
      await expect(
        cancelBooking(env.ctx.manager, {
          bookingId: first.id,
          reasonId: env.reason("LOCATION"), // not a cancellation reason
          leadOutcome: "LOST",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      const result = await cancelBooking(env.ctx.manager, {
        bookingId: first.id,
        reasonId: env.reason("LOAN"),
        notes: "Bank rejected the loan",
        leadOutcome: "LOST",
      });
      expect(result).toEqual({ leadOutcome: "LOST", leadStatus: "Lost" });
      let lead = await leadOf(lost.id);
      expect(lead.status.key).toBe("LOST");
      expect(lead.lossReasonId).toBe(env.reason("LOAN"));
      expect(lead.lostAt).not.toBeNull();
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
        "CANCELLED",
      );

      // Back to work: the status before the booking.
      const retry = await newLead("Retrying Ritu");
      await scheduleVisit(env.ctx.exec1, {
        leadId: retry.id,
        projectId: env.project.id,
        scheduledAt: future(3),
      });
      const booking = await createBooking(env.ctx.exec1, {
        leadId: retry.id,
        projectId: env.project.id,
        customerName: "Ritu Jain",
        bookingDate: today(),
      });
      const back = await cancelBooking(env.ctx.manager, {
        bookingId: booking.id,
        reasonId: env.reason("PLAN_DROPPED"),
        leadOutcome: "ACTIVE",
      });
      expect(back).toEqual({ leadOutcome: "ACTIVE", leadStatus: "Visit" });
      lead = await leadOf(retry.id);
      expect(lead.status.key).toBe("VISIT");
      expect(lead.lossReasonId).toBeNull();

      // Another booking still open: the lead stays booked.
      const twin = await newLead("Two Units Tara");
      const unitA = await createBooking(env.ctx.exec1, {
        leadId: twin.id,
        projectId: env.project.id,
        customerName: "Tara Sen",
        bookingDate: today(),
      });
      await createBooking(env.ctx.exec1, {
        leadId: twin.id,
        projectId: env.other.id,
        customerName: "Tara Sen",
        bookingDate: today(),
      });
      expect(
        await cancelBooking(env.ctx.manager, {
          bookingId: unitA.id,
          reasonId: env.reason("BUDGET"),
          leadOutcome: "LOST",
        }),
      ).toEqual({ leadOutcome: "UNCHANGED", leadStatus: null });
      expect((await leadOf(twin.id)).status.key).toBe("BOOKING");
      expect(await listLeadBookings(env.ctx.exec1, twin.id)).toHaveLength(2);
    });

    it("lists bookings by scope and filters, with totals only for value viewers", async () => {
      const { rows } = await listBookings(env.ctx.exec2, everything, {});
      expect(rows).toHaveLength(0);
      const mine = await listBookings(env.ctx.exec1, everything, { status: "ACTIVE" });
      expect(mine.rows.length).toBeGreaterThan(0);
      expect(mine.rows.every((row) => row.status === "ACTIVE" && row.valuesHidden)).toBe(true);
      const team = await listBookings(env.ctx.manager, everything, {
        managerId: env.m.manager,
        projectId: env.other.id,
      });
      expect(team.rows.map((row) => row.project.name)).toEqual(["Lake Side"]);
      const summary = await summarizeBookings(env.ctx.admin, {});
      expect(summary.byStatus.CLOSED_WON).toBe(1);
      expect(summary.values?.agreementValue).toBe("12000000");
      expect((await summarizeBookings(env.ctx.manager, {})).values).toBeNull();
    });
  });

  describe("lost and not interested", () => {
    it("needs a reason that fits, a note and the permission, and cancels upcoming visits", async () => {
      const { id } = await newLead("Leaving Lata");
      const visit = await scheduleVisit(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        scheduledAt: future(30),
      });
      const status = await prisma.leadStatus.findFirstOrThrow({
        where: { organizationId: env.orgId, key: "NOT_INTERESTED" },
      });
      // The status dialog: a loss reason is required, and it must apply to "Not interested".
      await expect(
        changeLeadStatus(env.ctx.exec1, id, { statusId: status.id, reason: "Changed her mind" }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        changeLeadStatus(env.ctx.exec1, id, {
          statusId: status.id,
          reason: "Changed her mind",
          details: { lossReasonId: env.reason("NOT_REACHABLE") },
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await changeLeadStatus(env.ctx.exec1, id, {
        statusId: status.id,
        reason: "Changed her mind",
        details: { lossReasonId: env.reason("NO_REQUIREMENT") },
      });
      const lead = await leadOf(id);
      expect(lead.status.key).toBe("NOT_INTERESTED");
      expect(lead.lossReasonId).toBe(env.reason("NO_REQUIREMENT"));
      expect(lead.lostAt).not.toBeNull();
      expect((await prisma.siteVisit.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe(
        "CANCELLED",
      );
      const entry = await prisma.leadActivity.findFirstOrThrow({
        where: { leadId: id, type: "STATUS_CHANGED" },
        orderBy: { occurredAt: "desc" },
      });
      expect(entry.summary).toBe(
        "Changed status: Visit → Not Interested · Loss reason: No real requirement",
      );
      expect(
        await prisma.outboxEvent.count({
          where: { organizationId: env.orgId, type: "lead.not_interested" },
        }),
      ).toBeGreaterThan(0);

      // Reopening clears the loss.
      const positive = await prisma.leadStatus.findFirstOrThrow({
        where: { organizationId: env.orgId, key: "POSITIVE" },
      });
      await expect(
        changeLeadStatus(env.ctx.exec1, id, { statusId: positive.id }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await changeLeadStatus(env.ctx.manager, id, { statusId: positive.id, reason: "Called back" });
      const reopened = await leadOf(id);
      expect(reopened).toMatchObject({ lossReasonId: null, lostAt: null, closedAt: null });
    });

    it("marks a lead lost from its dialog, and not while a booking is open", async () => {
      const { id } = await newLead("Lost Lalit");
      await expect(
        markLeadLost(env.ctx.exec1, {
          leadId: id,
          statusKey: "LOST",
          lossReasonId: env.reason("BUDGET"),
          notes: "",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        markLeadLost(env.ctx.exec2, {
          leadId: id,
          statusKey: "LOST",
          lossReasonId: env.reason("BUDGET"),
          notes: "Too costly",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(
        await markLeadLost(env.ctx.exec1, {
          leadId: id,
          statusKey: "LOST",
          lossReasonId: env.reason("BOUGHT_ELSEWHERE"),
          notes: "Bought through another broker",
        }),
      ).toEqual({ status: "Lost" });

      const booked = await newLead("Booked Bala");
      await createBooking(env.ctx.exec1, {
        leadId: booked.id,
        projectId: env.project.id,
        customerName: "Bala K",
        bookingDate: today(),
      });
      await expect(
        markLeadLost(env.ctx.exec1, {
          leadId: booked.id,
          statusKey: "LOST",
          lossReasonId: env.reason("BUDGET"),
          notes: "Backed out",
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("asks for the loss reason in the call dialog, and automation never closes a lead without one", async () => {
      const { id } = await newLead("Caller Kiran");
      await expect(
        logCall(env.ctx.exec1, {
          leadId: id,
          outcomeId: env.callOutcome("NOT_INTERESTED"),
          statusKey: "NOT_INTERESTED",
          statusReason: "Not looking any more",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      const logged = await logCall(env.ctx.exec1, {
        leadId: id,
        outcomeId: env.callOutcome("NOT_INTERESTED"),
        statusKey: "NOT_INTERESTED",
        statusReason: "Not looking any more",
        statusDetails: { lossReasonId: env.reason("PLAN_DROPPED") },
      });
      expect(logged.status).toEqual({ from: "Assigned", to: "Not Interested" });
      expect((await leadOf(id)).lossReasonId).toBe(env.reason("PLAN_DROPPED"));

      // A call reported by a dialer (no person): the suggestion cannot close the lead without a reason.
      const other = await newLead("Dialer Deepa");
      const system = createSystemContext(env.orgId);
      const auto = await logCall(system, {
        leadId: other.id,
        outcomeId: env.callOutcome("NOT_INTERESTED"),
      });
      expect(auto.status).toBeNull();
      expect((await leadOf(other.id)).status.key).toBe("ASSIGNED");
    });

    it("keeps used loss reasons (deactivate instead)", async () => {
      await expect(deleteLossReason(env.ctx.admin, env.reason("BUDGET"))).rejects.toBeInstanceOf(
        ConflictError,
      );
      const { id } = await saveLossReason(env.ctx.admin, null, {
        label: "Legal issues",
        appliesTo: ["LOST", "BOOKING_CANCELLED"],
      });
      await expect(
        saveLossReason(env.ctx.admin, null, { label: "legal issues", appliesTo: ["LOST"] }),
      ).rejects.toBeInstanceOf(ValidationError);
      await deleteLossReason(env.ctx.admin, id);
      await expect(
        saveLossReason(env.ctx.exec1, null, { label: "Other thing", appliesTo: ["LOST"] }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("lists, filters and alerts", () => {
    it("filters leads by visits, revisits, bookings, closure and loss reason", async () => {
      const names = async (extra: Record<string, string>) =>
        (
          await listLeads(env.ctx.manager, everything, {
            view: "team",
            extra,
            timezone: "Asia/Kolkata",
          })
        ).rows.map((row) => row.name);
      const revisited = await names({ revisit: "yes" });
      expect(revisited).toEqual(expect.arrayContaining(["Returning Rohan", "Handed Hema"]));
      expect(revisited).not.toContain("Visiting Vani");
      expect(await names({ closure: "won" })).toEqual(["Closing Chitra"]);
      expect(await names({ closure: "not-interested" })).toEqual(
        expect.arrayContaining(["Caller Kiran"]),
      );
      expect(await names({ lossReason: env.reason("LOAN") })).toEqual(["Cancelling Kabir"]);
      expect(await names({ booking: "cancelled", closure: "open" })).toEqual(
        expect.arrayContaining(["Retrying Ritu", "Two Units Tara"]),
      );
      expect(await names({ visit: "upcoming" })).toEqual(
        expect.arrayContaining(["Visiting Vani", "Handed Hema"]),
      );
      expect(await names({ visit: "visited", booking: "none" })).toEqual(
        expect.arrayContaining(["Returning Rohan"]),
      );
    });

    it("reminds executives and managers about visits without an outcome", async () => {
      const { id } = await newLead("Forgotten Farah");
      const visit = await scheduleVisit(env.ctx.exec1, {
        leadId: id,
        projectId: env.project.id,
        scheduledAt: past(6),
      });
      const alerts = await visitsPendingOutcomeRule.evaluate(
        createSystemContext(env.orgId),
        new Date(),
      );
      expect(alerts.find((alert) => alert.dedupeKey === `visit:${visit.id}`)).toMatchObject({
        recipientId: env.m.exec1,
        type: "visit.outcome_pending",
      });
      expect(alerts.find((alert) => alert.recipientId === env.m.manager)?.type).toBe(
        "team.visits_pending_outcome",
      );

      const block = await dealsDigestSection.build(env.ctx.manager, new Date());
      expect(
        block?.lines.find((line) => line.label === "Visits waiting for their outcome")?.value,
      ).toBeGreaterThan(0);
      expect(await dealsDigestSection.build(env.ctx.exec2, new Date())).not.toBeNull();
    });
  });
});
