import "server-only";

import type { UiModule } from "@/platform/registry/ui";

import { LeadActivityActions } from "./components/lead-actions";
import { LeadCallsPanel, LeadFollowUpsPanel } from "./components/lead-panels";
import { ACTIVITY_PERMISSIONS } from "./permissions";

/** Server-rendered contributions of calls & follow-ups to the lead page (M07). */
export const activitiesUiModule: UiModule = {
  key: "activities",
  extensions: {
    "lead.detail.action": [
      {
        key: "activities.actions",
        order: 5,
        render: ({ lead }) => <LeadActivityActions lead={lead} />,
      },
    ],
    "lead.detail.panel": [
      {
        key: "calls",
        label: "Calls",
        order: 5,
        permission: ACTIVITY_PERMISSIONS.callsView,
        render: ({ leadId }) => <LeadCallsPanel leadId={leadId} />,
      },
      {
        key: "follow-ups",
        label: "Follow-ups",
        order: 6,
        permission: ACTIVITY_PERMISSIONS.followUpsView,
        render: ({ leadId }) => <LeadFollowUpsPanel leadId={leadId} />,
      },
    ],
  },
};
