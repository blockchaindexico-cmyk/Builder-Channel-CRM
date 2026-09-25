import type { ClientUiModule } from "@/platform/registry/client-ui";

import { BulkAssignAction } from "./components/bulk-assign-action";

/** Client components lead assignment adds to other modules (M05-05). */
export const assignmentClientUi: ClientUiModule = {
  key: "assignment",
  extensions: {
    "lead.list.bulk-action": [
      { key: "assignment.bulk-assign", order: 10, component: BulkAssignAction },
    ],
  },
};
