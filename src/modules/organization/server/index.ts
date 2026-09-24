import "./events";

import { defineEventHandler } from "@/platform/events/define";
import type { ServerModule } from "@/platform/registry/server";

import { LOGO_MAX_BYTES, LOGO_PURPOSE, LOGO_TYPES } from "../schemas";

/**
 * Records organization configuration changes in the operational log. (Other modules — e.g. notifications in
 * M06 — can subscribe to the same event.)
 */
const logSettingsChange = defineEventHandler({
  name: "organization.log-settings-change",
  event: "organization.settings_updated",
  async handle(event, ctx) {
    const { logger } = await import("@/platform/logger");
    logger.info(
      {
        organizationId: ctx.organizationId,
        eventId: event.id,
        changedFields: event.payload.changedFields,
        actor: event.actor.name,
      },
      "organization settings changed",
    );
  },
});

export const organizationServerModule: ServerModule = {
  key: "organization",
  filePurposes: [
    {
      key: LOGO_PURPOSE,
      label: "organization logo",
      maxBytes: LOGO_MAX_BYTES,
      allowedTypes: LOGO_TYPES,
      uploadPermission: "settings.organization.manage",
    },
  ],
  eventHandlers: [logSettingsChange],
};
