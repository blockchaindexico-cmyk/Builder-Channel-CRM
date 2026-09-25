import type { UiModule } from "@/platform/registry/ui";

import { BookingFinancialsCard } from "./components/booking-financials-card";
import { FinanceWidget } from "./components/finance-widget";
import { BILLING_PERMISSIONS } from "./permissions";

/** Server-rendered contributions of billing (M09). */
export const billingUiModule: UiModule = {
  key: "billing",
  extensions: {
    "dashboard.widget": [
      {
        key: "billing.finance",
        order: 10,
        scopes: ["TEAM", "ALL"],
        render: (props) => <FinanceWidget {...props} />,
      },
    ],
    "booking.detail.panel": [
      {
        key: "billing.deal-financials",
        order: 10,
        permission: BILLING_PERMISSIONS.financeView,
        render: ({ bookingId }) => <BookingFinancialsCard bookingId={bookingId} />,
      },
    ],
  },
};
