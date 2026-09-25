import "server-only";

import type { UiModule } from "@/platform/registry/ui";

import { AssignmentHistoryPanel } from "./components/assignment-history";
import { HandoverAction } from "./components/handover-action";
import { LeadAssignAction } from "./components/lead-assign-action";

/** Server-rendered contributions of lead assignment to other modules' pages (M05). */
export const assignmentUiModule: UiModule = {
  key: "assignment",
  extensions: {
    "lead.detail.action": [
      {
        key: "assignment.assign",
        order: 10,
        render: ({ lead }) => <LeadAssignAction lead={lead} />,
      },
    ],
    "lead.detail.panel": [
      {
        key: "assignments",
        label: "Assignments",
        order: 10,
        render: ({ leadId }) => <AssignmentHistoryPanel leadId={leadId} />,
      },
    ],
    "member.detail.action": [
      {
        key: "assignment.handover",
        order: 10,
        render: ({ membershipId }) => <HandoverAction membershipId={membershipId} />,
      },
    ],
  },
};
