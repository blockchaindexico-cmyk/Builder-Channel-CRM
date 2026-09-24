import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toTableQuery } from "@/lib/table-query";
import { listAuditLogs, listRecentActivityForUser } from "@/modules/identity/server/audit-log";
import {
  createMember as inviteMember,
  deactivateMember,
  getMember,
  listMembers,
  reactivateMember,
  updateMember,
} from "@/modules/identity/server/members";
import {
  createRole,
  getRole,
  setRolePermissions,
  syncSystemRoles,
} from "@/modules/identity/server/roles";
import {
  listMySessions,
  revokeMyOtherSessions,
  revokeMySession,
} from "@/modules/identity/server/sessions";
import { getTeamTree } from "@/modules/identity/server/team";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { stopBoss } from "@/platform/jobs/boss";
import { resolveDataScope } from "@/platform/rbac/scope";

import { contextFor, createMember, createOrganizationWithRoles } from "../support/identity";

const page = toTableQuery({ page: 1, pageSize: 100, sort: "", q: "" }, { sortable: ["name"] });

describe("identity: roles, scopes and members (M02)", () => {
  let org: Awaited<ReturnType<typeof createOrganizationWithRoles>>;
  let admin: Awaited<ReturnType<typeof createMember>>;
  let manager: Awaited<ReturnType<typeof createMember>>;
  let seniorExec: Awaited<ReturnType<typeof createMember>>;
  let juniorExec: Awaited<ReturnType<typeof createMember>>;
  let otherManager: Awaited<ReturnType<typeof createMember>>;
  let otherExec: Awaited<ReturnType<typeof createMember>>;

  beforeAll(async () => {
    org = await createOrganizationWithRoles();
    const { organization, role } = org;
    admin = await createMember(organization.id, role("admin").id, { name: "Asha Admin" });
    manager = await createMember(organization.id, role("manager").id, {
      name: "Meera Manager",
      reportsToId: admin.membership.id,
    });
    seniorExec = await createMember(organization.id, role("executive").id, {
      name: "Sam Senior",
      reportsToId: manager.membership.id,
    });
    juniorExec = await createMember(organization.id, role("executive").id, {
      name: "Jay Junior",
      reportsToId: seniorExec.membership.id,
    });
    otherManager = await createMember(organization.id, role("manager").id, {
      name: "Omar Other",
      reportsToId: admin.membership.id,
    });
    otherExec = await createMember(organization.id, role("executive").id, {
      name: "Olga Other",
      reportsToId: otherManager.membership.id,
    });
  });

  afterAll(async () => {
    await stopBoss({ graceful: false });
    await prisma.$disconnect();
  });

  describe("system roles (M02-06)", () => {
    it("grants admin everything, manager team-scoped defaults and executive nothing extra", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      const managerCtx = await contextFor(manager.membership.id);
      const execCtx = await contextFor(seniorExec.membership.id);
      expect(adminCtx.permissions.has("users.manage")).toBe(true);
      expect(adminCtx.permissions.scope("users.view")).toBe("ALL");
      expect(managerCtx.permissions.scope("users.view")).toBe("TEAM");
      expect(managerCtx.permissions.has("users.manage")).toBe(false);
      expect(managerCtx.permissions.has("settings.access")).toBe(false);
      expect(execCtx.permissions.scope("users.view")).toBeNull();
    });

    it("is idempotent and preserves admin edits for already-seeded permissions", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      const managerRole = org.role("manager");
      await setRolePermissions(adminCtx, managerRole.id, { grants: [] });
      await syncSystemRoles(createTenantDb(org.organization.id), org.organization.id);
      expect((await getRole(adminCtx, managerRole.id)).grants).toEqual([]);
      await setRolePermissions(adminCtx, managerRole.id, {
        grants: [{ permission: "users.view", scope: "TEAM" }],
      });
    });

    it("refuses to edit the admin role and unknown permissions", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      await expect(
        setRolePermissions(adminCtx, org.role("admin").id, { grants: [] }),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        setRolePermissions(adminCtx, org.role("manager").id, {
          grants: [{ permission: "made.up", scope: null }],
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("creates custom roles copied from another role", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      const role = await createRole(adminCtx, {
        name: "Team Lead",
        copyFromRoleId: org.role("manager").id,
      });
      const details = await getRole(adminCtx, role.id);
      expect(details.key).toBe("team-lead");
      expect(details.grants).toEqual([{ permission: "users.view", scope: "TEAM" }]);
      const again = await createRole(adminCtx, { name: "Team Lead" });
      expect(again.key).toBe("team-lead-2");
    });
  });

  describe("data scope (M02-08)", () => {
    it("resolves TEAM as the whole reporting subtree (multi-level)", async () => {
      const managerCtx = await contextFor(manager.membership.id);
      const scope = await resolveDataScope(managerCtx, "users.view");
      expect(scope.scope).toBe("TEAM");
      if (scope.scope === "ALL") throw new Error("unexpected");
      expect(new Set(scope.membershipIds)).toEqual(
        new Set([manager.membership.id, seniorExec.membership.id, juniorExec.membership.id]),
      );
    });

    it("limits member lists and details to the manager's team", async () => {
      const managerCtx = await contextFor(manager.membership.id);
      const { rows } = await listMembers(managerCtx, page);
      expect(rows.map((r) => r.name).sort()).toEqual(["Jay Junior", "Meera Manager", "Sam Senior"]);
      await expect(getMember(managerCtx, otherExec.membership.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      const adminCtx = await contextFor(admin.membership.id);
      expect((await listMembers(adminCtx, page)).total).toBe(6);
    });

    it("denies executives without users.view", async () => {
      const execCtx = await contextFor(seniorExec.membership.id);
      await expect(listMembers(execCtx, page)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("builds the team tree within scope", async () => {
      const managerCtx = await contextFor(manager.membership.id);
      const tree = await getTeamTree(managerCtx);
      expect(tree.total).toBe(3);
      expect(tree.roots).toHaveLength(1);
      expect(tree.roots[0]?.name).toBe("Meera Manager");
      expect(tree.roots[0]?.children[0]?.children[0]?.name).toBe("Jay Junior");
    });
  });

  describe("member management (M02-10 → M02-13)", () => {
    it("invites a user: INVITED membership, audit entry and domain event", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      const result = await inviteMember(adminCtx, {
        name: "Nina New",
        email: "  Nina.New@Test.Local ",
        phone: "+91 98200 55555",
        roleId: org.role("executive").id,
        reportsToId: manager.membership.id,
        employeeCode: "EMP-900",
        designation: "Sales Executive",
      });
      expect(result.member.email).toBe("nina.new@test.local");
      expect(result.member.status).toBe("INVITED");
      expect(result.member.reportsToName).toBe("Meera Manager");
      expect(result.invitationSent).toBe(true);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { organizationId: org.organization.id, action: "member.create" },
      });
      expect(audit.summary).toContain("Nina New");
      const event = await prisma.outboxEvent.findFirstOrThrow({
        where: { organizationId: org.organization.id, type: "member.invited" },
      });
      expect((event.payload as { membershipId: string }).membershipId).toBe(
        result.member.membershipId,
      );
      const token = await prisma.verification.findFirst({ where: { value: result.member.userId } });
      expect(token?.identifier).toMatch(/^reset-password:/);
    });

    it("rejects duplicate e-mails and employee codes", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      await expect(
        inviteMember(adminCtx, {
          name: "Dup",
          email: "nina.new@test.local",
          roleId: org.role("executive").id,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        inviteMember(adminCtx, {
          name: "Dup Code",
          email: "dup.code@test.local",
          roleId: org.role("executive").id,
          employeeCode: "EMP-900",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("prevents circular reporting lines", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      await expect(
        updateMember(adminCtx, manager.membership.id, {
          name: "Meera Manager",
          roleId: org.role("manager").id,
          reportsToId: juniorExec.membership.id,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        updateMember(adminCtx, manager.membership.id, {
          name: "Meera Manager",
          roleId: org.role("manager").id,
          reportsToId: manager.membership.id,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("records role changes with previous values", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      const updated = await updateMember(adminCtx, seniorExec.membership.id, {
        name: "Sam Senior",
        roleId: org.role("manager").id,
        reportsToId: manager.membership.id,
        designation: "Team Lead",
      });
      expect(updated.roleName).toBe("Manager");
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          organizationId: org.organization.id,
          action: "member.role_change",
          entityId: seniorExec.user.id,
        },
      });
      expect(audit.changes).toMatchObject({
        role: { from: "Executive", to: "Manager" },
        designation: { from: null, to: "Team Lead" },
      });
    });

    it("protects the last active admin", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      await expect(deactivateMember(adminCtx, admin.membership.id)).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(
        updateMember(adminCtx, admin.membership.id, {
          name: "Asha Admin",
          roleId: org.role("manager").id,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("deactivation ends sessions, blocks access and is reversible", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      await prisma.session.create({
        data: {
          token: `t-${otherExec.user.id}`,
          userId: otherExec.user.id,
          expiresAt: new Date(Date.now() + 3600_000),
          activeOrganizationId: org.organization.id,
        },
      });
      await deactivateMember(adminCtx, otherExec.membership.id);
      const member = await prisma.membership.findUniqueOrThrow({
        where: { id: otherExec.membership.id },
      });
      expect(member.status).toBe("INACTIVE");
      expect(await prisma.session.count({ where: { userId: otherExec.user.id } })).toBe(0);

      const reactivated = await reactivateMember(adminCtx, otherExec.membership.id);
      expect(reactivated.status).toBe("ACTIVE");
    });

    it("managers cannot manage users", async () => {
      const managerCtx = await contextFor(manager.membership.id);
      await expect(deactivateMember(managerCtx, juniorExec.membership.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("audit log viewer (M02-18)", () => {
    it("lists entries with filters and requires audit.view", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      const all = await listAuditLogs(adminCtx, page, { timezone: "UTC" });
      expect(all.total).toBeGreaterThan(3);
      const roles = await listAuditLogs(adminCtx, page, { timezone: "UTC", entityType: "Role" });
      expect(roles.rows.every((row) => row.entityType === "Role")).toBe(true);
      const deactivations = await listAuditLogs(adminCtx, page, {
        timezone: "UTC",
        action: "member.deactivate",
      });
      expect(deactivations.total).toBeGreaterThan(0);
      expect(deactivations.rows.every((row) => row.action === "member.deactivate")).toBe(true);
      const managerCtx = await contextFor(manager.membership.id);
      await expect(listAuditLogs(managerCtx, page, { timezone: "UTC" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it("ignores malformed id filters instead of failing", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      const all = await listAuditLogs(adminCtx, page, { timezone: "UTC" });
      const filtered = await listAuditLogs(adminCtx, page, { timezone: "UTC", actorId: "nope" });
      expect(filtered.total).toBe(all.total);
      const members = await listMembers(adminCtx, page, { roleId: "x", reportsToId: "y" });
      expect(members.total).toBeGreaterThan(0);
    });

    it("shows recent activity about and by a user", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      const activity = await listRecentActivityForUser(adminCtx, otherExec.user.id);
      expect(activity.length).toBeGreaterThan(0);
      expect(
        activity.every(
          (row) => row.entityId === otherExec.user.id || row.actorId === otherExec.user.id,
        ),
      ).toBe(true);
    });
  });

  describe("members filter by reporting manager (M02-10)", () => {
    it("lists direct reports of a manager", async () => {
      const adminCtx = await contextFor(admin.membership.id);
      const { rows } = await listMembers(adminCtx, page, { reportsToId: manager.membership.id });
      expect(rows.map((row) => row.name)).toEqual(["Nina New", "Sam Senior"]);
    });
  });

  describe("own sessions (M02-16)", () => {
    async function createSession(userId: string, organizationId: string | null) {
      return prisma.session.create({
        data: {
          userId,
          token: `test-${crypto.randomUUID()}`,
          expiresAt: new Date(Date.now() + 3_600_000),
          activeOrganizationId: organizationId,
          userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0",
        },
      });
    }

    it("lists, revokes one and revokes all other sessions of the signed-in user only", async () => {
      const organizationId = org.organization.id;
      const current = await createSession(otherExec.user.id, organizationId);
      const laptop = await createSession(otherExec.user.id, organizationId);
      const phone = await createSession(otherExec.user.id, organizationId);
      const someoneElse = await createSession(juniorExec.user.id, organizationId);
      const ctx = await contextFor(otherExec.membership.id);

      const sessions = await listMySessions(ctx, current.id);
      expect(sessions).toHaveLength(3);
      expect(sessions[0]).toMatchObject({ id: current.id, current: true });

      // Another user's session and the current session cannot be revoked here.
      await expect(revokeMySession(ctx, someoneElse.id, current.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(revokeMySession(ctx, current.id, current.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );

      await revokeMySession(ctx, laptop.id, current.id);
      expect(await prisma.session.findUnique({ where: { id: laptop.id } })).toBeNull();

      expect(await revokeMyOtherSessions(ctx, current.id)).toBe(1);
      expect(await prisma.session.findUnique({ where: { id: phone.id } })).toBeNull();
      expect(await prisma.session.findUnique({ where: { id: current.id } })).not.toBeNull();
      expect(await prisma.session.findUnique({ where: { id: someoneElse.id } })).not.toBeNull();

      const audit = await prisma.auditLog.findMany({
        where: {
          organizationId,
          actorId: otherExec.user.id,
          action: { startsWith: "auth.session" },
        },
      });
      expect(audit.map((row) => row.action).sort()).toEqual([
        "auth.session_revoked",
        "auth.sessions_revoked",
      ]);
    });
  });
});
