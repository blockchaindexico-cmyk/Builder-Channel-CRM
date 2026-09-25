"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  findVisibleLead,
  isLeadInScope,
  LEAD_PERMISSIONS,
  listLeadStatuses,
  SYSTEM_DRIVEN_STATUS_KEYS,
} from "@/modules/leads";
import { tenantAction } from "@/platform/actions/client";

import { ACTIVITY_PERMISSIONS } from "./permissions";
import {
  activitySettingsSchema,
  callOutcomeSchema,
  cancelFollowUpSchema,
  type completeFollowUpSchema,
  followUpPurposeSchema,
  type logCallSchema,
  requestRecordingSchema,
  type rescheduleFollowUpSchema,
  type scheduleFollowUpSchema,
} from "./schemas";
import * as calls from "./server/calls";
import * as followUps from "./server/follow-ups";
import * as masters from "./server/masters";
import * as recordings from "./server/recordings";
import * as settings from "./server/settings";
import { getTelephonyProvider } from "./server/telephony";

const refreshLead = (leadId?: string) => {
  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads", "layout");
  revalidatePath("/agenda");
  revalidatePath("/calls");
  revalidatePath("/team/follow-ups");
};

// --- Dialog options -----------------------------------------------------------------------------------------------

/** Everything the "Log call" and "Schedule follow-up" dialogs need, loaded when one opens (M07-04, M07-10). */
export const activityDialogOptionsAction = tenantAction
  .metadata({ name: "activities.dialog-options" })
  .inputSchema(z.object({ leadId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const lead = await findVisibleLead(ctx.service, parsedInput.leadId, {
      include: { status: true },
    });
    const [outcomes, purposes, statuses, activity, canChangeStatus, canManage] = await Promise.all([
      masters.listCallOutcomes(ctx.service, { activeOnly: true }),
      masters.listFollowUpPurposes(ctx.service, { activeOnly: true }),
      listLeadStatuses(ctx.service, { activeOnly: true }),
      settings.getActivitySettings(ctx.service.db, ctx.service),
      isLeadInScope(ctx.service, lead, LEAD_PERMISSIONS.changeStatus),
      isLeadInScope(ctx.service, lead, ACTIVITY_PERMISSIONS.followUpsManage),
    ]);
    const override = ctx.service.permissions.has(LEAD_PERMISSIONS.statusOverride);
    const reopen = ctx.service.permissions.has(LEAD_PERMISSIONS.reopen);
    const openFollowUps = await ctx.service.db.followUp.findMany({
      where: { leadId: lead.id, status: { in: ["SCHEDULED", "MISSED"] } },
      orderBy: { dueAt: "asc" },
      select: {
        id: true,
        type: true,
        dueAt: true,
        status: true,
        purpose: { select: { label: true } },
      },
    });
    const dial = lead.mobile
      ? await getTelephonyProvider("MANUAL")!.startCall({
          phone: lead.mobile,
          agentMembershipId: ctx.service.actor.membershipId ?? "",
        })
      : null;
    return {
      lead: {
        id: lead.id,
        number: lead.number,
        name: lead.name,
        mobile: lead.mobile,
        dialHref: dial?.kind === "dial" ? dial.href : null,
        statusKey: lead.status.key,
        statusLabel: lead.status.label,
        statusCategory: lead.status.category,
        isTerminal: lead.status.isTerminal,
        callAttempts: lead.callAttempts,
      },
      outcomes: outcomes.map(({ usage: _usage, ...outcome }) => outcome),
      purposes: purposes.map(({ id, label }) => ({ id, label })),
      // Statuses a person may pick after a call: workflow statuses only with the override permission, closed
      // leads only move out with the reopen permission.
      statuses: canChangeStatus
        ? statuses
            .filter((status) => override || !SYSTEM_DRIVEN_STATUS_KEYS.includes(status.key))
            .filter((status) => !lead.status.isTerminal || status.isTerminal || reopen)
            .map((status) => ({
              key: status.key,
              label: status.label,
              color: status.color,
              category: status.category,
              requiresReason: status.requiresReason,
              isTerminal: status.isTerminal,
            }))
        : [],
      openFollowUps: openFollowUps.map((followUp) => ({
        id: followUp.id,
        type: followUp.type,
        status: followUp.status,
        dueAt: followUp.dueAt.toISOString(),
        purpose: followUp.purpose?.label ?? null,
      })),
      canManageFollowUps: canManage,
      unresponsiveAfterAttempts: activity.unresponsiveAfterAttempts,
    };
  });

// --- Calls (M07-04 → M07-08) ---------------------------------------------------------------------------------------

export const logCallAction = tenantAction
  .metadata({ name: "activities.call.log", permission: ACTIVITY_PERMISSIONS.callsLog })
  .inputSchema(z.object({ values: z.record(z.string(), z.unknown()) }))
  .action(async ({ parsedInput, ctx }) => {
    // The service validates (its schema turns dates into Date objects).
    const result = await calls.logCall(
      ctx.service,
      parsedInput.values as z.input<typeof logCallSchema>,
    );
    refreshLead(parsedInput.values.leadId as string);
    return result;
  });

export const requestRecordingUploadAction = tenantAction
  .metadata({ name: "activities.recording.request", permission: ACTIVITY_PERMISSIONS.callsLog })
  .inputSchema(requestRecordingSchema)
  .action(({ parsedInput, ctx }) =>
    recordings.requestCallRecordingUpload(ctx.service, parsedInput),
  );

export const attachRecordingAction = tenantAction
  .metadata({ name: "activities.recording.attach", permission: ACTIVITY_PERMISSIONS.callsLog })
  .inputSchema(z.object({ callId: z.uuid(), fileId: z.uuid(), leadId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await recordings.attachCallRecording(ctx.service, parsedInput.callId, parsedInput.fileId);
    refreshLead(parsedInput.leadId);
  });

export const recordingUrlAction = tenantAction
  .metadata({
    name: "activities.recording.play",
    permission: ACTIVITY_PERMISSIONS.recordingsListen,
  })
  .inputSchema(z.object({ callId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => ({
    url: await recordings.getCallRecordingUrl(ctx.service, parsedInput.callId),
  }));

// --- Follow-ups (M07-10, M07-11) -----------------------------------------------------------------------------------

const followUpResult = (leadId: string) => refreshLead(leadId);

export const scheduleFollowUpAction = tenantAction
  .metadata({
    name: "activities.followup.schedule",
    permission: ACTIVITY_PERMISSIONS.followUpsManage,
  })
  .inputSchema(z.object({ values: z.record(z.string(), z.unknown()) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await followUps.scheduleFollowUp(
      ctx.service,
      parsedInput.values as z.input<typeof scheduleFollowUpSchema>,
    );
    followUpResult(parsedInput.values.leadId as string);
    return result;
  });

export const completeFollowUpAction = tenantAction
  .metadata({
    name: "activities.followup.complete",
    permission: ACTIVITY_PERMISSIONS.followUpsManage,
  })
  .inputSchema(z.object({ leadId: z.uuid(), values: z.record(z.string(), z.unknown()) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await followUps.completeFollowUp(
      ctx.service,
      parsedInput.values as z.input<typeof completeFollowUpSchema>,
    );
    followUpResult(parsedInput.leadId);
    return result;
  });

export const rescheduleFollowUpAction = tenantAction
  .metadata({
    name: "activities.followup.reschedule",
    permission: ACTIVITY_PERMISSIONS.followUpsManage,
  })
  .inputSchema(z.object({ leadId: z.uuid(), values: z.record(z.string(), z.unknown()) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await followUps.rescheduleFollowUp(
      ctx.service,
      parsedInput.values as z.input<typeof rescheduleFollowUpSchema>,
    );
    followUpResult(parsedInput.leadId);
    return result;
  });

export const cancelFollowUpAction = tenantAction
  .metadata({
    name: "activities.followup.cancel",
    permission: ACTIVITY_PERMISSIONS.followUpsManage,
  })
  .inputSchema(z.object({ leadId: z.uuid(), values: cancelFollowUpSchema }))
  .action(async ({ parsedInput, ctx }) => {
    await followUps.cancelFollowUp(ctx.service, parsedInput.values);
    followUpResult(parsedInput.leadId);
  });

// --- Settings (M07-03) --------------------------------------------------------------------------------------------

const refreshSettings = () => revalidatePath("/settings/activities", "layout");

export const saveOutcomeAction = tenantAction
  .metadata({ name: "activities.outcome.save", permission: ACTIVITY_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ outcomeId: z.uuid().nullable(), values: callOutcomeSchema }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await masters.saveCallOutcome(
      ctx.service,
      parsedInput.outcomeId,
      parsedInput.values,
    );
    refreshSettings();
    return result;
  });

export const deleteOutcomeAction = tenantAction
  .metadata({ name: "activities.outcome.delete", permission: ACTIVITY_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ outcomeId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await masters.deleteCallOutcome(ctx.service, parsedInput.outcomeId);
    refreshSettings();
  });

export const savePurposeAction = tenantAction
  .metadata({ name: "activities.purpose.save", permission: ACTIVITY_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ purposeId: z.uuid().nullable(), values: followUpPurposeSchema }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await masters.saveFollowUpPurpose(
      ctx.service,
      parsedInput.purposeId,
      parsedInput.values,
    );
    refreshSettings();
    return result;
  });

export const deletePurposeAction = tenantAction
  .metadata({ name: "activities.purpose.delete", permission: ACTIVITY_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ purposeId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await masters.deleteFollowUpPurpose(ctx.service, parsedInput.purposeId);
    refreshSettings();
  });

export const saveActivitySettingsAction = tenantAction
  .metadata({ name: "activities.settings.update", permission: ACTIVITY_PERMISSIONS.mastersManage })
  .inputSchema(activitySettingsSchema.partial())
  .action(async ({ parsedInput, ctx }) => {
    await settings.updateActivitySettings(ctx.service, parsedInput);
    refreshSettings();
  });
