import "./events";

import type { ServerModule } from "@/platform/registry/server";

import { LEAD_PERMISSIONS } from "../permissions";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  IMPORT_MAX_BYTES,
  IMPORT_TYPES,
  LEAD_ATTACHMENT_PURPOSE,
  LEAD_IMPORT_PURPOSE,
  LEAD_IMPORT_REPORT_PURPOSE,
} from "../schemas";
import { canReadLeadAttachment } from "./files";
import { leadImportJob } from "./jobs";

export const leadsServerModule: ServerModule = {
  key: "leads",
  jobs: [leadImportJob],
  filePurposes: [
    {
      key: LEAD_ATTACHMENT_PURPOSE,
      label: "lead attachments",
      maxBytes: ATTACHMENT_MAX_BYTES,
      allowedTypes: ATTACHMENT_TYPES,
      uploadPermission: LEAD_PERMISSIONS.update,
      canRead: (ctx, file) => canReadLeadAttachment(ctx, file.id),
    },
    {
      key: LEAD_IMPORT_PURPOSE,
      label: "lead import files",
      maxBytes: IMPORT_MAX_BYTES,
      allowedTypes: IMPORT_TYPES,
      uploadPermission: LEAD_PERMISSIONS.import,
      canRead: (ctx) => ctx.permissions.has(LEAD_PERMISSIONS.import),
    },
    {
      key: LEAD_IMPORT_REPORT_PURPOSE,
      label: "lead import error reports",
      maxBytes: 50 * 1024 * 1024,
      allowedTypes: ["text/csv"],
      uploadPermission: LEAD_PERMISSIONS.import,
      canRead: (ctx) => ctx.permissions.has(LEAD_PERMISSIONS.import),
    },
  ],
  // Catalogue records used by leads cannot be deleted, only deactivated (M03-11).
  referenceChecks: [
    {
      entity: "Project",
      label: "leads",
      count: (ctx, id) =>
        ctx.db.lead.count({ where: { deletedAt: null, interests: { some: { projectId: id } } } }),
    },
    {
      entity: "Builder",
      label: "leads",
      count: (ctx, id) =>
        ctx.db.lead.count({
          where: { deletedAt: null, interests: { some: { project: { builderId: id } } } },
        }),
    },
    {
      entity: "PropertyType",
      label: "leads",
      count: (ctx, id) => ctx.db.lead.count({ where: { deletedAt: null, propertyTypeId: id } }),
    },
    {
      entity: "ConfigurationType",
      label: "leads",
      count: (ctx, id) =>
        ctx.db.lead.count({ where: { deletedAt: null, configurationTypeIds: { has: id } } }),
    },
  ],
};
