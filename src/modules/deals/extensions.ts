import type { ReactNode } from "react";

/**
 * Extension points owned by site visits & bookings (M08).
 *
 * - `booking.detail.panel`: extra cards on the booking page, rendered on the server (M09 deal financials).
 */
export interface BookingDetailPanel {
  key: string;
  order: number;
  /** Shown only with this permission. */
  permission?: string;
  /** The card for the booking; null leaves it out. */
  render: (props: { bookingId: string }) => Promise<ReactNode> | ReactNode;
}

declare module "@/platform/registry/ui" {
  interface UiExtensionMap {
    "booking.detail.panel": BookingDetailPanel;
  }
}
