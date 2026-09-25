import type { ClientUiModule } from "@/platform/registry/client-ui";

import { LossReasonFields } from "./components/loss-reason-fields";

/** Client components visits & bookings add to other modules (M08-11: the loss reason of a closed lead). */
export const dealsClientUi: ClientUiModule = {
  key: "deals",
  extensions: {
    "lead.status.fields": [{ key: "deals.loss-reason", order: 10, component: LossReasonFields }],
  },
};
