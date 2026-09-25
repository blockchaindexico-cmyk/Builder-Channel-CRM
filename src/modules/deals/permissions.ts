/** Permissions of site visits, bookings & closures (M08-14). */
export const DEAL_PERMISSIONS = {
  /** See site visits (scope: whose — OWN = visits the member accompanies). */
  visitsView: "visits.view",
  /** Schedule and update visits on leads (scope: which leads, by owner). */
  visitsManage: "visits.manage",
  /** See bookings (scope: whose — OWN = bookings credited to the member). */
  bookingsView: "bookings.view",
  /** Create bookings on leads, edit them, move them through their stages and add documents (scope: by owner). */
  bookingsManage: "bookings.manage",
  /** Close bookings as won or cancel them (scope: by the booking's executive). */
  bookingsClose: "bookings.close",
  /** See and change booking values (agreement value, token amount) — Q-16. */
  bookingsViewValue: "bookings.view_value",
  /** Mark leads Lost or Not Interested (scope: which leads, by owner). */
  markLost: "leads.mark_lost",
  mastersManage: "deal_masters.manage",
} as const;
