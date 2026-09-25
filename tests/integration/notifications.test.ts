import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assignLead, bulkAssign, unassignLead } from "@/modules/assignment/server/assign";
import { seedAssignmentMasters } from "@/modules/assignment/server/reasons";
import { seedCatalogMasters } from "@/modules/catalog/server/masters";
import { createLead } from "@/modules/leads/server/leads";
import { seedLeadMasters } from "@/modules/leads/server/masters";
import { NOTIFICATION_JOBS } from "@/modules/notifications/constants";
import { evaluateAlertRules } from "@/modules/notifications/server/alerts";
import {
  listAnnouncements,
  listMyAnnouncements,
  markAnnouncementsRead,
  publishDueAnnouncements,
  saveAnnouncement,
} from "@/modules/notifications/server/announcements";
import {
  getNotificationSummary,
  listMyNotifications,
  markAllNotificationsRead,
  markNotifications,
} from "@/modules/notifications/server/center";
import { deliverNotificationEmail } from "@/modules/notifications/server/delivery";
import { sendDailyDigests } from "@/modules/notifications/server/digest";
import { notify } from "@/modules/notifications/server/notify";
import {
  getMyNotificationPreferences,
  resetMyNotificationPreferences,
  setMyNotificationPreference,
} from "@/modules/notifications/server/preferences";
import {
  cancelReminder,
  fireOverdueReminders,
  fireReminder,
  scheduleReminder,
} from "@/modules/notifications/server/reminders";
import { updateNotificationSettings } from "@/modules/notifications/server/settings";
import { getServerRegistry } from "@/modules/registry.server";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import {
  type EmailTransport,
  MemoryTransport,
  setEmailTransportForTesting,
} from "@/platform/email";
import { ForbiddenError, ValidationError } from "@/platform/errors";
import { eventHandlerQueueName } from "@/platform/events/define";
import type { DomainEvent } from "@/platform/events/types";
import { stopBoss } from "@/platform/jobs/boss";
import { createSystemContext } from "@/platform/tenant/context";

import { contextFor, createMember, createOrganizationWithRoles } from "../support/identity";

async function setup() {
  const org = await createOrganizationWithRoles();
  const orgId = org.organization.id;
  const db = createTenantDb(orgId);
  await seedCatalogMasters(db, orgId);
  await seedLeadMasters(db, orgId);
  await seedAssignmentMasters(db, orgId);
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
  const emails = { exec1: exec1.user.email, manager: manager.user.email };
  return { orgId, m, ctx, role, emails };
}

let phone = 9820000000;
const nextMobile = () => String((phone += 1));

/** Runs the queued notification event handlers of one organization (what the worker does), oldest first. */
async function runNotificationHandlers(organizationId: string): Promise<number> {
  const handlers = new Map(
    getServerRegistry()
      .eventHandlers.filter((handler) => handler.name.startsWith("notifications."))
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
    const event = job.data.event;
    await handlers
      .get(job.name)!
      .handle(
        event,
        createSystemContext(organizationId, { requestId: event.requestId ?? undefined }),
      );
    await prisma.$executeRawUnsafe(`DELETE FROM pgboss.job WHERE id = $1::uuid`, job.id);
  }
  return jobs.length;
}

async function queuedJobs(name: string, organizationId: string) {
  return prisma.$queryRawUnsafe<{ id: string; data: Record<string, string>; start_after: Date }[]>(
    `SELECT id, data, start_after FROM pgboss.job
     WHERE name = $1 AND state = 'created' AND data->>'organizationId' = $2`,
    name,
    organizationId,
  );
}

const notificationsOf = (recipientId: string) =>
  prisma.notification.findMany({
    where: { recipientId },
    orderBy: { createdAt: "asc" },
    include: { deliveries: true },
  });

describe("notifications & reminders engine (M06)", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  let transport: MemoryTransport;

  beforeAll(async () => {
    env = await setup();
    transport = new MemoryTransport();
    setEmailTransportForTesting(transport as EmailTransport);
  });

  afterAll(async () => {
    setEmailTransportForTesting(undefined);
    await stopBoss();
  });

  describe("notify(), settings and preferences", () => {
    it("stores the notification, queues the e-mail and sends each key once", async () => {
      const input = {
        type: "import.finished",
        recipientIds: [env.m.exec1, env.m.exec1, env.m.exec2],
        title: "Import finished: leads.csv",
        body: "3 leads imported.",
        link: "/leads/import/x",
        idempotencyKey: "test:once",
      };
      const first = await notify(env.ctx.system, input);
      expect(first.createdIds).toHaveLength(2);
      const again = await notify(env.ctx.system, input);
      expect(again.createdIds).toHaveLength(0);

      const [notification] = await notificationsOf(env.m.exec1);
      expect(notification).toMatchObject({
        type: "import.finished",
        category: "System",
        channels: ["IN_APP", "EMAIL"],
        groupCount: 1,
        readAt: null,
      });
      expect(notification!.deliveries).toMatchObject([
        { channel: "EMAIL", status: "PENDING", attempts: 0 },
      ]);
      const jobs = await queuedJobs(NOTIFICATION_JOBS.deliverEmail, env.orgId);
      expect(jobs.map((job) => job.data.deliveryId)).toContain(notification!.deliveries[0]!.id);
    });

    it("refuses unknown types and skips inactive members", async () => {
      await expect(
        notify(env.ctx.system, { type: "nope", recipientIds: [env.m.exec1], title: "x" }),
      ).rejects.toThrow(/Unknown notification type/);
      const gone = await createMember(env.orgId, env.role("executive").id, { status: "INACTIVE" });
      const result = await notify(env.ctx.system, {
        type: "lead.duplicate",
        recipientIds: [gone.membership.id],
        title: "Nobody hears this",
      });
      expect(result.createdIds).toEqual([]);
    });

    it("applies organization settings, then personal choices; essential types always arrive", async () => {
      await expect(
        updateNotificationSettings(env.ctx.admin, {
          types: { "lead.assigned": { enabled: false, channels: [] } },
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        updateNotificationSettings(env.ctx.manager, { types: {} }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await updateNotificationSettings(env.ctx.admin, {
        types: {
          "lead.duplicate": { enabled: false, channels: ["IN_APP"] },
          "import.finished": { enabled: true, channels: ["IN_APP"] },
        },
      });

      const duplicate = await notify(env.ctx.system, {
        type: "lead.duplicate",
        recipientIds: [env.m.exec2],
        title: "Switched off by the organization",
      });
      expect(duplicate.createdIds).toEqual([]);

      // Personal choice: e-mail on top of the organization's in-app default.
      await setMyNotificationPreference(env.ctx.exec2, {
        type: "import.finished",
        channel: "EMAIL",
        enabled: true,
      });
      await notify(env.ctx.system, {
        type: "import.finished",
        recipientIds: [env.m.exec1, env.m.exec2],
        title: "Org default vs personal choice",
      });
      const latest = async (id: string) => (await notificationsOf(id)).at(-1)!;
      expect((await latest(env.m.exec1)).channels).toEqual(["IN_APP"]);
      expect((await latest(env.m.exec2)).channels).toEqual(["IN_APP", "EMAIL"]);

      // Essential types keep at least one channel.
      await setMyNotificationPreference(env.ctx.exec2, {
        type: "lead.assigned",
        channel: "EMAIL",
        enabled: false,
      });
      await expect(
        setMyNotificationPreference(env.ctx.exec2, {
          type: "lead.assigned",
          channel: "IN_APP",
          enabled: false,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      const rows = await getMyNotificationPreferences(env.ctx.exec2);
      expect(rows.find((row) => row.key === "lead.assigned")).toMatchObject({
        critical: true,
        channels: ["IN_APP"],
        customized: true,
      });
      expect(rows.find((row) => row.key === "lead.duplicate")).toMatchObject({
        disabledByOrganization: true,
        channels: [],
      });
      // Team notifications cannot reach an executive, so they are not offered.
      expect(rows.map((row) => row.key)).not.toContain("digest.daily");
      expect((await getMyNotificationPreferences(env.ctx.manager)).map((row) => row.key)).toEqual(
        expect.arrayContaining(["digest.daily", "team.lead_assigned", "team.unworked_leads"]),
      );

      await resetMyNotificationPreferences(env.ctx.exec2);
      expect(
        (await getMyNotificationPreferences(env.ctx.exec2)).find(
          (row) => row.key === "lead.assigned",
        ),
      ).toMatchObject({ channels: ["IN_APP", "EMAIL"], customized: false });
      await updateNotificationSettings(env.ctx.admin, { types: {} });
    });

    it("groups related events into one counting notification", async () => {
      const group = (count: number) => ({
        title: count === 1 ? "One thing happened" : `${count} things happened`,
        link: count === 1 ? "/one" : "/many",
      });
      for (let index = 0; index < 3; index += 1) {
        await notify(env.ctx.system, {
          type: "team.lead_assigned",
          recipientIds: [env.m.manager],
          title: "",
          idempotencyKey: "test:group",
          group,
        });
      }
      const grouped = (await notificationsOf(env.m.manager)).filter(
        (row) => row.idempotencyKey === "test:group",
      );
      expect(grouped).toHaveLength(1);
      expect(grouped[0]).toMatchObject({
        groupCount: 3,
        title: "3 things happened",
        link: "/many",
      });
    });
  });

  describe("notification center", () => {
    it("lists, counts and marks only one's own in-app notifications", async () => {
      const summary = await getNotificationSummary(env.ctx.exec1);
      expect(summary.unread).toBeGreaterThan(0);
      const page = await listMyNotifications(env.ctx.exec1, { unreadOnly: true });
      expect(page.items.every((item) => !item.read)).toBe(true);

      const [first] = page.items;
      expect(await markNotifications(env.ctx.exec2, [first!.id], true)).toBe(0);
      expect(await markNotifications(env.ctx.exec1, [first!.id], true)).toBe(1);
      expect((await getNotificationSummary(env.ctx.exec1)).unread).toBe(summary.unread - 1);
      expect(await markNotifications(env.ctx.exec1, [first!.id], false)).toBe(1);

      await markAllNotificationsRead(env.ctx.exec1, { category: "System" });
      const system = await listMyNotifications(env.ctx.exec1, { category: "System" });
      expect(system.items.every((item) => item.read)).toBe(true);
      await expect(getNotificationSummary(env.ctx.system)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("e-mail delivery", () => {
    it("sends once, tracks attempts and skips people who left", async () => {
      const [notification] = await notificationsOf(env.m.exec1);
      const delivery = notification!.deliveries[0]!;
      const before = transport.sent.length;
      await deliverNotificationEmail(env.orgId, delivery.id);
      await deliverNotificationEmail(env.orgId, delivery.id);
      expect(transport.sent.length).toBe(before + 1);
      const sent = transport.sent.at(-1)!;
      expect(sent.to).toBe(env.emails.exec1);
      expect(sent.subject).toBe("Import finished: leads.csv");
      expect(sent.html).toContain("http://localhost:3000/leads/import/x");
      expect(
        await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
      ).toMatchObject({ status: "SENT", attempts: 1, lastError: null });

      const leaver = await createMember(env.orgId, env.role("executive").id);
      const { createdIds } = await notify(env.ctx.system, {
        type: "announcement",
        recipientIds: [leaver.membership.id],
        title: "Before leaving",
      });
      await prisma.membership.update({
        where: { id: leaver.membership.id },
        data: { status: "INACTIVE" },
      });
      const leaverDelivery = await prisma.notificationDelivery.findFirstOrThrow({
        where: { notificationId: createdIds[0] },
      });
      await deliverNotificationEmail(env.orgId, leaverDelivery.id);
      expect(
        await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: leaverDelivery.id } }),
      ).toMatchObject({ status: "FAILED", lastError: "The person is no longer active." });
    });
  });

  describe("reminders", () => {
    it("schedules, moves, fires once and cancels by key", async () => {
      const soon = new Date(Date.now() + 60 * 60 * 1000);
      const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const schedule = (fireAt: Date) =>
        env.ctx.system.db.$transaction((tx) =>
          scheduleReminder(tx, env.ctx.system, {
            dedupeKey: "follow-up:1",
            recipientId: env.m.exec1,
            fireAt,
            title: "Call Rahul back",
            link: "/leads/x",
          }),
        );
      const first = await schedule(soon);
      const moved = await schedule(later);
      expect(moved.id).toBe(first.id);
      const jobs = await queuedJobs(NOTIFICATION_JOBS.fireReminder, env.orgId);
      expect(jobs.filter((job) => job.data.reminderId === first.id)).toHaveLength(2);

      // The job of the earlier time finds the reminder moved and does nothing.
      expect(await fireReminder(env.ctx.system, first.id, soon, later)).toBe(false);
      // Not due yet for the sweep either.
      expect(await fireOverdueReminders(env.ctx.system, new Date())).toBe(0);
      // Due: fires once.
      const due = new Date(later.getTime() + 1000);
      expect(await fireReminder(env.ctx.system, first.id, later, due)).toBe(true);
      expect(await fireReminder(env.ctx.system, first.id, later, due)).toBe(false);
      const reminder = await prisma.scheduledReminder.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(reminder.status).toBe("SENT");
      const notification = await prisma.notification.findUniqueOrThrow({
        where: { id: reminder.notificationId! },
      });
      expect(notification).toMatchObject({
        type: "reminder",
        title: "Call Rahul back",
        priority: "HIGH",
      });

      // Scheduling the key again re-arms it; cancelling stops the sweep from sending it.
      await schedule(new Date(Date.now() - 5 * 60 * 1000));
      expect(
        await env.ctx.system.db.$transaction((tx) =>
          cancelReminder(tx, env.ctx.system, "follow-up:1"),
        ),
      ).toBe(true);
      expect(await fireOverdueReminders(env.ctx.system, new Date())).toBe(0);

      // A missed job is recovered by the sweep.
      await schedule(new Date(Date.now() - 5 * 60 * 1000));
      expect(await fireOverdueReminders(env.ctx.system, new Date())).toBe(1);
      expect(
        (await prisma.notification.count({
          where: { recipientId: env.m.exec1, type: "reminder" },
        })) >= 2,
      ).toBe(true);
    });
  });

  describe("events → notifications", () => {
    it("tells the new owner, the previous owner and the manager — never the person acting", async () => {
      const { id } = await createLead(env.ctx.admin, { name: "Priya Buyer", mobile: nextMobile() });
      await assignLead(env.ctx.manager, {
        leadId: id,
        assigneeId: env.m.exec1,
        expectedOwnerId: null,
      });
      await runNotificationHandlers(env.orgId);
      const toOwner = await prisma.notification.findFirstOrThrow({
        where: { recipientId: env.m.exec1, entityId: id },
      });
      expect(toOwner).toMatchObject({
        type: "lead.assigned",
        link: `/leads/${id}`,
        actorName: "Meera Manager",
        priority: "HIGH",
      });
      expect(toOwner.title).toMatch(/^New lead: LD-\d+ · Priya Buyer$/);
      // The manager assigned it: not told about their own action.
      expect(
        await prisma.notification.count({ where: { recipientId: env.m.manager, entityId: id } }),
      ).toBe(0);

      await assignLead(env.ctx.admin, {
        leadId: id,
        assigneeId: env.m.exec2,
        expectedOwnerId: env.m.exec1,
        reason: "Esha is on leave",
      });
      await runNotificationHandlers(env.orgId);
      const byType = async (recipientId: string) =>
        prisma.notification.findMany({
          where: { recipientId, entityId: id },
          orderBy: { createdAt: "asc" },
        });
      expect((await byType(env.m.exec2)).map((row) => row.title)).toEqual([
        expect.stringMatching(/^Lead moved to you: LD-\d+ · Priya Buyer$/),
      ]);
      expect((await byType(env.m.exec2))[0]!.body).toBe(
        "Asha Admin moved it from Esha Exec.\nReason: Esha is on leave",
      );
      expect((await byType(env.m.exec1)).at(-1)).toMatchObject({
        type: "lead.moved_away",
        link: null,
      });
      expect((await byType(env.m.exec1)).at(-1)!.title).toMatch(/was moved to Ravi Exec$/);
      expect((await byType(env.m.manager)).map((row) => row.type)).toEqual(["team.lead_assigned"]);

      await unassignLead(env.ctx.admin, {
        leadId: id,
        expectedOwnerId: env.m.exec2,
        reason: "Back to the pool",
      });
      await runNotificationHandlers(env.orgId);
      expect((await byType(env.m.exec2)).at(-1)!.title).toMatch(
        /went back to the unassigned queue$/,
      );
    });

    it("turns a bulk assignment into one counting notification per person", async () => {
      const ids: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        ids.push(
          (await createLead(env.ctx.admin, { name: `Bulk ${index}`, mobile: nextMobile() })).id,
        );
      }
      const before = await prisma.notification.count({ where: { recipientId: env.m.exec1 } });
      await bulkAssign(env.ctx.admin, { leadIds: ids, assigneeIds: [env.m.exec1] });
      await runNotificationHandlers(env.orgId);
      const added = await prisma.notification.findMany({
        where: { recipientId: env.m.exec1 },
        orderBy: { createdAt: "asc" },
        skip: before,
      });
      expect(added).toHaveLength(1);
      expect(added[0]).toMatchObject({
        groupCount: 3,
        title: "3 new leads assigned to you",
        link: `/leads?owner=${env.m.exec1}&open=true`,
      });
      const managerGroup = await prisma.notification.findFirstOrThrow({
        where: { recipientId: env.m.manager, groupCount: 3, type: "team.lead_assigned" },
      });
      expect(managerGroup.title).toBe("3 leads assigned in your team");
      // The grouped e-mail waits for the count to settle.
      const delivery = await prisma.notificationDelivery.findFirstOrThrow({
        where: { notificationId: added[0]!.id },
      });
      const [job] = (await queuedJobs(NOTIFICATION_JOBS.deliverEmail, env.orgId)).filter(
        (entry) => entry.data.deliveryId === delivery.id,
      );
      expect(job!.start_after.getTime()).toBeGreaterThan(Date.now() + 20_000);
    });

    it("tells owners about possible duplicates and importers about their import", async () => {
      const mobile = nextMobile();
      const original = await createLead(env.ctx.exec1, { name: "Kiran Original", mobile });
      await createLead(env.ctx.exec2, { name: "Kiran Again", mobile });
      await runNotificationHandlers(env.orgId);
      const duplicate = await prisma.notification.findFirstOrThrow({
        where: { recipientId: env.m.exec1, type: "lead.duplicate" },
      });
      expect(duplicate).toMatchObject({ link: `/leads/${original.id}`, actorName: "Ravi Exec" });
      expect(duplicate.title).toMatch(/^Possible duplicate of your lead LD-\d+ · Kiran Original$/);

      const handler = getServerRegistry()
        .handlersFor("lead.import_failed")
        .find((entry) => entry.name === "notifications.import-failed")!;
      await handler.handle(
        {
          id: crypto.randomUUID(),
          type: "lead.import_failed",
          organizationId: env.orgId,
          payload: {
            batchId: crypto.randomUUID(),
            createdById: env.m.manager,
            fileName: "march.xlsx",
            message: "The uploaded file is missing.",
          },
          actor: { type: "SYSTEM", id: null, name: "Lead import" },
          requestId: null,
          occurredAt: new Date().toISOString(),
        } as DomainEvent<"lead.import_failed">,
        env.ctx.system,
      );
      expect(
        await prisma.notification.findFirstOrThrow({
          where: { recipientId: env.m.manager, type: "import.finished" },
        }),
      ).toMatchObject({
        title: "Import failed: march.xlsx",
        body: "The uploaded file is missing.",
        priority: "HIGH",
      });
    });
  });

  describe("daily summary and manager alerts", () => {
    const setTimezone = (timezone: string) =>
      prisma.organizationSetting.update({
        where: { organizationId: env.orgId },
        data: { timezone },
      });

    it("sends the summary once a day at the local time of the organization", async () => {
      await setTimezone("Asia/Kolkata");
      await updateNotificationSettings(env.ctx.admin, { digestTime: "08:30" });
      await setMyNotificationPreference(env.ctx.admin, {
        type: "digest.daily",
        channel: "IN_APP",
        enabled: true,
      });
      // 08:29 in Kolkata (UTC+5:30) is 02:59 UTC.
      expect(await sendDailyDigests(env.ctx.system, new Date("2026-03-10T02:59:00Z"))).toBe(0);
      const sent = await sendDailyDigests(env.ctx.system, new Date("2026-03-10T03:00:00Z"));
      // Admin (whole organization) and the manager (a team); executives have no team.
      expect(sent).toBe(2);
      expect(await sendDailyDigests(env.ctx.system, new Date("2026-03-10T03:15:00Z"))).toBe(0);

      const digest = await prisma.notification.findFirstOrThrow({
        where: { recipientId: env.m.admin, type: "digest.daily" },
      });
      expect(digest).toMatchObject({
        title: "Your summary for Tuesday, 10 March",
        idempotencyKey: "digest:2026-03-10",
        channels: ["IN_APP", "EMAIL"],
      });
      const data = digest.data as { sections: { title: string; lines: { label: string }[] }[] };
      expect(data.sections[0]!.title).toBe("Leads — whole organization");
      expect(data.sections[0]!.lines.map((line) => line.label)).toContain(
        "Unassigned, waiting for an owner",
      );
      const managerDigest = await prisma.notification.findFirstOrThrow({
        where: { recipientId: env.m.manager, type: "digest.daily" },
      });
      expect((managerDigest.data as { sections: { title: string }[] }).sections[0]!.title).toBe(
        "Leads — your team",
      );

      // Same instant, other side of the world: 08:30 in New York is 12:30 UTC (daylight saving time).
      await setTimezone("America/New_York");
      expect(await sendDailyDigests(env.ctx.system, new Date("2026-07-01T03:00:00Z"))).toBe(0);
      expect(await sendDailyDigests(env.ctx.system, new Date("2026-07-01T12:30:00Z"))).toBe(2);

      // The e-mail uses the summary template.
      const emailDelivery = await prisma.notificationDelivery.findFirstOrThrow({
        where: { notificationId: digest.id },
      });
      await deliverNotificationEmail(env.orgId, emailDelivery.id);
      expect(transport.sent.at(-1)!.html).toContain("Leads — whole organization");
      await setTimezone("Asia/Kolkata");
    });

    it("alerts managers about unworked leads once a day, in working hours", async () => {
      const at = (hour: number) => {
        // Local Kolkata time `hour`:00 today, as an instant.
        const date = new Date().toISOString().slice(0, 10);
        return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+05:30`);
      };
      const { id } = await createLead(env.ctx.admin, {
        name: "Waiting Lead",
        mobile: nextMobile(),
      });
      await assignLead(env.ctx.admin, {
        leadId: id,
        assigneeId: env.m.exec2,
        expectedOwnerId: null,
      });
      const assignedAt = new Date(at(11).getTime() - 30 * 3600 * 1000);
      await prisma.lead.update({
        where: { id },
        data: { ownerAssignedAt: assignedAt, lastActivityAt: assignedAt },
      });
      expect(await evaluateAlertRules(env.ctx.system, at(7))).toBe(0);
      const sent = await evaluateAlertRules(env.ctx.system, at(11));
      expect(sent).toBeGreaterThanOrEqual(2); // the manager (team) and the admin (organization)
      expect(await evaluateAlertRules(env.ctx.system, at(12))).toBe(0);
      const alert = await prisma.notification.findFirstOrThrow({
        where: { recipientId: env.m.manager, type: "team.unworked_leads" },
      });
      expect(alert.title).toMatch(/^\d+ leads? waiting more than 24 hours$/);
      expect(alert.link).toBe("/team/workload");
      expect(
        await prisma.notification.count({
          where: { recipientId: env.m.exec2, type: "team.unworked_leads" },
        }),
      ).toBe(0);
    });
  });

  describe("announcements", () => {
    it("notifies the audience once, shows a banner until read and counts reads", async () => {
      const executive = env.role("executive");
      await expect(
        saveAnnouncement(env.ctx.manager, null, { title: "Nope", body: "Not allowed" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        saveAnnouncement(env.ctx.admin, null, {
          title: "Team",
          body: "Missing roles",
          audience: "ROLES",
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      const live = await saveAnnouncement(env.ctx.admin, null, {
        title: "New project launch",
        body: "Skyline Towers opens for booking on Monday.",
        audience: "ROLES",
        roleIds: [executive.id],
        publishedAt: new Date().toISOString(),
      });
      expect(live.state).toBe("LIVE");
      const received = await prisma.notification.findMany({
        where: { entityId: live.id, type: "announcement" },
      });
      expect(received.map((row) => row.recipientId).sort()).toEqual(
        [env.m.exec1, env.m.exec2].sort(),
      );
      // Editing does not notify again.
      await saveAnnouncement(env.ctx.admin, live.id, {
        title: "New project launch",
        body: "Skyline Towers opens for booking on Monday at 10 am.",
        audience: "ROLES",
        roleIds: [executive.id],
        publishedAt: new Date().toISOString(),
      });
      expect(await prisma.notification.count({ where: { entityId: live.id } })).toBe(2);

      expect(
        (await listMyAnnouncements(env.ctx.exec1, { unreadOnly: true })).map((a) => a.id),
      ).toContain(live.id);
      expect((await listMyAnnouncements(env.ctx.manager)).map((a) => a.id)).not.toContain(live.id);
      await markAnnouncementsRead(env.ctx.exec1, [live.id]);
      await markAnnouncementsRead(env.ctx.manager, [live.id]); // not in the audience: ignored
      expect(
        (await listMyAnnouncements(env.ctx.exec1, { unreadOnly: true })).map((a) => a.id),
      ).not.toContain(live.id);
      const row = (await listAnnouncements(env.ctx.admin)).find((entry) => entry.id === live.id)!;
      expect(row).toMatchObject({ reads: 1, audienceSize: 2, state: "LIVE" });

      const later = new Date(Date.now() + 3600 * 1000);
      const scheduled = await saveAnnouncement(env.ctx.admin, null, {
        title: "Team meeting",
        body: "Friday 5 pm, conference room.",
        audience: "TEAM",
        teamOfId: env.m.manager,
        publishedAt: later.toISOString(),
      });
      expect(scheduled.state).toBe("SCHEDULED");
      expect(
        (await queuedJobs(NOTIFICATION_JOBS.publishAnnouncement, env.orgId)).map(
          (job) => job.data.announcementId,
        ),
      ).toContain(scheduled.id);
      expect(await prisma.notification.count({ where: { entityId: scheduled.id } })).toBe(0);
      expect(
        await publishDueAnnouncements(env.ctx.system, new Date(later.getTime() + 2 * 60_000)),
      ).toBe(1);
      const team = await prisma.notification.findMany({ where: { entityId: scheduled.id } });
      expect(team.map((entry) => entry.recipientId).sort()).toEqual(
        [env.m.manager, env.m.exec1, env.m.exec2].sort(),
      );
    });
  });
});
