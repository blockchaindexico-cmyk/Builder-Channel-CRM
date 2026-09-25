/** Public API of lead management (M04). Other modules import only from here. */
export { LEAD_ACTIVITY_TYPES, LEAD_STATUS_KEYS, STATUS_CATEGORIES } from "./constants";
export type {
  LeadActionTarget,
  LeadBulkAction,
  LeadCreatedHook,
  LeadCreatedHookInput,
  LeadDetailAction,
  LeadDetailPanel,
  LeadTimelineRenderer,
} from "./extensions";
export { leadsManifest } from "./manifest";
export { LEAD_PERMISSIONS } from "./permissions";
export {
  assertLeadVisible,
  LEAD_SORTABLE_FIELDS,
  type LeadFilters,
  type LeadRow,
  listLeads,
} from "./server/leads";
export { listCampaigns, listLeadSources, seedLeadMasters } from "./server/masters";
export { setLeadOwner } from "./server/owner";
export { findVisibleLead, isLeadInScope, leadScopeWhere } from "./server/scope";
export {
  countLeadsByOwner,
  countOpenLeadsByOwner,
  type LeadSummary,
  listLeadSummaries,
  listOpenLeadIdsOfOwner,
  OPEN_STATUS_CATEGORIES,
  type OwnerLeadCounts,
} from "./server/stats";
export { setLeadStatusByKey } from "./server/status";
export { recordLeadActivity } from "./server/timeline";
