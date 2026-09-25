/** Public API of lead management (M04). Other modules import only from here. */
export { LEAD_ACTIVITY_TYPES, LEAD_STATUS_KEYS } from "./constants";
export { leadsManifest } from "./manifest";
export { LEAD_PERMISSIONS } from "./permissions";
export { assertLeadVisible } from "./server/leads";
export { seedLeadMasters } from "./server/masters";
export { findVisibleLead, isLeadInScope, leadScopeWhere } from "./server/scope";
export { setLeadStatusByKey } from "./server/status";
export { recordLeadActivity } from "./server/timeline";
