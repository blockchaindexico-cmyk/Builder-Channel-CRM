import "./events";

import type { ServerModule } from "@/platform/registry/server";

import { AVATAR_MAX_BYTES, AVATAR_PURPOSE, AVATAR_TYPES } from "../schemas";

export const identityServerModule: ServerModule = {
  key: "identity",
  filePurposes: [
    {
      key: AVATAR_PURPOSE,
      label: "profile photo",
      maxBytes: AVATAR_MAX_BYTES,
      allowedTypes: AVATAR_TYPES,
    },
  ],
};
