import "./events";

import type { ServerModule } from "@/platform/registry/server";

import {
  BUILDER_DOCUMENT_PURPOSE,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  PROJECT_DOCUMENT_PURPOSE,
} from "../schemas";
import { canReadDocumentFile } from "./documents";

export const catalogServerModule: ServerModule = {
  key: "catalog",
  filePurposes: [
    {
      key: PROJECT_DOCUMENT_PURPOSE,
      label: "project documents",
      maxBytes: DOCUMENT_MAX_BYTES,
      allowedTypes: DOCUMENT_TYPES,
      uploadPermission: "projects.files.manage",
      canRead: (ctx, file) => canReadDocumentFile(ctx, "project", file.id),
    },
    {
      key: BUILDER_DOCUMENT_PURPOSE,
      label: "builder documents",
      maxBytes: DOCUMENT_MAX_BYTES,
      allowedTypes: DOCUMENT_TYPES,
      uploadPermission: "builders.manage",
      canRead: (ctx, file) => canReadDocumentFile(ctx, "builder", file.id),
    },
  ],
};
