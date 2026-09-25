import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toTableQuery } from "@/lib/table-query";
import {
  assignLead,
  bulkAssign,
  listAssignableMembers,
  listAssignmentHistory,
  unassignLead,
} from "@/modules/assignment/server/assign";
import { handOverAndDeactivate } from "@/modules/assignment/server/handover";
import {
  deleteReassignmentReason,
  listReassignmentReasons,
  seedAssignmentMasters,
} from "@/modules/assignment/server/reasons";
import { saveAssignmentRule } from "@/modules/assignment/server/rules";
import { updateAssignmentSettings } from "@/modules/assignment/server/settings";
import { getTeamWorkload, listUnassignedQueue } from "@/modules/assignment/server/workload";
import { seedCatalogMasters } from "@/modules/catalog/server/masters";
import { seedDealMasters } from "@/modules/deals/server/masters";
import { createLead, listLeads } from "@/modules/leads/server/leads";
import { seedLeadMasters } from "@/modules/leads/server/masters";
import { changeLeadStatus } from "@/modules/leads/server/status";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { stopBoss } from "@/platform/jobs/boss";

import { contextFor, createMember, createOrganizationWithRoles } from "../support/identity";

const everything = toTableQuery({ page: 1, pageSize: 100, sort: "", q: "" }, { sortable: [] });

async function setup() {
  const org = await createOrganizationWithRoles();
  const orgId = org.organization.id;
  const db = createTenantDb(orgId);
  await seedCatalogMasters(db, orgId);
  await seedLeadMasters(db, orgId);
  await seedAssignmentMasters(db, orgId);
  await seedAssignmentMasters(db, orgId);
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
  const otherManager = await createMember(orgId, role("manager").id, {
    name: "Omar Other",
    reportsToId: admin.membership.id,
  });
  const exec3 = await createMember(orgId, role("executive").id, {
    name: "Olga Exec",
    reportsToId: otherManager.membership.id,
  });
  const ctx = {
    admin: await contextFor(admin.membership.id),
    manager: await contextFor(manager.membership.id),
    exec1: await contextFor(exec1.membership.id),
    exec2: await contextFor(exec2.membership.id),
    exec3: await contextFor(exec3.membership.id),
  };
  const sources = await prisma.leadSource.findMany({ where: { organizationId: orgId } });
  const source = (code: string) => sources.find((entry) => entry.code === code)!.id;
  const statuses = await prisma.leadStatus.findMany({ where: { organizationId: orgId } });
  const status = (key: string) => statuses.find((entry) => entry.key === key)!;
  const m = {
    admin: admin.membership.id,
    manager: manager.membership.id,
    exec1: exec1.membership.id,
    exec2: exec2.membership.id,
    exec3: exec3.membership.id,
  };
  return { orgId, ctx, m, source, status };
}

let phone = 9810000000;
const nextMobile = () => String((phone += 1));

describe("lead assignment (M05)", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  const lead = async (id: string) =>
    prisma.lead.findUniqueOrThrow({ where: { id }, include: { status: true } });

  beforeAll(async () => {
    env = await setup();
  });

  afterAll(async () => {
    await stopBoss();
  });

  it("seeds reason categories once and lets executives own what they create", async () => {
    expect(await listReassignmentReasons(env.ctx.admin)).toHaveLength(7);

    const own = await createLead(env.ctx.exec1, { name: "Self Made", mobile: nextMobile() });
    const created = await lead(own.id);
    expect(created.ownerId).toBe(env.m.exec1);
    expect(created.status.key).toBe("ASSIGNED");
    expect(created.ownerAssignedAt).not.toBeNull();
    const history = await listAssignmentHistory(env.ctx.exec1, own.id);
    expect(history).toMatchObject([
      { kind: "ASSIGN", method: "CREATOR", assigneeName: "Esha Exec", endedAt: null },
    ]);

    const byAdmin = await createLead(env.ctx.admin, { name: "Walk In", mobile: nextMobile() });
    expect((await lead(byAdmin.id)).ownerId).toBeNull();
    expect(await listAssignmentHistory(env.ctx.admin, byAdmin.id)).toEqual([]);
  });

  it("lets managers assign within their team only, with history, status, audit and event", async () => {
    const { id } = await createLead(env.ctx.admin, { name: "Queue Lead", mobile: nextMobile() });

    await expect(
      assignLead(env.ctx.exec1, { leadId: id, assigneeId: env.m.exec1, expectedOwnerId: null }),
    ).rejects.toBeInstanceOf(NotFoundError); // executives do not even see unassigned leads
    await expect(
      assignLead(env.ctx.manager, { leadId: id, assigneeId: env.m.exec3, expectedOwnerId: null }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(
      (await listAssignableMembers(env.ctx.manager)).map((member) => member.membershipId).sort(),
    ).toEqual([env.m.manager, env.m.exec1, env.m.exec2].sort());

    const result = await assignLead(env.ctx.manager, {
      leadId: id,
      assigneeId: env.m.exec1,
      expectedOwnerId: null,
    });
    expect(result.kind).toBe("ASSIGN");
    const assigned = await lead(id);
    expect(assigned.ownerId).toBe(env.m.exec1);
    expect(assigned.status.key).toBe("ASSIGNED");

    const activity = await prisma.leadActivity.findFirstOrThrow({
      where: { leadId: id, type: "ASSIGNED" },
    });
    expect(activity.summary).toBe("Assigned to Esha Exec");
    expect(activity.actorName).toBe("Meera Manager");
    await prisma.auditLog.findFirstOrThrow({ where: { action: "lead.assign", entityId: id } });
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: "lead.assigned", payload: { path: ["leadId"], equals: id } },
    });
    expect(event.payload).toMatchObject({ assigneeId: env.m.exec1, method: "MANUAL" });
  });

  it("requires a reason to reassign and keeps every change", async () => {
    const { id } = await createLead(env.ctx.exec1, { name: "Moving Lead", mobile: nextMobile() });
    const reasons = await listReassignmentReasons(env.ctx.admin, { activeOnly: true });
    const balancing = reasons.find((reason) => reason.label === "Workload balancing")!;

    await expect(
      assignLead(env.ctx.manager, {
        leadId: id,
        assigneeId: env.m.exec2,
        expectedOwnerId: env.m.exec1,
      }),
    ).rejects.toThrow(/reason/);
    await expect(
      assignLead(env.ctx.manager, {
        leadId: id,
        assigneeId: env.m.exec1,
        expectedOwnerId: env.m.exec1,
        reason: "Same person again",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      assignLead(env.ctx.exec1, {
        leadId: id,
        assigneeId: env.m.exec2,
        expectedOwnerId: env.m.exec1,
        reason: "I am on leave",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const before = await lead(id);
    await assignLead(env.ctx.manager, {
      leadId: id,
      assigneeId: env.m.exec2,
      expectedOwnerId: env.m.exec1,
      reason: "Esha has too many site visits",
      reasonId: balancing.id,
    });
    const after = await lead(id);
    expect(after.ownerId).toBe(env.m.exec2);
    expect(after.ownerAssignedAt!.getTime()).toBeGreaterThanOrEqual(
      before.ownerAssignedAt!.getTime(),
    );

    const history = await listAssignmentHistory(env.ctx.manager, id);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      kind: "REASSIGN",
      previousOwnerName: "Esha Exec",
      assigneeName: "Ravi Exec",
      reason: "Esha has too many site visits",
      reasonLabel: "Workload balancing",
      assignedByName: "Meera Manager",
      endedAt: null,
    });
    expect(history[1]!.endedAt).not.toBeNull();
    await expect(deleteReassignmentReason(env.ctx.admin, balancing.id)).rejects.toBeInstanceOf(
      ConflictError,
    );

    // Out of the manager's team: another manager cannot touch it.
    const otherTeam = await createLead(env.ctx.exec3, { name: "Other Team", mobile: nextMobile() });
    await expect(
      assignLead(env.ctx.manager, {
        leadId: otherTeam.id,
        assigneeId: env.m.exec1,
        expectedOwnerId: env.m.exec3,
        reason: "Taking it over",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lets only the first of two concurrent reassignments win", async () => {
    const { id } = await createLead(env.ctx.exec1, { name: "Race Lead", mobile: nextMobile() });
    const results = await Promise.allSettled([
      assignLead(env.ctx.manager, {
        leadId: id,
        assigneeId: env.m.exec2,
        expectedOwnerId: env.m.exec1,
        reason: "First manager click",
      }),
      assignLead(env.ctx.admin, {
        leadId: id,
        assigneeId: env.m.manager,
        expectedOwnerId: env.m.exec1,
        reason: "Second manager click",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictError);
    const open = await prisma.leadAssignment.count({ where: { leadId: id, endedAt: null } });
    expect(open).toBe(1);
  });

  it("returns leads to the queue", async () => {
    const { id } = await createLead(env.ctx.exec1, { name: "Back To Queue", mobile: nextMobile() });
    await unassignLead(env.ctx.manager, {
      leadId: id,
      expectedOwnerId: env.m.exec1,
      reason: "Customer wants a Marathi speaker",
    });
    const back = await lead(id);
    expect(back.ownerId).toBeNull();
    expect(back.ownerAssignedAt).toBeNull();
    expect(back.status.key).toBe("NEW");
    const queue = await listUnassignedQueue(env.ctx.manager, everything);
    expect(queue.rows.map((row) => row.id)).toContain(id);
    await prisma.outboxEvent.findFirstOrThrow({
      where: { type: "lead.unassigned", payload: { path: ["leadId"], equals: id } },
    });
  });

  it("shares a bulk selection in turn and reports what it could not move", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      ids.push(
        (await createLead(env.ctx.admin, { name: `Bulk ${index}`, mobile: nextMobile() })).id,
      );
    }
    const owned = await createLead(env.ctx.exec1, { name: "Bulk Owned", mobile: nextMobile() });
    const otherTeam = await createLead(env.ctx.exec3, { name: "Bulk Other", mobile: nextMobile() });

    const result = await bulkAssign(env.ctx.manager, {
      leadIds: [...ids, owned.id, otherTeam.id],
      assigneeIds: [env.m.exec1, env.m.exec2],
    });
    expect(result.assigned).toBe(4);
    expect(result.skipped.map((entry) => entry.leadId).sort()).toEqual(
      [owned.id, otherTeam.id].sort(),
    );
    expect(result.skipped.find((entry) => entry.leadId === owned.id)?.reason).toMatch(/reason/);
    const owners = await prisma.lead.findMany({
      where: { id: { in: ids } },
      select: { ownerId: true },
    });
    expect(owners.filter((row) => row.ownerId === env.m.exec1)).toHaveLength(2);
    expect(owners.filter((row) => row.ownerId === env.m.exec2)).toHaveLength(2);
  });

  it("assigns new leads by rules, fairly even when they arrive at the same time", async () => {
    const rule = await saveAssignmentRule(env.ctx.admin, null, {
      name: "Portal leads",
      priority: 10,
      sourceIds: [env.source("99acres")],
      strategy: "ROUND_ROBIN",
      memberIds: [env.m.exec1, env.m.exec2],
    });
    await expect(
      saveAssignmentRule(env.ctx.admin, null, { name: "Bad", memberIds: [env.m.admin, "x"] }),
    ).rejects.toBeInstanceOf(ValidationError);

    const created = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        createLead(env.ctx.admin, {
          name: `Portal ${index}`,
          mobile: nextMobile(),
          sourceId: env.source("99acres"),
        }),
      ),
    );
    const owners = await prisma.lead.findMany({
      where: { id: { in: created.map((entry) => entry.id) } },
      select: { ownerId: true },
    });
    expect(owners.filter((row) => row.ownerId === env.m.exec1)).toHaveLength(3);
    expect(owners.filter((row) => row.ownerId === env.m.exec2)).toHaveLength(3);
    const history = await listAssignmentHistory(env.ctx.admin, created[0]!.id);
    expect(history[0]).toMatchObject({
      method: "RULE",
      ruleName: "Portal leads",
      assignedByName: "Asha Admin",
    });
    expect(
      (await prisma.assignmentRule.findUniqueOrThrow({ where: { id: rule.id } })).assignedCount,
    ).toBe(6);

    // Leads from other sources are not matched and wait in the queue.
    const walkIn = await createLead(env.ctx.admin, {
      name: "Walk In Again",
      mobile: nextMobile(),
      sourceId: env.source("walk-in"),
    });
    expect((await lead(walkIn.id)).ownerId).toBeNull();

    // "Least loaded" picks whoever has fewer open leads.
    await saveAssignmentRule(env.ctx.admin, rule.id, {
      name: "Portal leads",
      priority: 10,
      sourceIds: [env.source("99acres")],
      strategy: "LEAST_LOADED",
      memberIds: [env.m.exec1, env.m.manager],
    });
    const next = await createLead(env.ctx.admin, {
      name: "Least Loaded",
      mobile: nextMobile(),
      sourceId: env.source("99acres"),
    });
    expect((await lead(next.id)).ownerId).toBe(env.m.manager);
    await prisma.assignmentRule.update({ where: { id: rule.id }, data: { isActive: false } });
  });

  it("assigns to the person chosen on the form, within the creator's team", async () => {
    const chosen = await createLead(env.ctx.manager, {
      name: "Chosen Owner",
      mobile: nextMobile(),
      assigneeId: env.m.exec2,
    });
    expect((await lead(chosen.id)).ownerId).toBe(env.m.exec2);
    await expect(
      createLead(env.ctx.manager, {
        name: "Wrong Team",
        mobile: nextMobile(),
        assigneeId: env.m.exec3,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("counts open, untouched and unworked leads per member", async () => {
    const stale = await createLead(env.ctx.exec2, { name: "Stale Lead", mobile: nextMobile() });
    await prisma.lead.update({
      where: { id: stale.id },
      data: {
        ownerAssignedAt: new Date(Date.now() - 48 * 3600 * 1000),
        lastActivityAt: new Date(Date.now() - 49 * 3600 * 1000),
      },
    });
    const worked = await createLead(env.ctx.exec2, { name: "Worked Lead", mobile: nextMobile() });
    await changeLeadStatus(env.ctx.exec2, worked.id, { statusId: env.status("CONTACTED").id });

    const workload = await getTeamWorkload(env.ctx.manager);
    expect(workload.rows.map((row) => row.name).sort()).toEqual([
      "Esha Exec",
      "Meera Manager",
      "Ravi Exec",
    ]);
    const ravi = workload.rows.find((row) => row.membershipId === env.m.exec2)!;
    expect(ravi.unworked).toBe(1);
    expect(ravi.byCategory.ACTIVE).toBeGreaterThanOrEqual(1);
    expect(ravi.open).toBe(ravi.byCategory.OPEN + ravi.byCategory.ACTIVE + ravi.byCategory.BOOKING);
    expect(ravi.untouched).toBe(ravi.byCategory.OPEN);
    expect(workload.unassigned.open).toBeGreaterThan(0);
    await expect(getTeamWorkload(env.ctx.exec1)).rejects.toBeInstanceOf(ForbiddenError);

    const drillDown = await listLeads(env.ctx.manager, everything, {
      ownerId: env.m.exec2,
      unworkedHours: 24,
      timezone: "Asia/Kolkata",
    });
    expect(drillDown.rows.map((row) => row.id)).toEqual([stale.id]);
  });

  it("hands a leaving member's open leads over before deactivating them", async () => {
    const open1 = await createLead(env.ctx.exec1, { name: "Handover 1", mobile: nextMobile() });
    const closed = await createLead(env.ctx.exec1, {
      name: "Handover Closed",
      mobile: nextMobile(),
    });
    const lossReason = await prisma.lossReason.findFirstOrThrow({
      where: { organizationId: env.orgId, key: "BOUGHT_ELSEWHERE" },
    });
    await changeLeadStatus(env.ctx.exec1, closed.id, {
      statusId: env.status("LOST").id,
      reason: "Bought elsewhere",
      details: { lossReasonId: lossReason.id },
    });
    const openBefore = await prisma.lead.count({
      where: {
        ownerId: env.m.exec1,
        deletedAt: null,
        status: { category: { in: ["OPEN", "ACTIVE", "BOOKING"] } },
      },
    });

    await expect(
      handOverAndDeactivate(env.ctx.manager, {
        membershipId: env.m.exec1,
        assigneeIds: [env.m.exec2],
        reason: "Left the company",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const result = await handOverAndDeactivate(env.ctx.admin, {
      membershipId: env.m.exec1,
      assigneeIds: [env.m.exec2, env.m.manager],
      reason: "Left the company",
    });
    expect(result).toMatchObject({ assigned: openBefore, deactivated: true, skipped: [] });
    expect((await lead(open1.id)).ownerId).not.toBe(env.m.exec1);
    expect((await lead(closed.id)).ownerId).toBe(env.m.exec1);
    const membership = await prisma.membership.findUniqueOrThrow({ where: { id: env.m.exec1 } });
    expect(membership.status).toBe("INACTIVE");
    const history = await listAssignmentHistory(env.ctx.admin, open1.id);
    expect(history[0]).toMatchObject({ method: "DEACTIVATION", reason: "Left the company" });
  });

  it("can stop giving executives their own leads", async () => {
    await updateAssignmentSettings(env.ctx.admin, { assignCreator: false });
    const { id } = await createLead(env.ctx.exec2, { name: "No Self Owner", mobile: nextMobile() });
    expect((await lead(id)).ownerId).toBeNull();
    await updateAssignmentSettings(env.ctx.admin, { assignCreator: true });
  });
});
