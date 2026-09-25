import { CSV_TYPE, XLSX_TYPE } from "@/platform/export/spreadsheet";
import type { ServerModule } from "@/platform/registry/server";

import { REPORT_EXPORT_MAX_BYTES, REPORT_EXPORT_PURPOSE } from "../constants";
import { analyticsEventHandlers } from "./handlers";
import { analyticsJobs } from "./jobs";

/** Server contributions of dashboards & reports (M10). */
export const analyticsServerModule: ServerModule = {
  key: "analytics",
  jobs: analyticsJobs,
  eventHandlers: analyticsEventHandlers,
  filePurposes: [
    {
      key: REPORT_EXPORT_PURPOSE,
      label: "report exports",
      maxBytes: REPORT_EXPORT_MAX_BYTES,
      allowedTypes: [CSV_TYPE, XLSX_TYPE],
      // Written by the worker only; read by the member who asked for it.
      uploadPermission: "reports.export",
      canRead: async (ctx, file) =>
        (await ctx.db.reportExport.count({
          where: { fileId: file.id, requestedById: ctx.actor.membershipId ?? "" },
        })) > 0,
    },
  ],
};
