import type { Prisma } from "@/generated/prisma/client";
import type { CallDirection, CallOutcomeCategory } from "@/generated/prisma/enums";
import { type DateRange, toUtcBounds } from "@/lib/date-range";
import type { TableQuery } from "@/lib/table-query";
import {
  findVisibleLead,
  isLeadInScope,
  LEAD_PERMISSIONS,
  leadScopeWhere,
  recordLeadActivity,
  setLeadEngagement,
  setLeadStatusByKey,
} from "@/modules/leads";
import { getRegionalSettings } from "@/modules/organization";
import { recordAudit } from "@/platform/audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { publishEvent } from "@/platform/events/publish";
import { resolveDataScope } from "@/platform/rbac/scope";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput, uuidOrNull } from "@/platform/validation";

import { ACTIVITY_TYPES, CALL_DIRECTIONS, OPEN_FOLLOW_UP_STATUSES } from "../constants";
import { ACTIVITY_PERMISSIONS } from "../permissions";
import { type LogCallInput, logCallSchema } from "../schemas";
import { suggestStatusAfterCall } from "../status-rules";
import { completeFollowUpInTx, refreshNextFollowUp, scheduleFollowUpInTx } from "./follow-ups";
import { getActivitySettings } from "./settings";

/** "4 min 05 s" / "45 s". */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes
    ? `${minutes} min${rest ? ` ${String(rest).padStart(2, "0")} s` : ""}`
    : `${rest} s`;
}

export interface LoggedCall {
  id: string;
  status: { from: string; to: string } | null;
  nextFollowUpId: string | null;
  completedFollowUpId: string | null;
}

/**
 * Logs a call with its disposition in one step (M07-04 → M07-07): the call record, the lead's call summary, the
 * timeline, an optional status change (the person's choice, or the automatic rules when none is given), the
 * follow-up it took care of and the next follow-up or callback — all in one transaction. Outcomes that need a next
 * action refuse to be logged without one while the lead stays open (M07-03).
 */
export async function logCall(
  ctx: ServiceContext,
  input: LogCallInput,
  options: { provider?: string; providerCallId?: string | null } = {},
): Promise<LoggedCall> {
  const values = parseInput(logCallSchema, input);
  const now = new Date();
  const startedAt = values.startedAt ?? now;
  if (startedAt.getTime() > now.getTime() + 5 * 60_000) {
    throw new ValidationError("A call cannot be in the future.", { startedAt: ["In the future"] });
  }
  const interactive = !options.provider || options.provider === "MANUAL";
  return ctx.db.$transaction(async (tx) => {
    const lead = await findVisibleLead(ctx, values.leadId, {
      permission: ACTIVITY_PERMISSIONS.callsLog,
      db: tx,
      include: { status: true },
    });
    const outcome = await tx.callOutcome.findFirst({ where: { id: values.outcomeId } });
    if (!outcome || !outcome.isActive) {
      throw new ValidationError("Choose an active call outcome.", {
        outcomeId: ["Unknown outcome"],
      });
    }
    const settings = await getActivitySettings(tx, ctx);

    const call = await tx.callLog.create({
      data: {
        organizationId: ctx.organizationId,
        leadId: lead.id,
        callerId: ctx.actor.membershipId ?? null,
        callerName: ctx.actor.name,
        direction: values.direction,
        startedAt,
        durationSeconds: values.durationSeconds,
        connected: outcome.connected,
        outcomeId: outcome.id,
        notes: values.notes,
        provider: options.provider ?? "MANUAL",
        providerCallId: options.providerCallId ?? null,
      },
    });

    // Lead call summary (calls logged later for an earlier time do not move it backwards).
    const latest = !lead.lastCallAt || startedAt >= lead.lastCallAt;
    await setLeadEngagement(tx, lead.id, {
      ...(latest ? { lastCallAt: startedAt, lastCallOutcomeId: outcome.id } : {}),
      ...(outcome.connected && (!lead.lastContactedAt || startedAt > lead.lastContactedAt)
        ? { lastContactedAt: startedAt }
        : {}),
      callAttempts: outcome.connected ? 0 : lead.callAttempts + 1,
    });

    const direction = CALL_DIRECTIONS.find((entry) => entry.value === values.direction)!.label;
    const duration = formatDuration(values.durationSeconds);
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: ACTIVITY_TYPES.CALL_LOGGED,
      summary: `${direction} call · ${outcome.label}${duration ? ` · ${duration}` : ""}${
        values.notes ? `: ${values.notes}` : ""
      }`,
      payload: {
        callId: call.id,
        direction: values.direction,
        startedAt: startedAt.toISOString(),
        durationSeconds: values.durationSeconds,
        connected: outcome.connected,
        outcome: { id: outcome.id, label: outcome.label, category: outcome.category },
        notes: values.notes,
      },
    });

    let completedFollowUpId: string | null = null;
    if (values.completeFollowUpId) {
      const followUp = await tx.followUp.findFirst({
        where: { id: values.completeFollowUpId, leadId: lead.id },
      });
      if (!followUp) throw new NotFoundError("Follow-up", values.completeFollowUpId);
      if (!(OPEN_FOLLOW_UP_STATUSES as readonly string[]).includes(followUp.status)) {
        throw new ConflictError("That follow-up was closed meanwhile.");
      }
      if (!(await isLeadInScope(ctx, lead, ACTIVITY_PERMISSIONS.followUpsManage))) {
        throw new ForbiddenError(undefined, ACTIVITY_PERMISSIONS.followUpsManage);
      }
      await completeFollowUpInTx(tx, ctx, followUp, lead, {
        notes: `Call: ${outcome.label}${values.notes ? ` — ${values.notes}` : ""}`,
        callId: call.id,
      });
      completedFollowUpId = followUp.id;
    }

    // Status: the person's choice (null = keep), else the automatic rules for calls reported without a person.
    let status: LoggedCall["status"] = null;
    const reason = values.statusReason ?? values.notes ?? `Call outcome: ${outcome.label}`;
    if (values.statusKey) {
      if (!(await isLeadInScope(ctx, lead, LEAD_PERMISSIONS.changeStatus))) {
        throw new ForbiddenError(undefined, LEAD_PERMISSIONS.changeStatus);
      }
      const changed = await setLeadStatusByKey(tx, ctx, lead.id, values.statusKey, reason, {
        workflow: false,
      });
      if (changed) status = { from: changed.from.label, to: changed.to.label };
    } else if (values.statusKey === undefined && (interactive || settings.autoApplyStatus)) {
      const suggestion = suggestStatusAfterCall(
        {
          statusKey: lead.status.key,
          statusCategory: lead.status.category,
          isTerminal: lead.status.isTerminal,
          callAttempts: lead.callAttempts,
        },
        outcome,
        settings.unresponsiveAfterAttempts,
      );
      if (suggestion) {
        const changed = await setLeadStatusByKey(tx, ctx, lead.id, suggestion, reason).catch(
          (error: unknown) => {
            // An inactive or missing mapped status must not stop the call from being logged.
            if (error instanceof ValidationError || error instanceof NotFoundError) return null;
            throw error;
          },
        );
        if (changed) status = { from: changed.from.label, to: changed.to.label };
      }
    }

    let nextFollowUpId: string | null = null;
    if (values.next) {
      if (!(await isLeadInScope(ctx, lead, ACTIVITY_PERMISSIONS.followUpsManage))) {
        throw new ForbiddenError(undefined, ACTIVITY_PERMISSIONS.followUpsManage);
      }
      const regional = await getRegionalSettings(ctx);
      nextFollowUpId = (
        await scheduleFollowUpInTx(tx, ctx, lead, values.next, { sourceCallId: call.id, regional })
      ).id;
    } else {
      await refreshNextFollowUp(tx, lead.id);
      if (interactive && outcome.requiresNextAction) {
        const current = await tx.lead.findFirst({
          where: { id: lead.id },
          select: { status: { select: { isTerminal: true } } },
        });
        const planned = await tx.followUp.count({
          where: { leadId: lead.id, status: { in: [...OPEN_FOLLOW_UP_STATUSES] } },
        });
        if (!current?.status.isTerminal && planned === 0) {
          throw new ValidationError(
            `After "${outcome.label}", schedule the next follow-up or callback.`,
            { next: ["Schedule the next step"] },
          );
        }
      }
    }

    await recordAudit(tx, ctx, {
      action: "activities.call.log",
      entityType: "CallLog",
      entityId: call.id,
      summary: `${lead.number}: ${direction.toLowerCase()} call, ${outcome.label}${
        status ? ` (status ${status.from} → ${status.to})` : ""
      }`,
    });
    await publishEvent(tx, ctx, "call.logged", {
      callId: call.id,
      leadId: lead.id,
      callerId: call.callerId,
      outcomeId: outcome.id,
      outcomeKey: outcome.key,
      connected: outcome.connected,
    });
    return { id: call.id, status, nextFollowUpId, completedFollowUpId };
  });
}

// --- Lists (M07-06) ------------------------------------------------------------------------------------------------

export interface CallRow {
  id: string;
  lead: { id: string; number: string; name: string };
  callerId: string | null;
  callerName: string;
  direction: CallDirection;
  startedAt: string;
  durationSeconds: number;
  connected: boolean;
  outcome: { id: string; label: string; category: CallOutcomeCategory };
  notes: string | null;
  hasRecording: boolean;
  provider: string;
}

const callInclude = {
  lead: { select: { id: true, number: true, name: true } },
  outcome: { select: { id: true, label: true, category: true } },
} satisfies Prisma.CallLogInclude;

function toCallRow(call: Prisma.CallLogGetPayload<{ include: typeof callInclude }>): CallRow {
  return {
    id: call.id,
    lead: call.lead,
    callerId: call.callerId,
    callerName: call.callerName,
    direction: call.direction,
    startedAt: call.startedAt.toISOString(),
    durationSeconds: call.durationSeconds,
    connected: call.connected,
    outcome: call.outcome,
    notes: call.notes,
    hasRecording: call.recordingFileId !== null,
    provider: call.provider,
  };
}

/** Every call of one lead, newest first (the lead's calling history, PRD §8). */
export async function listLeadCalls(ctx: ServiceContext, leadId: string): Promise<CallRow[]> {
  ctx.permissions.assert(ACTIVITY_PERMISSIONS.callsView);
  await findVisibleLead(ctx, leadId);
  const calls = await ctx.db.callLog.findMany({
    where: { leadId },
    include: callInclude,
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return calls.map(toCallRow);
}

export interface CallFilters {
  range?: DateRange | null;
  outcomeId?: string | null;
  callerId?: string | null;
  direction?: string | null;
  connected?: boolean | null;
  timezone: string;
}

/** Calls within the actor's `calls.view` scope (by caller) on leads they can see, with filters (M07-06). */
export async function listCalls(
  ctx: ServiceContext,
  query: TableQuery,
  filters: CallFilters,
): Promise<{ rows: CallRow[]; total: number }> {
  const scope = await resolveDataScope(ctx, ACTIVITY_PERMISSIONS.callsView);
  const and: Prisma.CallLogWhereInput[] = [{ lead: await leadScopeWhere(ctx) }];
  if (scope.scope !== "ALL") and.push({ callerId: { in: scope.membershipIds } });
  if (filters.range) and.push({ startedAt: toUtcBounds(filters.range, filters.timezone) });
  const outcomeId = uuidOrNull(filters.outcomeId);
  if (outcomeId) and.push({ outcomeId });
  const callerId = uuidOrNull(filters.callerId);
  if (callerId) and.push({ callerId });
  if (filters.direction === "OUTBOUND" || filters.direction === "INBOUND") {
    and.push({ direction: filters.direction });
  }
  if (typeof filters.connected === "boolean") and.push({ connected: filters.connected });
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { lead: { name: { contains: q, mode: "insensitive" } } },
        { lead: { number: { contains: q, mode: "insensitive" } } },
        { notes: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.CallLogWhereInput = { AND: and };
  const direction = query.sort?.direction ?? "desc";
  const [total, calls] = await Promise.all([
    ctx.db.callLog.count({ where }),
    ctx.db.callLog.findMany({
      where,
      include: callInclude,
      orderBy:
        query.sort?.field === "durationSeconds"
          ? [{ durationSeconds: direction }, { id: "desc" }]
          : [{ startedAt: direction }, { id: "desc" }],
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return { total, rows: calls.map(toCallRow) };
}

export const CALL_SORTABLE_FIELDS = ["startedAt", "durationSeconds"] as const;

/** Summary counts of calls for the same filters (connected, by category) — for the calls page header. */
export async function summarizeCalls(
  ctx: ServiceContext,
  filters: CallFilters,
): Promise<{ total: number; connected: number; byCategory: Record<string, number> }> {
  const scope = await resolveDataScope(ctx, ACTIVITY_PERMISSIONS.callsView);
  const where: Prisma.CallLogWhereInput = {
    AND: [
      { lead: await leadScopeWhere(ctx) },
      ...(scope.scope !== "ALL" ? [{ callerId: { in: scope.membershipIds } }] : []),
      ...(filters.range ? [{ startedAt: toUtcBounds(filters.range, filters.timezone) }] : []),
      ...(uuidOrNull(filters.callerId) ? [{ callerId: filters.callerId! }] : []),
    ],
  };
  const groups = await ctx.db.callLog.groupBy({
    by: ["outcomeId", "connected"],
    where,
    _count: { _all: true },
  });
  const outcomes = await ctx.db.callOutcome.findMany({ select: { id: true, category: true } });
  const categoryOf = new Map(outcomes.map((outcome) => [outcome.id, outcome.category]));
  const byCategory: Record<string, number> = {};
  let total = 0;
  let connected = 0;
  for (const group of groups) {
    total += group._count._all;
    if (group.connected) connected += group._count._all;
    const category = categoryOf.get(group.outcomeId) ?? "NEUTRAL";
    byCategory[category] = (byCategory[category] ?? 0) + group._count._all;
  }
  return { total, connected, byCategory };
}
