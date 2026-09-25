import type { FileObject } from "@/generated/prisma/client";
import { findVisibleLead, isLeadInScope, recordLeadActivity } from "@/modules/leads";
import { recordAudit } from "@/platform/audit";
import { ConflictError, ForbiddenError, NotFoundError } from "@/platform/errors";
import { completeUpload, getFileDownloadUrl, requestUpload } from "@/platform/storage/files";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { ACTIVITY_TYPES, CALL_RECORDING_PURPOSE } from "../constants";
import { ACTIVITY_PERMISSIONS } from "../permissions";
import { requestRecordingSchema } from "../schemas";

/**
 * Call recordings (M07-08, PRD §8, §27): uploaded by whoever may log calls on the lead, stored privately and played
 * through a short-lived link by people allowed to listen — every playback is audited.
 */
async function loadCallForLogging(ctx: ServiceContext, callId: string) {
  const call = await ctx.db.callLog.findFirst({ where: { id: callId } });
  if (!call) throw new NotFoundError("Call", callId);
  const lead = await findVisibleLead(ctx, call.leadId, {
    permission: ACTIVITY_PERMISSIONS.callsLog,
  });
  return { call, lead };
}

/** Step 1: presigned upload for a call without a recording yet. */
export async function requestCallRecordingUpload(
  ctx: ServiceContext,
  input: { callId: string; fileName: string; contentType: string; size: number },
) {
  const values = parseInput(requestRecordingSchema, input);
  const { call } = await loadCallForLogging(ctx, values.callId);
  if (call.recordingFileId) throw new ConflictError("This call already has a recording.");
  return requestUpload(ctx, {
    purpose: CALL_RECORDING_PURPOSE,
    fileName: values.fileName,
    contentType: values.contentType,
    size: values.size,
  });
}

/** Step 2: verifies the upload and links it to the call (timeline + audit). */
export async function attachCallRecording(
  ctx: ServiceContext,
  callId: string,
  fileId: string,
): Promise<void> {
  const { call, lead } = await loadCallForLogging(ctx, callId);
  if (call.recordingFileId) throw new ConflictError("This call already has a recording.");
  const file: FileObject = await completeUpload(ctx, fileId);
  if (file.purpose !== CALL_RECORDING_PURPOSE) throw new NotFoundError("Pending upload", fileId);
  await ctx.db.$transaction(async (tx) => {
    const { count } = await tx.callLog.updateMany({
      where: { id: call.id, recordingFileId: null },
      data: { recordingFileId: file.id },
    });
    if (count === 0) throw new ConflictError("This call already has a recording.");
    await recordLeadActivity(tx, ctx, {
      leadId: lead.id,
      type: ACTIVITY_TYPES.CALL_RECORDING_ADDED,
      summary: `Added the recording of a call (${file.fileName})`,
      payload: { callId: call.id, fileName: file.fileName, size: file.size },
      touch: false,
    });
    await recordAudit(tx, ctx, {
      action: "activities.call.recording.add",
      entityType: "CallLog",
      entityId: call.id,
      summary: `${lead.number}: recording added to a call`,
    });
  });
}

/** Whether the actor may play the recording of a call on this lead (used by the file purpose too). */
export async function canListenToCall(ctx: ServiceContext, call: { leadId: string }) {
  if (!ctx.permissions.has(ACTIVITY_PERMISSIONS.recordingsListen)) return false;
  try {
    const lead = await findVisibleLead(ctx, call.leadId);
    return isLeadInScope(ctx, lead, ACTIVITY_PERMISSIONS.callsView);
  } catch {
    return false;
  }
}

/** Short-lived playback link; the playback is recorded in the audit log. */
export async function getCallRecordingUrl(ctx: ServiceContext, callId: string): Promise<string> {
  const call = await ctx.db.callLog.findFirst({
    where: { id: callId },
    include: { lead: { select: { number: true } } },
  });
  if (!call || !call.recordingFileId) throw new NotFoundError("Recording", callId);
  if (!(await canListenToCall(ctx, call))) {
    throw new ForbiddenError(
      "You are not allowed to listen to call recordings.",
      ACTIVITY_PERMISSIONS.recordingsListen,
    );
  }
  const url = await getFileDownloadUrl(ctx, call.recordingFileId, {
    disposition: "inline",
    expiresInSeconds: 300,
  });
  await recordAudit(ctx.db, ctx, {
    action: "activities.call.recording.play",
    entityType: "CallLog",
    entityId: call.id,
    summary: `${call.lead.number}: listened to the recording of a call by ${call.callerName}`,
  });
  return url;
}
