import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedActivityMasters } from "@/modules/activities/server/masters";
import { readDailyStats, refreshDailyStats } from "@/modules/analytics/server/aggregates";
import { runNightly } from "@/modules/analytics/server/jobs";
import { computeMemberDaily } from "@/modules/analytics/server/member-daily";
import {
  getMemberMetrics,
  getMetricSeries,
  getMetricSummary,
  getPipeline,
  resolveReportScope,
} from "@/modules/analytics/server/metrics";
import { seedAssignmentMasters } from "@/modules/assignment/server/reasons";
import { seedCatalogMasters } from "@/modules/catalog/server/masters";
import { seedDealMasters } from "@/modules/deals/server/masters";
import { createLead } from "@/modules/leads/server/leads";
import { seedLeadMasters } from "@/modules/leads/server/masters";
import { getRegionalSettings } from "@/modules/organization";
import { getServerRegistry } from "@/modules/registry.server";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { ForbiddenError } from "@/platform/errors";
import { stopBoss } from "@/platform/jobs/boss";
import { PermissionSet } from "@/platform/rbac/permissions";
import { createServiceContext, createSystemContext } from "@/platform/tenant/context";

import { contextFor, createMember, createOrganizationWithRoles } from "../support/identity";

const SEPT = { from: "2026-09-01", to: "2026-09-20" };
let phone = 9860000000;
const nextMobile = () => String((phone += 1));

/**
 * A golden dataset (M10-20): a handful of activities at known instants — some just after midnight IST, which is
 * still the previous day in UTC — with the counters worked out by hand.
 */
async function setup() {
  const org = await createOrganizationWithRoles();
  const orgId = org.organization.id;
  const db = createTenantDb(orgId);
  await seedCatalogMasters(db, orgId);
  await seedLeadMasters(db, orgId);
  await seedAssignmentMasters(db, orgId);
  await seedActivityMasters(db, orgId);
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
  const exec3 = await createMember(orgId, role("executive").id, {
    name: "Tara Exec",
    reportsToId: admin.membership.id,
  });
  const m = {
    admin: admin.membership.id,
    manager: manager.membership.id,
    exec1: exec1.membership.id,
    exec2: exec2.membership.id,
    exec3: exec3.membership.id,
  };
  const ctx = {
    admin: await contextFor(m.admin),
    manager: await contextFor(m.manager),
    exec1: await contextFor(m.exec1),
    exec2: await contextFor(m.exec2),
    exec3: await contextFor(m.exec3),
  };
  const builderA = await prisma.builder.create({
    data: { organizationId: orgId, code: "BLD-A", name: "Alpha Builders" },
  });
  const builderB = await prisma.builder.create({
    data: { organizationId: orgId, code: "BLD-B", name: "Beta Homes" },
  });
  const p1 = await prisma.project.create({
    data: { organizationId: orgId, builderId: builderA.id, code: "P-1", name: "Alpha One" },
  });
  const p2 = await prisma.project.create({
    data: { organizationId: orgId, builderId: builderB.id, code: "P-2", name: "Beta Two" },
  });
  const sources = await prisma.leadSource.findMany({ where: { organizationId: orgId }, take: 2 });
  const l1 = await createLead(ctx.exec1, {
    name: "Golden One",
    mobile: nextMobile(),
    sourceId: sources[0]!.id,
    interests: [{ projectId: p1.id }],
  });
  const l2 = await createLead(ctx.exec2, {
    name: "Golden Two",
    mobile: nextMobile(),
    sourceId: sources[1]!.id,
    interests: [{ projectId: p2.id }],
  });
  const l3 = await createLead(ctx.exec3, { name: "Golden Three", mobile: nextMobile() });
  const outcomes = await prisma.callOutcome.findMany({ where: { organizationId: orgId } });
  const outcome = (category: string) => outcomes.find((entry) => entry.category === category)!.id;
  const call = (
    leadId: string,
    callerId: string,
    startedAt: string,
    connected: boolean,
    category: string,
    durationSeconds: number,
  ) =>
    prisma.callLog.create({
      data: {
        organizationId: orgId,
        leadId,
        callerId,
        callerName: "x",
        direction: "OUTBOUND",
        startedAt: new Date(startedAt),
        connected,
        outcomeId: outcome(category),
        durationSeconds,
      },
    });
  await call(l1.id, m.exec1, "2026-09-10T04:00:00Z", true, "POSITIVE", 120);
  // 00:30 IST on the 11th — the 10th in UTC.
  await call(l1.id, m.exec1, "2026-09-10T19:00:00Z", false, "UNRESPONSIVE", 0);
  await call(l2.id, m.exec2, "2026-09-10T10:00:00Z", true, "NEGATIVE", 60);
  await call(l3.id, m.exec3, "2026-09-12T05:00:00Z", true, "INTERESTED", 30);

  const followUp = (data: Record<string, unknown>) =>
    prisma.followUp.create({
      data: {
        organizationId: orgId,
        type: "FOLLOW_UP",
        createdByName: "x",
        ...(data as { leadId: string; dueAt: Date }),
      },
    });
  await followUp({
    leadId: l1.id,
    assignedToId: m.exec1,
    dueAt: new Date("2026-09-10T06:00:00Z"),
    status: "COMPLETED",
    completedAt: new Date("2026-09-10T07:00:00Z"),
    completedById: m.exec1,
  });
  await followUp({
    leadId: l1.id,
    assignedToId: m.exec1,
    dueAt: new Date("2026-09-11T06:00:00Z"),
    status: "MISSED",
    missedAt: new Date("2026-09-11T09:00:00Z"),
  });
  await followUp({
    leadId: l2.id,
    assignedToId: m.exec2,
    dueAt: new Date("2026-09-10T08:00:00Z"),
    status: "RESCHEDULED",
  });

  const visit = (data: Record<string, unknown>) =>
    prisma.siteVisit.create({
      data: { organizationId: orgId, createdByName: "x", ...data } as never,
    });
  await visit({
    leadId: l1.id,
    projectId: p1.id,
    builderId: builderA.id,
    number: 1,
    scheduledAt: new Date("2026-09-12T07:00:00Z"),
    status: "COMPLETED",
    completedAt: new Date("2026-09-12T08:00:00Z"),
    assignedToId: m.exec1,
  });
  await visit({
    leadId: l1.id,
    projectId: p1.id,
    builderId: builderA.id,
    number: 2,
    isRevisit: true,
    scheduledAt: new Date("2026-09-14T07:00:00Z"),
    status: "COMPLETED",
    completedAt: new Date("2026-09-14T08:00:00Z"),
    assignedToId: m.exec1,
  });
  await visit({
    leadId: l2.id,
    projectId: p2.id,
    builderId: builderB.id,
    number: 1,
    scheduledAt: new Date("2026-09-12T08:00:00Z"),
    status: "NO_SHOW",
    noShowAt: new Date("2026-09-12T09:00:00Z"),
    assignedToId: m.exec2,
  });
  await prisma.booking.create({
    data: {
      organizationId: orgId,
      number: "BK-900001",
      leadId: l1.id,
      projectId: p1.id,
      builderId: builderA.id,
      executiveId: m.exec1,
      managerId: m.manager,
      customerName: "Golden One",
      bookingDate: new Date("2026-09-14T00:00:00Z"),
      status: "CLOSED_WON",
      closedAt: new Date("2026-09-15T05:00:00Z"),
      createdByName: "x",
    },
  });
  const lost = await prisma.leadStatus.findFirstOrThrow({
    where: { organizationId: orgId, key: "LOST" },
  });
  await prisma.lead.update({
    where: { id: l2.id },
    data: { statusId: lost.id, lostAt: new Date("2026-09-13T12:00:00Z") },
  });
  return { orgId, m, ctx, p1, builderB, leads: { l1, l2, l3 } };
}

describe("analytics metrics (M10)", () => {
  let env: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => {
    env = await setup();
  });

  afterAll(async () => {
    await stopBoss();
  });

  it("works in the organization's time zone", async () => {
    expect((await getRegionalSettings(env.ctx.admin)).timezone).toBe("Asia/Kolkata");
  });

  it("counts each activity once, on its local day, for the member who did it", async () => {
    const rows = await computeMemberDaily(prisma as never, env.orgId, {
      ...SEPT,
      timezone: "Asia/Kolkata",
      memberIds: null,
    });
    const pick = (memberId: string, day: string) => {
      const row = rows.find((entry) => entry.memberId === memberId && entry.day === day);
      if (!row) return null;
      return Object.fromEntries(
        Object.entries(row).filter(
          ([key, value]) => key !== "memberId" && key !== "day" && value !== 0,
        ),
      );
    };
    expect(pick(env.m.exec1, "2026-09-10")).toEqual({
      calls: 1,
      callsConnected: 1,
      callsPositive: 1,
      talkSeconds: 120,
      followUpsDue: 1,
      followUpsOnTime: 1,
      followUpsCompleted: 1,
    });
    expect(pick(env.m.exec1, "2026-09-11")).toEqual({
      calls: 1,
      callsUnresponsive: 1,
      followUpsDue: 1,
      followUpsMissed: 1,
    });
    expect(pick(env.m.exec1, "2026-09-12")).toEqual({ visitsCompleted: 1 });
    expect(pick(env.m.exec1, "2026-09-14")).toEqual({ revisitsCompleted: 1, bookings: 1 });
    expect(pick(env.m.exec1, "2026-09-15")).toEqual({ closures: 1 });
    expect(pick(env.m.exec2, "2026-09-10")).toEqual({
      calls: 1,
      callsConnected: 1,
      callsNegative: 1,
      talkSeconds: 60,
    });
    expect(pick(env.m.exec2, "2026-09-12")).toEqual({ visitsNoShow: 1 });
    expect(pick(env.m.exec2, "2026-09-13")).toEqual({ lost: 1 });
    expect(pick(env.m.exec3, "2026-09-12")).toEqual({
      calls: 1,
      callsConnected: 1,
      callsPositive: 1,
      talkSeconds: 30,
    });
    expect(rows).toHaveLength(9);
  });

  it("stores the same rows it computes (daily statistics)", async () => {
    const db = createTenantDb(env.orgId);
    const written = await refreshDailyStats(db, env.orgId, { ...SEPT, timezone: "Asia/Kolkata" });
    expect(written).toBe(9);
    const stored = await readDailyStats(db, { ...SEPT, memberIds: null });
    const live = await computeMemberDaily(db, env.orgId, {
      ...SEPT,
      timezone: "Asia/Kolkata",
      memberIds: null,
    });
    expect(stored).toEqual(live);
    // Refreshing again replaces rather than adds.
    await refreshDailyStats(db, env.orgId, { ...SEPT, timezone: "Asia/Kolkata" });
    expect(await db.dailyMemberStats.count()).toBe(9);
  });

  it("limits figures to the viewer's scope and to manager / executive filters", async () => {
    const range = SEPT;
    const calls = async (ctx: typeof env.ctx.admin, extra: Record<string, string> = {}) =>
      (await getMetricSummary(ctx, { range, ...extra })).current.calls;
    expect(await calls(env.ctx.exec1)).toBe(2);
    expect(await calls(env.ctx.manager)).toBe(3);
    expect(await calls(env.ctx.admin)).toBe(4);
    expect(await calls(env.ctx.manager, { executiveId: env.m.exec3 })).toBe(0);
    expect(await calls(env.ctx.admin, { managerId: env.m.manager })).toBe(3);
    expect(await calls(env.ctx.exec1, { executiveId: env.m.exec2 })).toBe(0);
    const noReports = createServiceContext({
      organizationId: env.orgId,
      actor: { type: "USER", id: "u", name: "Nobody", membershipId: env.m.exec1 },
      permissions: PermissionSet.fromGrants([]),
    });
    await expect(getMetricSummary(noReports, { range })).rejects.toBeInstanceOf(ForbiddenError);

    const members = await getMemberMetrics(env.ctx.manager, { range });
    expect(members.map((member) => [member.name, member.values.calls])).toEqual([
      ["Esha Exec", 2],
      ["Meera Manager", 0],
      ["Ravi Exec", 1],
    ]);
    expect(members[0]!.values).toMatchObject({ connectRate: 50, followUpAdherence: 50 });
  });

  it("filters by project, builder, source and current status", async () => {
    const summary = (extra: Record<string, string>) =>
      getMetricSummary(env.ctx.admin, { range: SEPT, ...extra }).then((result) => result.current);
    expect(await summary({ projectId: env.p1.id })).toMatchObject({
      calls: 2,
      visitsCompleted: 1,
      revisitsCompleted: 1,
      bookings: 1,
      closures: 1,
      lost: 0,
      visitToBooking: 50,
    });
    expect(await summary({ builderId: env.builderB.id })).toMatchObject({
      calls: 1,
      visitsNoShow: 1,
      lost: 1,
      closures: 0,
    });
    const lead2 = await prisma.lead.findUniqueOrThrow({ where: { id: env.leads.l2.id } });
    expect(await summary({ sourceId: lead2.sourceId! })).toMatchObject({ calls: 1, lost: 1 });
    expect(await summary({ statusId: lead2.statusId })).toMatchObject({ calls: 1, lost: 1 });
  });

  it("buckets by week and compares with the previous period", async () => {
    const weeks = await getMetricSeries(
      env.ctx.admin,
      { range: { from: "2026-09-07", to: "2026-09-20" } },
      "week",
    );
    expect(weeks.map((week) => [week.key, week.values.calls, week.values.closures])).toEqual([
      ["2026-09-07", 4, 0],
      ["2026-09-14", 0, 1],
    ]);
    const day = await getMetricSummary(env.ctx.admin, {
      range: { from: "2026-09-10", to: "2026-09-10" },
    });
    expect(day.previousRange).toEqual({ from: "2026-09-09", to: "2026-09-09" });
    expect(day.current.calls).toBe(2);
    expect(day.change.calls).toBeNull();
    const week = await getMetricSummary(env.ctx.admin, {
      range: { from: "2026-09-14", to: "2026-09-20" },
    });
    expect(week.previous.calls).toBe(4);
    expect(week.change.calls).toBe(-100);
  });

  it("reports where the leads stand now: pending, overdue, unassigned", async () => {
    const pipeline = await getPipeline(env.ctx.admin, {});
    const count = (key: string) =>
      pipeline.byStatus.find((status) => status.key === key)?.count ?? 0;
    expect(count("LOST")).toBe(1);
    expect(pipeline.open).toBe(2);
    // Lead 1 has a missed follow-up; lead 3 has nothing planned.
    expect(pipeline.pending).toBe(2);
    expect(pipeline.overdueFollowUps).toBe(1);
    expect(pipeline.unassigned).toBe(0);
    const own = await getPipeline(env.ctx.exec3, {});
    expect(own).toMatchObject({ open: 1, pending: 1, overdueFollowUps: 0, unassigned: null });
  });

  it("refreshes after activity and reconciles at 02:00 local time", async () => {
    const handler = getServerRegistry().eventHandlers.find(
      (entry) => entry.name === "analytics.refresh-on-call-logged",
    )!;
    const event = {
      id: crypto.randomUUID(),
      type: "call.logged",
      organizationId: env.orgId,
      actor: { type: "SYSTEM", id: null, name: "t" },
      payload: {},
      occurredAt: "2026-09-10T19:00:00.000Z",
    };
    await handler.handle(event as never, createSystemContext(env.orgId));
    await handler.handle(
      { ...event, id: crypto.randomUUID() } as never,
      createSystemContext(env.orgId),
    );
    const jobs = await prisma.$queryRawUnsafe<{ data: { from: string } }[]>(
      `SELECT data FROM pgboss.job WHERE name = 'analytics.refresh-days' AND data->>'organizationId' = $1`,
      env.orgId,
    );
    // Both events were on 11 September in India and share one job.
    expect(jobs.map((job) => job.data.from)).toEqual(["2026-09-11"]);

    const system = createSystemContext(env.orgId);
    expect(await runNightly(system, new Date("2026-09-17T05:00:00Z"))).toBe(false);
    expect(await runNightly(system, new Date("2026-09-16T20:45:00Z"))).toBe(true);
    const snapshot = await prisma.dailyLeadSnapshot.findMany({
      where: { organizationId: env.orgId, day: new Date("2026-09-16T00:00:00Z") },
    });
    expect(snapshot.reduce((total, row) => total + row.count, 0)).toBe(3);
  });

  it("resolves report scopes", async () => {
    expect((await resolveReportScope(env.ctx.exec2)).memberIds).toEqual([env.m.exec2]);
    expect((await resolveReportScope(env.ctx.admin)).memberIds).toBeNull();
    expect(new Set((await resolveReportScope(env.ctx.manager)).memberIds)).toEqual(
      new Set([env.m.manager, env.m.exec1, env.m.exec2]),
    );
  });
});
