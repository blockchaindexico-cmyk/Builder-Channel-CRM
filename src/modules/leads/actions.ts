"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { tenantAction } from "@/platform/actions/client";

import { LEAD_PERMISSIONS } from "./permissions";
import {
  type campaignSchema,
  changeStatusSchema,
  createLeadSchema,
  duplicateCheckSchema,
  leadSettingsSchema,
  leadSourceSchema,
  leadStatusSchema,
  noteSchema,
  requestAttachmentSchema,
  savedViewSchema,
  updateLeadSchema,
} from "./schemas";
import * as duplicates from "./server/duplicates";
import * as files from "./server/files";
import * as leads from "./server/leads";
import * as masters from "./server/masters";
import * as notes from "./server/notes";
import * as settings from "./server/settings";
import * as status from "./server/status";
import * as timeline from "./server/timeline";
import * as views from "./server/views";

const leadId = z.object({ leadId: z.uuid() });

// --- Leads (M04-05 → M04-08) -----------------------------------------------------------------------------------

export const createLeadAction = tenantAction
  .metadata({ name: "leads.create", permission: LEAD_PERMISSIONS.create })
  .inputSchema(createLeadSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await leads.createLead(ctx.service, parsedInput);
    revalidatePath("/leads");
    return result;
  });

export const updateLeadAction = tenantAction
  .metadata({ name: "leads.update", permission: LEAD_PERMISSIONS.update })
  .inputSchema(updateLeadSchema.and(leadId))
  .action(async ({ parsedInput: { leadId: id, ...values }, ctx }) => {
    const result = await leads.updateLead(ctx.service, id, values);
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    return result;
  });

export const checkDuplicatesAction = tenantAction
  .metadata({ name: "leads.checkDuplicates" })
  .inputSchema(duplicateCheckSchema)
  .action(async ({ parsedInput, ctx }) => leads.checkDuplicates(ctx.service, parsedInput));

export const changeLeadStatusAction = tenantAction
  .metadata({ name: "leads.changeStatus", permission: LEAD_PERMISSIONS.changeStatus })
  .inputSchema(changeStatusSchema.extend({ leadId: z.uuid() }))
  .action(async ({ parsedInput: { leadId: id, ...values }, ctx }) => {
    const result = await status.changeLeadStatus(ctx.service, id, values);
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    return result;
  });

export const bulkChangeStatusAction = tenantAction
  .metadata({ name: "leads.bulkChangeStatus", permission: LEAD_PERMISSIONS.changeStatus })
  .inputSchema(changeStatusSchema.extend({ leadIds: z.array(z.uuid()).min(1).max(500) }))
  .action(async ({ parsedInput: { leadIds, ...values }, ctx }) => {
    const result = await status.bulkChangeLeadStatus(ctx.service, leadIds, values);
    revalidatePath("/leads", "layout");
    return result;
  });

export const deleteLeadAction = tenantAction
  .metadata({ name: "leads.delete", permission: LEAD_PERMISSIONS.delete })
  .inputSchema(leadId)
  .action(async ({ parsedInput, ctx }) => {
    await leads.deleteLead(ctx.service, parsedInput.leadId);
    revalidatePath("/leads");
  });

export const loadTimelineAction = tenantAction
  .metadata({ name: "leads.timeline", permission: LEAD_PERMISSIONS.view })
  .inputSchema(
    z.object({
      leadId: z.uuid(),
      types: z.array(z.string().max(60)).max(30).optional(),
      before: z.iso.datetime().nullable().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) =>
    timeline.listLeadTimeline(ctx.service, parsedInput.leadId, {
      types: parsedInput.types,
      before: parsedInput.before,
    }),
  );

// --- Notes & files (M04-09, M04-10) -------------------------------------------------------------------------------

export const addNoteAction = tenantAction
  .metadata({ name: "leads.addNote", permission: LEAD_PERMISSIONS.update })
  .inputSchema(noteSchema.extend({ leadId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await notes.addLeadNote(ctx.service, parsedInput.leadId, parsedInput);
    revalidatePath(`/leads/${parsedInput.leadId}`);
    return result;
  });

export const updateNoteAction = tenantAction
  .metadata({ name: "leads.updateNote", permission: LEAD_PERMISSIONS.update })
  .inputSchema(noteSchema.extend({ noteId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await notes.updateLeadNote(ctx.service, parsedInput.noteId, parsedInput);
    revalidatePath("/leads", "layout");
  });

export const pinNoteAction = tenantAction
  .metadata({ name: "leads.pinNote", permission: LEAD_PERMISSIONS.update })
  .inputSchema(z.object({ noteId: z.uuid(), pinned: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    await notes.setLeadNotePinned(ctx.service, parsedInput.noteId, parsedInput.pinned);
    revalidatePath("/leads", "layout");
  });

export const deleteNoteAction = tenantAction
  .metadata({ name: "leads.deleteNote", permission: LEAD_PERMISSIONS.update })
  .inputSchema(z.object({ noteId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await notes.deleteLeadNote(ctx.service, parsedInput.noteId);
    revalidatePath("/leads", "layout");
  });

export const requestAttachmentAction = tenantAction
  .metadata({ name: "leads.requestAttachment", permission: LEAD_PERMISSIONS.update })
  .inputSchema(requestAttachmentSchema.extend({ leadId: z.uuid() }))
  .action(async ({ parsedInput: { leadId: id, ...file }, ctx }) =>
    files.requestLeadAttachment(ctx.service, id, file),
  );

export const attachFileAction = tenantAction
  .metadata({ name: "leads.attachFile", permission: LEAD_PERMISSIONS.update })
  .inputSchema(
    z.object({ leadId: z.uuid(), fileId: z.uuid(), title: z.string().max(160).optional() }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await files.attachLeadFile(ctx.service, parsedInput.leadId, parsedInput);
    revalidatePath(`/leads/${parsedInput.leadId}`);
    return result;
  });

export const fileUrlAction = tenantAction
  .metadata({ name: "leads.fileUrl", permission: LEAD_PERMISSIONS.view })
  .inputSchema(
    z.object({
      fileId: z.uuid(),
      disposition: z.enum(["inline", "attachment"]).default("attachment"),
    }),
  )
  .action(async ({ parsedInput, ctx }) => ({
    url: await files.getLeadFileUrl(ctx.service, parsedInput.fileId, parsedInput.disposition),
  }));

export const removeFileAction = tenantAction
  .metadata({ name: "leads.removeFile", permission: LEAD_PERMISSIONS.update })
  .inputSchema(z.object({ fileId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await files.removeLeadFile(ctx.service, parsedInput.fileId);
    revalidatePath("/leads", "layout");
  });

// --- Duplicates (M04-17) ----------------------------------------------------------------------------------------

export const dismissDuplicateAction = tenantAction
  .metadata({ name: "leads.dismissDuplicate", permission: LEAD_PERMISSIONS.merge })
  .inputSchema(leadId)
  .action(async ({ parsedInput, ctx }) => {
    await duplicates.dismissDuplicate(ctx.service, parsedInput.leadId);
    revalidatePath("/leads", "layout");
  });

export const markDuplicateAction = tenantAction
  .metadata({ name: "leads.markDuplicate", permission: LEAD_PERMISSIONS.merge })
  .inputSchema(z.object({ leadId: z.uuid(), originalId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await duplicates.markAsDuplicate(ctx.service, parsedInput.leadId, parsedInput.originalId);
    revalidatePath("/leads", "layout");
  });

export const mergeLeadsAction = tenantAction
  .metadata({ name: "leads.merge", permission: LEAD_PERMISSIONS.merge })
  .inputSchema(z.object({ primaryId: z.uuid(), duplicateId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await duplicates.mergeLeads(
      ctx.service,
      parsedInput.primaryId,
      parsedInput.duplicateId,
    );
    revalidatePath("/leads", "layout");
    return result;
  });

// --- Saved views (M04-14) ---------------------------------------------------------------------------------------

export const saveViewAction = tenantAction
  .metadata({ name: "leads.saveView", permission: LEAD_PERMISSIONS.view })
  .inputSchema(savedViewSchema.extend({ viewId: z.uuid().nullable().optional() }))
  .action(async ({ parsedInput: { viewId, ...values }, ctx }) => {
    const result = await views.saveView(ctx.service, viewId ?? null, values);
    revalidatePath("/leads");
    return result;
  });

export const deleteViewAction = tenantAction
  .metadata({ name: "leads.deleteView", permission: LEAD_PERMISSIONS.view })
  .inputSchema(z.object({ viewId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await views.deleteView(ctx.service, parsedInput.viewId);
    revalidatePath("/leads");
  });

// --- Settings (M04-03) --------------------------------------------------------------------------------------------

export const saveLeadSourceAction = tenantAction
  .metadata({ name: "leads.saveSource", permission: LEAD_PERMISSIONS.mastersManage })
  .inputSchema(leadSourceSchema.extend({ sourceId: z.uuid().nullable().optional() }))
  .action(async ({ parsedInput: { sourceId, ...values }, ctx }) => {
    const result = await masters.saveLeadSource(ctx.service, sourceId ?? null, values);
    revalidatePath("/settings/leads", "layout");
    return result;
  });

export const deleteLeadSourceAction = tenantAction
  .metadata({ name: "leads.deleteSource", permission: LEAD_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ sourceId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await masters.deleteLeadSource(ctx.service, parsedInput.sourceId);
    revalidatePath("/settings/leads", "layout");
  });

export const saveCampaignAction = tenantAction
  .metadata({ name: "leads.saveCampaign", permission: LEAD_PERMISSIONS.mastersManage })
  .inputSchema(
    z.object({
      campaignId: z.uuid().nullable().optional(),
      values: z.record(z.string(), z.unknown()),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await masters.saveCampaign(
      ctx.service,
      parsedInput.campaignId ?? null,
      parsedInput.values as never,
    );
    revalidatePath("/settings/leads", "layout");
    return result;
  });

export const deleteCampaignAction = tenantAction
  .metadata({ name: "leads.deleteCampaign", permission: LEAD_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ campaignId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await masters.deleteCampaign(ctx.service, parsedInput.campaignId);
    revalidatePath("/settings/leads", "layout");
  });

export const saveLeadStatusAction = tenantAction
  .metadata({ name: "leads.saveStatus", permission: LEAD_PERMISSIONS.mastersManage })
  .inputSchema(leadStatusSchema.extend({ statusId: z.uuid().nullable().optional() }))
  .action(async ({ parsedInput: { statusId, ...values }, ctx }) => {
    if (statusId) await masters.updateLeadStatus(ctx.service, statusId, values);
    else await masters.createLeadStatus(ctx.service, values);
    revalidatePath("/settings/leads", "layout");
    revalidatePath("/leads", "layout");
  });

export const deleteLeadStatusAction = tenantAction
  .metadata({ name: "leads.deleteStatus", permission: LEAD_PERMISSIONS.mastersManage })
  .inputSchema(z.object({ statusId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await masters.deleteLeadStatus(ctx.service, parsedInput.statusId);
    revalidatePath("/settings/leads", "layout");
  });

export const saveLeadSettingsAction = tenantAction
  .metadata({ name: "leads.saveSettings", permission: LEAD_PERMISSIONS.mastersManage })
  .inputSchema(leadSettingsSchema.partial())
  .action(async ({ parsedInput, ctx }) => {
    const result = await settings.updateLeadSettings(ctx.service, parsedInput);
    revalidatePath("/settings/leads", "layout");
    return result;
  });

// Re-exported for campaign form typing.
export type CampaignFormInput = z.input<typeof campaignSchema>;
