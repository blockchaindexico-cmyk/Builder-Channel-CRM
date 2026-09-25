import type { UiModule } from "@/platform/registry/ui";

import { BookingFinancialsCard } from "./components/booking-financials-card";
import { BILLING_PERMISSIONS } from "./permissions";

/** Server-rendered contributions of billing (M09). */
export const billingUiModule: UiModule = {
  key: "billing",
  extensions: {
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
