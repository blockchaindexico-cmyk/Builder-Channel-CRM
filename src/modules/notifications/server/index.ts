import type { ServerModule } from "@/platform/registry/server";

import { leadsDigestSection } from "./builtin/leads-digest";
import { unworkedLeadsRule } from "./builtin/unworked-leads";
import { notificationEventHandlers } from "./handlers";
import { notificationJobs } from "./jobs";

/** Server contributions of the notifications engine (M06). */
export const notificationsServerModule: ServerModule = {
  key: "notifications",
  jobs: notificationJobs,
  eventHandlers: notificationEventHandlers,
  extensions: {
    "notifications.alert-rule": [unworkedLeadsRule],
    "notifications.digest-section": [leadsDigestSection],
  },
};
