/** Job names of dashboards & reports (M10). */
export const ANALYTICS_JOBS = {
  refreshDays: "analytics.refresh-days",
  nightly: "analytics.nightly",
  runExport: "analytics.run-export",
} as const;

/** Local hour at which yesterday's lead snapshot is taken and recent days are reconciled. */
export const NIGHTLY_LOCAL_HOUR = 2;
/** Days recomputed by the nightly reconciliation (late or back-dated entries). */
export const RECONCILE_DAYS = 35;
/** Seconds an activity waits before its day is recomputed, so bursts of events share one refresh. */
export const REFRESH_DEBOUNCE_SECONDS = 20;
