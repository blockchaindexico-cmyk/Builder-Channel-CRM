import "./events";

import type { ServerModule } from "@/platform/registry/server";

import { CALL_RECORDING_PURPOSE, RECORDING_MAX_BYTES, RECORDING_TYPES } from "../constants";
import { ACTIVITY_PERMISSIONS } from "../permissions";
import { activityLeadFilters } from "./filters";
import { activityEventHandlers } from "./handlers";
import { followUpsDigestSection, overdueFollowUpsRule } from "./insights";
import { detectMissedJob } from "./jobs";
import { canListenToCall } from "./recordings";

/** Server contributions of calls, follow-ups & callbacks (M07). */
export const activitiesServerModule: ServerModule = {
  key: "activities",
  jobs: [detectMissedJob],
  eventHandlers: activityEventHandlers,
  filePurposes: [
    {
      key: CALL_RECORDING_PURPOSE,
      label: "call recordings",
      maxBytes: RECORDING_MAX_BYTES,
      allowedTypes: RECORDING_TYPES,
      uploadPermission: ACTIVITY_PERMISSIONS.callsLog,
      canRead: async (ctx, file) => {
        const call = await ctx.db.callLog.findFirst({
          where: { recordingFileId: file.id },
          select: { leadId: true },
        });
        return call ? canListenToCall(ctx, call) : false;
      },
    },
  ],
  extensions: {
    "lead.list.filter": activityLeadFilters,
    "notifications.alert-rule": [overdueFollowUpsRule],
    "notifications.digest-section": [followUpsDigestSection],
  },
};
