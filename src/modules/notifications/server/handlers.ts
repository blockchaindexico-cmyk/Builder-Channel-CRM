import { plural } from "@/lib/utils";
import { findMembers } from "@/modules/identity";
import { type LeadSummary, listLeadSummaries } from "@/modules/leads";
import { defineEventHandler } from "@/platform/events/define";
import type { DomainEvent, DomainEventType } from "@/platform/events/types";
import type { ServiceContext } from "@/platform/tenant/context";

import { type NotificationText, notify } from "./notify";

/**
 * Existing events → notifications (M06-10). Nobody is notified about their own action. Assignments made in bulk
 * (one request: bulk assign, import, hand-over) become one counting notification per person instead of one each.
 */
const GROUPED_METHODS = new Set(["BULK", "IMPORT", "DEACTIVATION"]);
/** Automatic assignments are the normal flow of new leads: managers are told about the manual ones only. */
const SILENT_FOR_MANAGERS = new Set(["RULE", "CREATOR"]);

const label = (lead: LeadSummary) => `${lead.number} · ${lead.name}`;
const leadLink = (lead: LeadSummary) => `/leads/${lead.id}`;

function actorOf(event: DomainEvent<DomainEventType>): {
  name: string;
  membershipId: string | null;
} {
  return { name: event.actor.name, membershipId: event.actor.membershipId ?? null };
}

function others(ids: readonly (string | null | undefined)[], actorMembershipId: string | null) {
  return [...new Set(ids.filter((id): id is string => Boolean(id) && id !== actorMembershipId))];
}

async function namesOf(ctx: ServiceContext, ids: readonly string[]): Promise<Map<string, string>> {
  const members = await findMembers(ctx.db, { ids });
  return new Map(members.map((member) => [member.membershipId, member.name]));
}

async function managersOf(ctx: ServiceContext, ids: readonly string[]): Promise<string[]> {
  const members = await findMembers(ctx.db, { ids });
  return members.flatMap((member) => (member.reportsToId ? [member.reportsToId] : []));
}

/** Per-event key, or the key of the request's group when the change was made in bulk. */
function keyFor(event: DomainEvent<DomainEventType>, scope: string, grouped: boolean) {
  return grouped ? `${scope}:group:${event.requestId ?? event.id}` : `${scope}:${event.id}`;
}

function byLine(method: string, actorName: string): string {
  switch (method) {
    case "RULE":
      return "Assigned automatically by an assignment rule.";
    case "IMPORT":
      return `Assigned in a lead import by ${actorName}.`;
    case "DEACTIVATION":
      return `Handed over by ${actorName} when a colleague left.`;
    default:
      return `Assigned by ${actorName}.`;
  }
}

export const leadAssignedHandler = defineEventHandler({
  name: "notifications.lead-assigned",
  event: "lead.assigned",
  async handle(event, ctx) {
    const [lead] = await listLeadSummaries(ctx.db, [event.payload.leadId]);
    if (!lead) return;
    const actor = actorOf(event);
    const { assigneeId, method } = event.payload;
    const grouped = GROUPED_METHODS.has(method);

    const [owner] = others([assigneeId], actor.membershipId);
    if (owner) {
      const single: NotificationText = {
        title: `New lead: ${label(lead)}`,
        body: byLine(method, actor.name),
        link: leadLink(lead),
      };
      await notify(ctx, {
        type: "lead.assigned",
        recipientIds: [owner],
        ...single,
        entity: { type: "Lead", id: lead.id },
        priority: "HIGH",
        actorName: actor.name,
        idempotencyKey: keyFor(event, "lead.assigned", grouped),
        group: grouped
          ? (count) =>
              count === 1
                ? single
                : {
                    title: `${plural(count, "new lead")} assigned to you`,
                    body: byLine(method, actor.name),
                    link: `/leads?owner=${owner}&open=true`,
                  }
          : undefined,
      });
    }

    if (SILENT_FOR_MANAGERS.has(method)) return;
    const managers = others(await managersOf(ctx, [assigneeId]), actor.membershipId);
    if (managers.length === 0) return;
    const names = await namesOf(ctx, [assigneeId]);
    const single: NotificationText = {
      title: `${label(lead)} assigned to ${names.get(assigneeId) ?? "a team member"}`,
      body: byLine(method, actor.name),
      link: leadLink(lead),
    };
    await notify(ctx, {
      type: "team.lead_assigned",
      recipientIds: managers,
      ...single,
      entity: { type: "Lead", id: lead.id },
      actorName: actor.name,
      idempotencyKey: keyFor(event, "team.lead_assigned", grouped),
      group: grouped
        ? (count) =>
            count === 1
              ? single
              : {
                  title: `${plural(count, "lead")} assigned in your team`,
                  body: byLine(method, actor.name),
                  link: "/team/workload",
                }
        : undefined,
    });
  },
});

export const leadReassignedHandler = defineEventHandler({
  name: "notifications.lead-reassigned",
  event: "lead.reassigned",
  async handle(event, ctx) {
    const [lead] = await listLeadSummaries(ctx.db, [event.payload.leadId]);
    if (!lead) return;
    const actor = actorOf(event);
    const { assigneeId, previousOwnerId, method, reason } = event.payload;
    const grouped = GROUPED_METHODS.has(method);
    const names = await namesOf(ctx, [assigneeId, previousOwnerId]);
    const newName = names.get(assigneeId) ?? "a colleague";
    const previousName = names.get(previousOwnerId) ?? "a colleague";
    const why = reason ? `Reason: ${reason}` : null;

    const [owner] = others([assigneeId], actor.membershipId);
    if (owner) {
      const single: NotificationText = {
        title: `Lead moved to you: ${label(lead)}`,
        body: [`${actor.name} moved it from ${previousName}.`, why].filter(Boolean).join("\n"),
        link: leadLink(lead),
      };
      await notify(ctx, {
        type: "lead.assigned",
        recipientIds: [owner],
        ...single,
        entity: { type: "Lead", id: lead.id },
        priority: "HIGH",
        actorName: actor.name,
        idempotencyKey: keyFor(event, "lead.assigned", grouped),
        group: grouped
          ? (count) =>
              count === 1
                ? single
                : {
                    title: `${plural(count, "lead")} moved to you`,
                    body: [`Moved by ${actor.name}.`, why].filter(Boolean).join("\n"),
                    link: `/leads?owner=${owner}&open=true`,
                  }
          : undefined,
      });
    }

    const [previous] = others([previousOwnerId], actor.membershipId);
    if (previous) {
      // No link: after the move the previous owner may no longer be allowed to open the lead.
      const single: NotificationText = {
        title: `${label(lead)} was moved to ${newName}`,
        body: [`Moved by ${actor.name}.`, why].filter(Boolean).join("\n"),
        link: null,
      };
      await notify(ctx, {
        type: "lead.moved_away",
        recipientIds: [previous],
        ...single,
        entity: { type: "Lead", id: lead.id },
        actorName: actor.name,
        idempotencyKey: keyFor(event, "lead.moved_away", grouped),
        group: grouped
          ? (count) =>
              count === 1
                ? single
                : {
                    title: `${count} of your leads were moved to colleagues`,
                    body: [`Moved by ${actor.name}.`, why].filter(Boolean).join("\n"),
                    link: null,
                  }
          : undefined,
      });
    }

    const managers = others(
      await managersOf(ctx, [assigneeId, previousOwnerId]),
      actor.membershipId,
    );
    if (managers.length === 0) return;
    const single: NotificationText = {
      title: `${label(lead)} moved from ${previousName} to ${newName}`,
      body: [`Moved by ${actor.name}.`, why].filter(Boolean).join("\n"),
      link: leadLink(lead),
    };
    await notify(ctx, {
      type: "team.lead_assigned",
      recipientIds: managers,
      ...single,
      entity: { type: "Lead", id: lead.id },
      actorName: actor.name,
      idempotencyKey: keyFor(event, "team.lead_assigned", grouped),
      group: grouped
        ? (count) =>
            count === 1
              ? single
              : {
                  title: `${plural(count, "lead")} moved in your team`,
                  body: `Moved by ${actor.name}.`,
                  link: "/team/workload",
                }
        : undefined,
    });
  },
});

export const leadUnassignedHandler = defineEventHandler({
  name: "notifications.lead-unassigned",
  event: "lead.unassigned",
  async handle(event, ctx) {
    const [lead] = await listLeadSummaries(ctx.db, [event.payload.leadId]);
    if (!lead) return;
    const actor = actorOf(event);
    const [previous] = others([event.payload.previousOwnerId], actor.membershipId);
    if (!previous) return;
    const grouped = GROUPED_METHODS.has(event.payload.method);
    const why = event.payload.reason ? `Reason: ${event.payload.reason}` : null;
    const single: NotificationText = {
      title: `${label(lead)} went back to the unassigned queue`,
      body: [`Moved by ${actor.name}.`, why].filter(Boolean).join("\n"),
      link: null,
    };
    await notify(ctx, {
      type: "lead.moved_away",
      recipientIds: [previous],
      ...single,
      entity: { type: "Lead", id: lead.id },
      actorName: actor.name,
      idempotencyKey: keyFor(event, "lead.moved_away", grouped),
      group: grouped
        ? (count) =>
            count === 1
              ? single
              : {
                  title: `${count} of your leads went back to the unassigned queue`,
                  body: [`Moved by ${actor.name}.`, why].filter(Boolean).join("\n"),
                  link: null,
                }
        : undefined,
    });
  },
});

export const duplicateDetectedHandler = defineEventHandler({
  name: "notifications.lead-duplicate",
  event: "lead.duplicate_detected",
  async handle(event, ctx) {
    const leads = await listLeadSummaries(ctx.db, [
      event.payload.leadId,
      ...event.payload.matchedLeadIds,
    ]);
    const entered = leads.find((lead) => lead.id === event.payload.leadId);
    if (!entered) return;
    const actor = actorOf(event);
    const matched = leads.filter((lead) => lead.id !== entered.id);
    // One notification per owner, about their own lead the new one looks like.
    for (const ownerId of others(
      matched.map((lead) => lead.ownerId),
      actor.membershipId,
    )) {
      const original = matched.find((lead) => lead.ownerId === ownerId)!;
      const single: NotificationText = {
        title: `Possible duplicate of your lead ${label(original)}`,
        body: `${actor.name} entered ${label(entered)} with the same mobile number or e-mail.`,
        link: leadLink(original),
      };
      await notify(ctx, {
        type: "lead.duplicate",
        recipientIds: [ownerId],
        ...single,
        entity: { type: "Lead", id: original.id },
        actorName: actor.name,
        // One request (e.g. an import) can create many duplicates: they count up in one notification.
        idempotencyKey: `lead.duplicate:group:${event.requestId ?? event.id}`,
        group: (count) =>
          count === 1
            ? single
            : {
                title: `${plural(count, "possible duplicate")} of your leads`,
                body: `Entered by ${actor.name} with the same mobile numbers or e-mails as your leads.`,
                link: "/leads",
              },
      });
    }
  },
});

export const importCompletedHandler = defineEventHandler({
  name: "notifications.import-completed",
  event: "lead.import_completed",
  async handle(event, ctx) {
    const { batchId, createdById, fileName, imported, duplicates, skipped, errors } = event.payload;
    const details = [
      `${plural(imported, "lead")} imported`,
      duplicates ? `${duplicates} flagged as possible duplicates` : null,
      skipped ? `${skipped} skipped` : null,
      errors ? `${plural(errors, "row")} with errors` : null,
    ].filter(Boolean);
    await notify(ctx, {
      type: "import.finished",
      recipientIds: [createdById],
      title: `Import finished: ${fileName}`,
      body: `${details.join(", ")}.`,
      link: `/leads/import/${batchId}`,
      entity: { type: "LeadImportBatch", id: batchId },
      priority: errors ? "HIGH" : "NORMAL",
      idempotencyKey: `import.finished:${batchId}`,
    });
  },
});

export const importFailedHandler = defineEventHandler({
  name: "notifications.import-failed",
  event: "lead.import_failed",
  async handle(event, ctx) {
    const { batchId, createdById, fileName, message } = event.payload;
    await notify(ctx, {
      type: "import.finished",
      recipientIds: [createdById],
      title: `Import failed: ${fileName}`,
      body: message,
      link: `/leads/import/${batchId}`,
      entity: { type: "LeadImportBatch", id: batchId },
      priority: "HIGH",
      idempotencyKey: `import.finished:${batchId}`,
    });
  },
});

export const notificationEventHandlers = [
  leadAssignedHandler,
  leadReassignedHandler,
  leadUnassignedHandler,
  duplicateDetectedHandler,
  importCompletedHandler,
  importFailedHandler,
];
