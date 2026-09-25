import "./events";

import type { ServerModule } from "@/platform/registry/server";

import {
  BOOKING_DOCUMENT_MAX_BYTES,
  BOOKING_DOCUMENT_PURPOSE,
  BOOKING_DOCUMENT_TYPES,
} from "../constants";
import { DEAL_PERMISSIONS } from "../permissions";
import { closeLeadHook } from "./closure";
import { canReadBookingDocument } from "./files";
import { dealLeadFilters } from "./filters";
import { dealEventHandlers } from "./handlers";
import { dealsDigestSection, visitsPendingOutcomeRule } from "./insights";

/** Server contributions of site visits, bookings & closures (M08). */
export const dealsServerModule: ServerModule = {
  key: "deals",
  eventHandlers: dealEventHandlers,
  filePurposes: [
    {
      key: BOOKING_DOCUMENT_PURPOSE,
      label: "booking documents",
      maxBytes: BOOKING_DOCUMENT_MAX_BYTES,
      allowedTypes: BOOKING_DOCUMENT_TYPES,
      uploadPermission: DEAL_PERMISSIONS.bookingsManage,
      canRead: (ctx, file) => canReadBookingDocument(ctx, file.id),
    },
  ],
  extensions: {
    "lead.status.changing": [closeLeadHook],
    "lead.list.filter": dealLeadFilters,
    "notifications.alert-rule": [visitsPendingOutcomeRule],
    "notifications.digest-section": [dealsDigestSection],
  },
};
