import "server-only";

import type { UiModule } from "@/platform/registry/ui";

import { loadAgendaVisits } from "./components/agenda-visits";
import { LeadDealActions } from "./components/lead-actions";
import { LeadBookingsPanel, LeadVisitsPanel } from "./components/lead-panels";
import { DEAL_PERMISSIONS } from "./permissions";

/** Server-rendered contributions of visits & bookings to the lead page (M08). */
export const dealsUiModule: UiModule = {
  key: "deals",
  extensions: {
    "lead.detail.action": [
      {
        key: "deals.actions",
        order: 8,
        render: ({ lead }) => <LeadDealActions lead={lead} />,
      },
    ],
    "agenda.section": [
      {
        key: "visits",
        order: 10,
        permission: DEAL_PERMISSIONS.visitsView,
        load: loadAgendaVisits,
      },
    ],
    "lead.detail.panel": [
      {
        key: "visits",
        label: "Visits",
        order: 7,
        permission: DEAL_PERMISSIONS.visitsView,
        render: ({ leadId }) => <LeadVisitsPanel leadId={leadId} />,
      },
      {
        key: "bookings",
        label: "Bookings",
        order: 8,
        permission: DEAL_PERMISSIONS.bookingsView,
        render: ({ leadId }) => <LeadBookingsPanel leadId={leadId} />,
      },
    ],
  },
};
