import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toTableQuery } from "@/lib/table-query";
import {
  getMyAgenda,
  getTeamFollowUpBoard,
  listTeamFollowUps,
} from "@/modules/activities/server/agenda";
import { listCalls, listLeadCalls, logCall } from "@/modules/activities/server/calls";
import {
  cancelFollowUp,
  completeFollowUp,
  detectMissedFollowUps,
  listLeadFollowUps,
  rescheduleFollowUp,
  scheduleFollowUp,
} from "@/modules/activities/server/follow-ups";
import { followUpsDigestSection, overdueFollowUpsRule } from "@/modules/activities/server/insights";
import {
  listCallOutcomes,
  listFollowUpPurposes,
  seedActivityMasters,
} from "@/modules/activities/server/masters";
import {
  attachCallRecording,
  getCallRecordingUrl,
  requestCallRecordingUpload,
} from "@/modules/activities/server/recordings";
import { updateActivitySettings } from "@/modules/activities/server/settings";
import { assignLead } from "@/modules/assignment/server/assign";
import { seedAssignmentMasters } from "@/modules/assignment/server/reasons";
import { seedCatalogMasters } from "@/modules/catalog/server/masters";
import { createLead, listLeads } from "@/modules/leads/server/leads";
import { seedLeadMasters } from "@/modules/leads/server/masters";
import { getServerRegistry } from "@/modules/registry.server";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { eventHandlerQueueName } from "@/platform/events/define";
import type { DomainEvent } from "@/platform/events/types";
import { stopBoss } from "@/platform/jobs/boss";
import { getStorage } from "@/platform/storage";
import { createSystemContext } from "@/platform/tenant/context";

import { contextFor, createMember, createOrganizationWithRoles } from "../support/identity";

const everything = toTableQuery({ page: 1, pageSize: 100, sort: "", q: "" }, { sortable: [] });
const HOUR = 3600 * 1000;

async function setup() {
  const org = await createOrganizationWithRoles();
  const orgId = org.organization.id;
  const db = createTenantDb(orgId);
  await seedCatalogMasters(db, orgId);
  await seedLeadMasters(db, orgId);
  await seedAssignmentMasters(db, orgId);
  await seedActivityMasters(db, orgId);
  await seedActivityMasters(db, orgId);
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
    system: createSystemContext(orgId),
  };
  const outcomes = await prisma.callOutcome.findMany({ where: { organizationId: orgId } });
  const outcome = (key: string) => outcomes.find((entry) => entry.key === key)!.id;
  return { orgId, m, ctx, outcome };
}

let phone = 9830000000;
const nextMobile = () => String((phone += 1));
const future = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

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

describe("calls, follow-ups & callbacks (M07)", () => {
  let env: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => {
    env = await setup();
  });

  afterAll(async () => {
    await stopBoss();
  });

  it("seeds call outcomes and follow-up purposes once", async () => {
    const outcomes = await listCallOutcomes(env.ctx.exec1, { activeOnly: true });
    expect(outcomes.map((outcome) => outcome.label)).toEqual([
      "Interested",
      "Positive discussion",
      "Callback requested",
      "Spoke, no decision yet",
      "Negative response",
      "Not interested",
      "No answer",
      "Busy",
      "Switched off",
      "Not reachable",
      "Wrong number",
    ]);
    expect(await listFollowUpPurposes(env.ctx.exec1)).toHaveLength(6);
  });

  describe("logging calls", () => {
    it("counts unanswered calls and suggests Unresponsive after the threshold", async () => {
      const { id } = await createLead(env.ctx.exec1, { name: "Silent Sam", mobile: nextMobile() });
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const result = await logCall(env.ctx.exec1, {
          leadId: id,
          outcomeId: env.outcome("NO_ANSWER"),
        });
        expect(result.status).toBeNull();
      }
      let lead = await leadOf(id);
      expect(lead).toMatchObject({ callAttempts: 2, lastContactedAt: null });
      expect(lead.status.key).toBe("ASSIGNED");
      const third = await logCall(env.ctx.exec1, { leadId: id, outcomeId: env.outcome("BUSY") });
      expect(third.status).toEqual({ from: "Assigned", to: "Unresponsive" });
      lead = await leadOf(id);
      expect(lead.callAttempts).toBe(3);
      expect(lead.lastCallOutcomeId).toBe(env.outcome("BUSY"));
      expect(lead.lastCallAt).not.toBeNull();

      await expect(
        logCall(env.ctx.exec2, { leadId: id, outcomeId: env.outcome("NO_ANSWER") }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("logs a reached call, its status and the next step in one go", async () => {
      const { id } = await createLead(env.ctx.exec1, { name: "Keen Kavya", mobile: nextMobile() });
      // "Interested" needs a next step while the lead stays open — nothing is saved without it.
      await expect(
        logCall(env.ctx.exec1, { leadId: id, outcomeId: env.outcome("INTERESTED") }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(await prisma.callLog.count({ where: { leadId: id } })).toBe(0);

      const dueAt = future(26);
      const result = await logCall(env.ctx.exec1, {
        leadId: id,
        direction: "OUTBOUND",
        durationSeconds: 245,
        outcomeId: env.outcome("INTERESTED"),
        notes: "Wants a 3 BHK near the metro",
        statusKey: "POSITIVE",
        next: { type: "FOLLOW_UP", dueAt, notes: "Send the brochure" },
      });
      expect(result.status).toEqual({ from: "Assigned", to: "Positive" });
      const lead = await leadOf(id);
      expect(lead.status.key).toBe("POSITIVE");
      expect(lead.callAttempts).toBe(0);
      expect(lead.lastContactedAt).not.toBeNull();
      expect(lead.nextFollowUpAt?.toISOString()).toBe(new Date(dueAt).toISOString());

      const followUp = await prisma.followUp.findUniqueOrThrow({
        where: { id: result.nextFollowUpId! },
      });
      expect(followUp).toMatchObject({
        type: "FOLLOW_UP",
        status: "SCHEDULED",
        assignedToId: env.m.exec1,
        sourceCallId: result.id,
      });
      const reminder = await prisma.scheduledReminder.findFirstOrThrow({
        where: { dedupeKey: `followup:${followUp.id}` },
      });
      expect(reminder).toMatchObject({ recipientId: env.m.exec1, status: "SCHEDULED" });
      // 15 minutes before by default.
      expect(new Date(dueAt).getTime() - reminder.fireAt.getTime()).toBe(15 * 60_000);

      const timeline = await prisma.leadActivity.findMany({
        where: { leadId: id },
        orderBy: { occurredAt: "asc" },
      });
      expect(timeline.map((entry) => entry.type)).toEqual(
        expect.arrayContaining(["CALL_LOGGED", "STATUS_CHANGED", "FOLLOW_UP_SCHEDULED"]),
      );
      expect(timeline.find((entry) => entry.type === "CALL_LOGGED")!.summary).toBe(
        "Outgoing call · Interested · 4 min 05 s: Wants a 3 BHK near the metro",
      );
      const calls = await listLeadCalls(env.ctx.manager, id);
      expect(calls).toMatchObject([
        { callerName: "Esha Exec", connected: true, durationSeconds: 245 },
      ]);
      expect(
        await prisma.outboxEvent.count({
          where: { type: "call.logged", payload: { path: ["leadId"], equals: id } },
        }),
      ).toBe(1);
    });

    it("keeps the status when asked and refuses workflow statuses picked by hand", async () => {
      const { id } = await createLead(env.ctx.exec1, { name: "Calm Chetan", mobile: nextMobile() });
      await logCall(env.ctx.exec1, {
        leadId: id,
        outcomeId: env.outcome("SPOKE"),
        statusKey: null,
        next: { type: "CALLBACK", dueAt: future(3) },
      });
      expect((await leadOf(id)).status.key).toBe("ASSIGNED");
      await expect(
        logCall(env.ctx.exec1, {
          leadId: id,
          outcomeId: env.outcome("POSITIVE"),
          statusKey: "BOOKING",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(await prisma.callLog.count({ where: { leadId: id } })).toBe(1);
    });

    it("completes the follow-up a call took care of and schedules the next", async () => {
      const { id } = await createLead(env.ctx.exec1, { name: "Busy Bina", mobile: nextMobile() });
      const first = await scheduleFollowUp(env.ctx.exec1, { leadId: id, dueAt: future(1) });
      const result = await logCall(env.ctx.exec1, {
        leadId: id,
        outcomeId: env.outcome("CALLBACK"),
        completeFollowUpId: first.id,
        next: { type: "CALLBACK", dueAt: future(30), notes: "After her meeting" },
      });
      expect(result.completedFollowUpId).toBe(first.id);
      expect(result.status).toEqual({ from: "Assigned", to: "Callback" });
      const done = await prisma.followUp.findUniqueOrThrow({ where: { id: first.id } });
      expect(done).toMatchObject({ status: "COMPLETED", completedCallId: result.id });
      expect(
        await prisma.scheduledReminder.findFirstOrThrow({
          where: { dedupeKey: `followup:${first.id}` },
        }),
      ).toMatchObject({ status: "CANCELLED" });
      const rows = await listLeadFollowUps(env.ctx.exec1, id);
      expect(rows.map((row) => [row.type, row.status])).toEqual([
        ["CALLBACK", "SCHEDULED"],
        ["FOLLOW_UP", "COMPLETED"],
      ]);
    });
  });

  describe("follow-ups", () => {
    it("schedules only in the future and tells the owner when someone else schedules", async () => {
      const { id } = await createLead(env.ctx.exec1, {
        name: "Planned Priya",
        mobile: nextMobile(),
      });
      await expect(
        scheduleFollowUp(env.ctx.exec1, {
          leadId: id,
          dueAt: new Date(Date.now() - 3 * HOUR).toISOString(),
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      const purposes = await listFollowUpPurposes(env.ctx.manager, { activeOnly: true });
      const scheduled = await scheduleFollowUp(env.ctx.manager, {
        leadId: id,
        type: "CALLBACK",
        dueAt: future(5),
        purposeId: purposes[0]!.id,
      });
      const followUp = await prisma.followUp.findUniqueOrThrow({ where: { id: scheduled.id } });
      expect(followUp.assignedToId).toBe(env.m.exec1);
      const told = await prisma.notification.findFirstOrThrow({
        where: { recipientId: env.m.exec1, type: "followup.assigned", entityId: scheduled.id },
      });
      expect(told.title).toMatch(/^Callback for LD-\d+ · Planned Priya on /);
      expect(told.actorName).toBe("Meera Manager");
    });

    it("reschedules with a history chain and cancels with a reason", async () => {
      const { id } = await createLead(env.ctx.exec1, { name: "Moving Manu", mobile: nextMobile() });
      const first = await scheduleFollowUp(env.ctx.exec1, { leadId: id, dueAt: future(2) });
      const moved = await rescheduleFollowUp(env.ctx.exec1, {
        followUpId: first.id,
        dueAt: future(50),
        notes: "Customer travelling",
      });
      const [next, old] = await Promise.all([
        prisma.followUp.findUniqueOrThrow({ where: { id: moved.id } }),
        prisma.followUp.findUniqueOrThrow({ where: { id: first.id } }),
      ]);
      expect(old.status).toBe("RESCHEDULED");
      expect(next).toMatchObject({
        status: "SCHEDULED",
        rescheduledFromId: first.id,
        notes: "Customer travelling",
      });
      await expect(
        rescheduleFollowUp(env.ctx.exec1, { followUpId: first.id, dueAt: future(60) }),
      ).rejects.toThrow(/already rescheduled/);
      expect((await leadOf(id)).nextFollowUpAt?.getTime()).toBe(next.dueAt.getTime());

      await expect(
        cancelFollowUp(env.ctx.exec1, { followUpId: moved.id, reason: "" }),
      ).rejects.toBeInstanceOf(ValidationError);
      await cancelFollowUp(env.ctx.exec1, { followUpId: moved.id, reason: "Bought elsewhere" });
      expect(await prisma.followUp.findUniqueOrThrow({ where: { id: moved.id } })).toMatchObject({
        status: "CANCELLED",
        cancelReason: "Bought elsewhere",
      });
      expect((await leadOf(id)).nextFollowUpAt).toBeNull();
      const types = (await prisma.leadActivity.findMany({ where: { leadId: id } })).map(
        (row) => row.type,
      );
      expect(types).toEqual(
        expect.arrayContaining([
          "FOLLOW_UP_SCHEDULED",
          "FOLLOW_UP_RESCHEDULED",
          "FOLLOW_UP_CANCELLED",
        ]),
      );
    });

    it("completes with the next follow-up in one step", async () => {
      const { id } = await createLead(env.ctx.exec1, { name: "Done Deepak", mobile: nextMobile() });
      const first = await scheduleFollowUp(env.ctx.exec1, { leadId: id, dueAt: future(1) });
      const { nextId } = await completeFollowUp(env.ctx.exec1, {
        followUpId: first.id,
        notes: "Shared the price sheet",
        next: { type: "FOLLOW_UP", dueAt: future(72) },
      });
      expect(nextId).not.toBeNull();
      expect(await prisma.followUp.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
        status: "COMPLETED",
        completionNotes: "Shared the price sheet",
        completedByName: "Esha Exec",
      });
    });

    it("marks overdue follow-ups missed after the grace period, once, and tells the owner", async () => {
      const { id } = await createLead(env.ctx.exec1, { name: "Late Lata", mobile: nextMobile() });
      const late = await scheduleFollowUp(env.ctx.exec1, { leadId: id, dueAt: future(1) });
      const recent = await scheduleFollowUp(env.ctx.exec1, { leadId: id, dueAt: future(2) });
      await prisma.followUp.update({
        where: { id: late.id },
        data: { dueAt: new Date(Date.now() - 3 * HOUR) },
      });
      await prisma.followUp.update({
        where: { id: recent.id },
        data: { dueAt: new Date(Date.now() - HOUR) },
      });

      expect(await detectMissedFollowUps(env.ctx.system, new Date())).toBe(1);
      expect(await detectMissedFollowUps(env.ctx.system, new Date())).toBe(0);
      expect(await prisma.followUp.findUniqueOrThrow({ where: { id: late.id } })).toMatchObject({
        status: "MISSED",
      });
      expect((await prisma.followUp.findUniqueOrThrow({ where: { id: recent.id } })).status).toBe(
        "SCHEDULED",
      );
      const told = await prisma.notification.findFirstOrThrow({
        where: { recipientId: env.m.exec1, type: "followup.missed", entityId: late.id },
      });
      expect(told.title).toMatch(/^Missed follow-up: LD-\d+ · Late Lata$/);

      // A missed follow-up stays open: it can still be done (late).
      await completeFollowUp(env.ctx.exec1, { followUpId: late.id, notes: "Called late" });
      const timeline = await prisma.leadActivity.findFirstOrThrow({
        where: { leadId: id, type: "FOLLOW_UP_COMPLETED" },
      });
      expect(timeline.summary).toBe("Follow-up done (late): Called late");
    });
  });

  describe("reassignment", () => {
    it("moves open follow-ups and their reminders to the new owner", async () => {
      const { id } = await createLead(env.ctx.exec1, { name: "Handed Hari", mobile: nextMobile() });
      const open = await scheduleFollowUp(env.ctx.exec1, { leadId: id, dueAt: future(20) });
      await assignLead(env.ctx.manager, {
        leadId: id,
        assigneeId: env.m.exec2,
        expectedOwnerId: env.m.exec1,
        reason: "Esha is on leave",
      });
      expect(await runHandlers(env.orgId, "activities.")).toBeGreaterThan(0);
      expect(
        (await prisma.followUp.findUniqueOrThrow({ where: { id: open.id } })).assignedToId,
      ).toBe(env.m.exec2);
      expect(
        await prisma.scheduledReminder.findFirstOrThrow({
          where: { dedupeKey: `followup:${open.id}` },
        }),
      ).toMatchObject({ recipientId: env.m.exec2, status: "SCHEDULED" });
      const moved = await prisma.leadActivity.findFirstOrThrow({
        where: { leadId: id, type: "FOLLOW_UP_TRANSFERRED" },
      });
      expect(moved).toMatchObject({
        summary: "1 open follow-up moved to Ravi Exec with the lead",
        actorName: "Meera Manager",
      });

      await updateActivitySettings(env.ctx.admin, { transferOnReassign: false });
      await assignLead(env.ctx.manager, {
        leadId: id,
        assigneeId: env.m.exec1,
        expectedOwnerId: env.m.exec2,
        reason: "Esha is back",
      });
      await runHandlers(env.orgId, "activities.");
      expect(
        (await prisma.followUp.findUniqueOrThrow({ where: { id: open.id } })).assignedToId,
      ).toBe(env.m.exec2);
      await updateActivitySettings(env.ctx.admin, { transferOnReassign: true });
    });
  });

  describe("lists, filters and views", () => {
    it("filters the lead list by follow-up, callback, calls and last outcome", async () => {
      const due = await createLead(env.ctx.exec2, { name: "Filter Overdue", mobile: nextMobile() });
      const planned = await scheduleFollowUp(env.ctx.exec2, { leadId: due.id, dueAt: future(1) });
      await prisma.followUp.update({
        where: { id: planned.id },
        data: { dueAt: new Date(Date.now() - 60_000) },
      });
      const callback = await createLead(env.ctx.exec2, {
        name: "Filter Callback",
        mobile: nextMobile(),
      });
      await logCall(env.ctx.exec2, {
        leadId: callback.id,
        outcomeId: env.outcome("CALLBACK"),
        next: { type: "CALLBACK", dueAt: future(4) },
      });
      const fresh = await createLead(env.ctx.exec2, { name: "Filter Fresh", mobile: nextMobile() });

      const names = async (extra: Record<string, string>) =>
        (
          await listLeads(env.ctx.exec2, everything, {
            view: "my",
            extra,
            timezone: "Asia/Kolkata",
          })
        ).rows.map((row) => row.name);
      expect(await names({ followUp: "overdue" })).toEqual(["Filter Overdue"]);
      expect(await names({ callback: "pending" })).toEqual(["Filter Callback"]);
      expect(await names({ calls: "never-called" })).toEqual(
        expect.arrayContaining(["Filter Fresh", "Filter Overdue"]),
      );
      expect(await names({ calls: "never-called" })).not.toContain("Filter Callback");
      expect(await names({ lastOutcome: env.outcome("CALLBACK") })).toEqual(["Filter Callback"]);
      expect(await names({ followUp: "none" })).toContain("Filter Fresh");
      expect(fresh.id).toBeTruthy();
      expect(await names({ followUp: "bogus" })).toEqual(await names({}));

      // The list shows the next follow-up and can sort by it (soonest first, leads without one last).
      const sorted = await listLeads(
        env.ctx.exec2,
        toTableQuery(
          { page: 1, pageSize: 100, sort: "nextFollowUpAt.asc", q: "" },
          { sortable: ["nextFollowUpAt"] },
        ),
        { view: "my", timezone: "Asia/Kolkata" },
      );
      expect(sorted.rows[0]).toMatchObject({ name: "Filter Overdue" });
      expect(sorted.rows[0]!.nextFollowUpAt).not.toBeNull();
      expect(sorted.rows.at(-1)!.nextFollowUpAt).toBeNull();
      expect(
        sorted.rows.find((row) => row.name === "Filter Callback")!.lastContactedAt,
      ).not.toBeNull();
    });

    it("scopes the call list by caller and lead", async () => {
      const mine = await listCalls(env.ctx.exec1, everything, { timezone: "Asia/Kolkata" });
      expect(mine.rows.every((row) => row.callerName === "Esha Exec")).toBe(true);
      const team = await listCalls(env.ctx.manager, everything, { timezone: "Asia/Kolkata" });
      expect(new Set(team.rows.map((row) => row.callerName))).toEqual(
        new Set(["Esha Exec", "Ravi Exec"]),
      );
      expect(team.total).toBeGreaterThan(mine.total);
    });

    it("builds the agenda and the team board", async () => {
      const agenda = await getMyAgenda(env.ctx.exec1);
      expect(agenda.stats.callsToday).toBeGreaterThan(0);
      expect(agenda.today.every((row) => row.assignedToId === env.m.exec1)).toBe(true);
      expect(agenda.week).toHaveLength(7);
      const upcoming = [...agenda.today, ...agenda.upcoming].map((row) => row.lead.name);
      expect(upcoming).toContain("Keen Kavya");

      const board = await getTeamFollowUpBoard(env.ctx.manager);
      const ravi = board.find((row) => row.name === "Ravi Exec")!;
      expect(ravi.overdue).toBeGreaterThanOrEqual(1);
      const overdue = await listTeamFollowUps(env.ctx.manager, {
        assigneeId: env.m.exec2,
        bucket: "overdue",
      });
      expect(overdue.map((row) => row.lead.name)).toContain("Filter Overdue");
      await expect(getTeamFollowUpBoard(env.ctx.exec1)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("alerts managers about overdue follow-ups and adds them to the daily summary", async () => {
      const alerts = await overdueFollowUpsRule.evaluate(env.ctx.system, new Date());
      const forManager = alerts.find((alert) => alert.recipientId === env.m.manager)!;
      expect(forManager.title).toMatch(/^\d+ overdue follow-ups? in your team$/);
      expect(alerts.some((alert) => alert.recipientId === env.m.exec1)).toBe(false);
      const block = await followUpsDigestSection.build(env.ctx.manager, new Date());
      expect(block?.title).toBe("Follow-ups — your team");
      expect(block?.lines.find((line) => line.label === "Overdue")!.value).toBeGreaterThan(0);
    });
  });

  describe("recordings", () => {
    it("lets callers upload and only permitted people listen, with an audit entry", async () => {
      const { id } = await createLead(env.ctx.exec1, {
        name: "Recorded Rekha",
        mobile: nextMobile(),
      });
      const call = await logCall(env.ctx.exec1, {
        leadId: id,
        outcomeId: env.outcome("NO_ANSWER"),
      });
      const body = new Uint8Array([1, 2, 3, 4]);
      await expect(
        requestCallRecordingUpload(env.ctx.exec1, {
          callId: call.id,
          fileName: "call.pdf",
          contentType: "application/pdf",
          size: body.byteLength,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      const { fileId } = await requestCallRecordingUpload(env.ctx.exec1, {
        callId: call.id,
        fileName: "call.m4a",
        contentType: "audio/x-m4a",
        size: body.byteLength,
      });
      const file = await prisma.fileObject.findUniqueOrThrow({ where: { id: fileId } });
      await getStorage().putObject(file.key, body, "audio/x-m4a");
      await attachCallRecording(env.ctx.exec1, call.id, fileId);

      await expect(getCallRecordingUrl(env.ctx.exec1, call.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      const url = await getCallRecordingUrl(env.ctx.manager, call.id);
      expect(url).toBeTruthy();
      expect(
        await prisma.auditLog.count({
          where: { action: "activities.call.recording.play", entityId: call.id },
        }),
      ).toBe(1);
    });
  });
});
