import {
  createLoader,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { isIsoDate } from "@/lib/date-range";
import { type TableQuery, toTableQuery } from "@/lib/table-query";
import { getRegionalSettings } from "@/modules/organization";
import type { ServiceContext } from "@/platform/tenant/context";

import {
  getLeadListOptions,
  LEAD_SORTABLE_FIELDS,
  LEAD_VIEWS,
  type LeadFilters,
  type LeadListOptions,
  type LeadView,
} from "./leads";

/**
 * The lead list's URL (M04-12 → M04-14): view, search, sort, paging and filters. Parsed the same way for the list
 * page and for exports of "what I am looking at" (M04-19).
 */
export const loadLeadListParams = createLoader({
  ...tableSearchParams,
  view: parseAsStringLiteral(LEAD_VIEWS),
  status: parseAsString,
  category: parseAsString,
  source: parseAsString,
  campaign: parseAsString,
  owner: parseAsString,
  team: parseAsString,
  project: parseAsString,
  builder: parseAsString,
  temperature: parseAsString,
  tag: parseAsString,
  import: parseAsString,
  unworked: parseAsInteger,
  open: parseAsBoolean,
  createdFrom: parseAsString,
  createdTo: parseAsString,
  activityFrom: parseAsString,
  activityTo: parseAsString,
});

export type LeadListParams = Awaited<ReturnType<typeof loadLeadListParams>>;

const range = (from: string | null, to: string | null) =>
  isIsoDate(from) && isIsoDate(to) ? { from, to } : null;

export interface LeadListRequest {
  view: LeadView;
  query: TableQuery;
  filters: LeadFilters;
  listOptions: LeadListOptions;
}

export async function resolveLeadListRequest(
  ctx: ServiceContext,
  params: LeadListParams,
): Promise<LeadListRequest> {
  const [listOptions, regional] = await Promise.all([
    getLeadListOptions(ctx),
    getRegionalSettings(ctx),
  ]);
  const view =
    params.view && listOptions.views.includes(params.view) ? params.view : listOptions.views[0]!;
  const query = toTableQuery(params, {
    sortable: LEAD_SORTABLE_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  return {
    view,
    query,
    listOptions,
    filters: {
      // Leads of one import are shown across views (within the scope) unless a view is chosen.
      view: params.import && !params.view ? null : view,
      statusIds: params.status ? [params.status] : null,
      statusCategory: params.category,
      sourceId: params.source,
      campaignId: params.campaign,
      ownerId: params.owner,
      teamOf: params.team,
      projectId: params.project,
      builderId: params.builder,
      temperature: params.temperature,
      tag: params.tag,
      importBatchId: params.import,
      openOnly: params.open === true,
      unworkedHours:
        params.unworked && params.unworked > 0 ? Math.min(params.unworked, 24 * 90) : null,
      created: range(params.createdFrom, params.createdTo),
      lastActivity: range(params.activityFrom, params.activityTo),
      timezone: regional.timezone,
    },
  };
}
