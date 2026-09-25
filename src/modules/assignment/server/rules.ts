import type { AssignmentStrategy, LeadChannel } from "@/generated/prisma/enums";
import { listProjectOptions } from "@/modules/catalog";
import { findMembers } from "@/modules/identity";
import { countOpenLeadsByOwner, listCampaigns, listLeadSources } from "@/modules/leads";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { ASSIGNMENT_PERMISSIONS } from "../permissions";
import { type AssignmentRuleInput, assignmentRuleSchema } from "../schemas";
import { eligibleOwners } from "./core";

/**
 * Automatic assignment rules (M05-10, a should-have of Q-06): new leads that nobody assigned are matched against the
 * active rules in priority order; the first matching rule gives the lead to one of its members, in turn (round
 * robin) or to whoever has the fewest open leads. The rule row is locked while choosing, so concurrent imports and
 * API calls still take turns fairly.
 */
export interface RuleRow {
  id: string;
  name: string;
  isActive: boolean;
  priority: number;
  strategy: AssignmentStrategy;
  channels: LeadChannel[];
  sources: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  members: { id: string; name: string; active: boolean }[];
  assignedCount: number;
}

export async function listAssignmentRules(ctx: ServiceContext): Promise<RuleRow[]> {
  ctx.permissions.assert(ASSIGNMENT_PERMISSIONS.rulesManage);
  const [rules, sources, campaigns, projects, members] = await Promise.all([
    ctx.db.assignmentRule.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
    listLeadSources(ctx),
    listCampaigns(ctx),
    listProjectOptions(ctx),
    findMembers(ctx.db),
  ]);
  const pick = <T extends { id: string; name: string }>(list: T[], ids: string[]) =>
    ids
      .map((id) => list.find((entry) => entry.id === id))
      .filter((entry): entry is T => Boolean(entry))
      .map(({ id, name }) => ({ id, name }));
  return rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    isActive: rule.isActive,
    priority: rule.priority,
    strategy: rule.strategy,
    channels: rule.channels,
    sources: pick(sources, rule.sourceIds),
    campaigns: pick(campaigns, rule.campaignIds),
    projects: pick(projects, rule.projectIds),
    members: rule.memberIds
      .map((id) => members.find((member) => member.membershipId === id))
      .filter((member): member is (typeof members)[number] => Boolean(member))
      .map((member) => ({
        id: member.membershipId,
        name: member.name,
        active: member.status === "ACTIVE",
      })),
    assignedCount: rule.assignedCount,
  }));
}

async function validateRule(ctx: ServiceContext, values: AssignmentRuleInput) {
  const [sources, campaigns, projects] = await Promise.all([
    listLeadSources(ctx),
    listCampaigns(ctx),
    listProjectOptions(ctx, { includeIds: values.projectIds }),
  ]);
  const check = (field: string, ids: string[] | undefined, known: { id: string }[]) => {
    if (ids?.some((id) => !known.some((entry) => entry.id === id))) {
      throw new ValidationError("Some of the chosen entries no longer exist.", {
        [field]: ["Unknown entries"],
      });
    }
  };
  check("sourceIds", values.sourceIds, sources);
  check("campaignIds", values.campaignIds, campaigns);
  check("projectIds", values.projectIds, projects);
  const eligible = await eligibleOwners(ctx.db, values.memberIds);
  if (eligible.size !== new Set(values.memberIds).size) {
    throw new ValidationError("Every member must be an active user who works on leads.", {
      memberIds: ["Not all members can own leads"],
    });
  }
}

export async function saveAssignmentRule(
  ctx: ServiceContext,
  ruleId: string | null,
  input: AssignmentRuleInput,
): Promise<{ id: string }> {
  ctx.permissions.assert(ASSIGNMENT_PERMISSIONS.rulesManage);
  const values = parseInput(assignmentRuleSchema, input);
  await validateRule(ctx, values);
  const data = {
    ...values,
    sourceIds: [...new Set(values.sourceIds)],
    campaignIds: [...new Set(values.campaignIds)],
    projectIds: [...new Set(values.projectIds)],
    memberIds: [...new Set(values.memberIds)],
    channels: [...new Set(values.channels)],
  };
  return ctx.db.$transaction(async (tx) => {
    if (ruleId) {
      const before = await tx.assignmentRule.findFirst({ where: { id: ruleId } });
      if (!before) throw new NotFoundError("Assignment rule", ruleId);
      await tx.assignmentRule.update({ where: { id: ruleId }, data });
      await recordAudit(tx, ctx, {
        action: "assignment.rule.update",
        entityType: "AssignmentRule",
        entityId: ruleId,
        summary: `Updated assignment rule "${values.name}"`,
        before: {
          name: before.name,
          isActive: before.isActive,
          priority: before.priority,
          strategy: before.strategy,
          channels: before.channels,
          sourceIds: before.sourceIds,
          campaignIds: before.campaignIds,
          projectIds: before.projectIds,
          memberIds: before.memberIds,
        },
        after: data,
      });
      return { id: ruleId };
    }
    const rule = await tx.assignmentRule.create({
      data: { organizationId: ctx.organizationId, ...data, createdByName: ctx.actor.name },
    });
    await recordAudit(tx, ctx, {
      action: "assignment.rule.create",
      entityType: "AssignmentRule",
      entityId: rule.id,
      summary: `Created assignment rule "${values.name}"`,
      metadata: data,
    });
    return { id: rule.id };
  });
}

/** Rules that assigned leads stay for the history — deactivate them instead. */
export async function deleteAssignmentRule(ctx: ServiceContext, ruleId: string): Promise<void> {
  ctx.permissions.assert(ASSIGNMENT_PERMISSIONS.rulesManage);
  await ctx.db.$transaction(async (tx) => {
    const rule = await tx.assignmentRule.findFirst({
      where: { id: ruleId },
      include: { _count: { select: { assignments: true } } },
    });
    if (!rule) throw new NotFoundError("Assignment rule", ruleId);
    if (rule._count.assignments > 0) {
      throw new ConflictError(
        `"${rule.name}" has assigned leads and stays for the history. Deactivate it instead.`,
      );
    }
    await tx.assignmentRule.delete({ where: { id: ruleId } });
    await recordAudit(tx, ctx, {
      action: "assignment.rule.delete",
      entityType: "AssignmentRule",
      entityId: ruleId,
      summary: `Deleted assignment rule "${rule.name}"`,
    });
  });
}

export interface RuleCandidate {
  channel: LeadChannel;
  sourceId: string | null;
  campaignId: string | null;
  projectIds: string[];
}

const matches = (wanted: readonly string[], value: string | null) =>
  wanted.length === 0 || (value !== null && wanted.includes(value));

/**
 * Finds the first matching active rule and picks its member for the lead (inside the caller's transaction).
 * Rules whose members are all unavailable are skipped. Returns null when no rule applies.
 */
export async function pickByRules(
  tx: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
  lead: RuleCandidate,
): Promise<{ ruleId: string; ruleName: string; memberId: string } | null> {
  const rules = await tx.assignmentRule.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  for (const rule of rules) {
    if (!matches(rule.channels, lead.channel)) continue;
    if (!matches(rule.sourceIds, lead.sourceId)) continue;
    if (!matches(rule.campaignIds, lead.campaignId)) continue;
    if (rule.projectIds.length && !lead.projectIds.some((id) => rule.projectIds.includes(id))) {
      continue;
    }
    // Serialize concurrent assignments by the same rule so turns are taken fairly.
    await tx.$queryRaw`
      SELECT "id" FROM "assignment_rules"
      WHERE "id" = ${rule.id}::uuid AND "organization_id" = ${ctx.organizationId}::uuid
      FOR UPDATE`;
    const locked = await tx.assignmentRule.findFirst({ where: { id: rule.id } });
    if (!locked?.isActive) continue;
    const eligible = await eligibleOwners(tx, locked.memberIds);
    const members = locked.memberIds.filter((id) => eligible.has(id));
    if (members.length === 0) continue;

    // Round robin order starts after the member who got the previous lead.
    const pointer = locked.lastAssignedMemberId ? members.indexOf(locked.lastAssignedMemberId) : -1;
    const order = members.map((_, index) => members[(pointer + 1 + index) % members.length]!);
    let memberId = order[0]!;
    if (locked.strategy === "LEAST_LOADED") {
      const load = await countOpenLeadsByOwner(tx, members);
      memberId = order.reduce((best, id) =>
        (load.get(id) ?? 0) < (load.get(best) ?? 0) ? id : best,
      );
    }
    await tx.assignmentRule.update({
      where: { id: locked.id },
      data: { lastAssignedMemberId: memberId, assignedCount: { increment: 1 } },
    });
    return { ruleId: locked.id, ruleName: locked.name, memberId };
  }
  return null;
}
