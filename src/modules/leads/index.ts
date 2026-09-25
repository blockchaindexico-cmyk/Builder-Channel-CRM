/** Public API of lead management (M04). Other modules import only from here. */
export {
  LEAD_ACTIVITY_TYPES,
  LEAD_STATUS_KEYS,
  STATUS_CATEGORIES,
  SYSTEM_DRIVEN_STATUS_KEYS,
} from "./constants";
export type {
  LeadActionTarget,
  LeadBulkAction,
  LeadCreatedHook,
  LeadCreatedHookInput,
  LeadDetailAction,
  LeadDetailPanel,
  LeadListFilter,
  LeadListFilterOption,
  LeadTimelineRenderer,
} from "./extensions";
export { leadsManifest } from "./manifest";
export { LEAD_PERMISSIONS } from "./permissions";
export { type LeadEngagement, setLeadEngagement } from "./server/engagement";
export {
  assertLeadVisible,
  LEAD_SORTABLE_FIELDS,
  type LeadFilters,
  type LeadRow,
  listLeads,
} from "./server/leads";
export {
  type LeadStatusRow,
  listCampaigns,
  listLeadSources,
  listLeadStatuses,
  seedLeadMasters,
} from "./server/masters";
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
