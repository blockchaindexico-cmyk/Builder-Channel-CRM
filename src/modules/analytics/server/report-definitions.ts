import type { ServiceContext } from "@/platform/tenant/context";

import { registerReports } from "./catalog";
import { getFunnel, getSourcePerformance } from "./insights";
import { getMemberMetrics } from "./metrics";
import { type ReportParams, resolveReportParams } from "./report-params";
import {
  callsTable,
  executivesReport,
  followUpsTable,
  openFollowUps,
  performanceTable,
  visitsTable,
} from "./reports/activity";
import { bookingsReport, bookingsTable, lostReport, lostTable } from "./reports/deals";
import { funnelTable, LEAD_REPORT_MAX_ROWS, leadReportRows, leadsTable } from "./reports/leads";

/**
 * The analytics module's reports for export (M10-08, M10-18): each resolves the same URL parameters as its page, so
 * a download is exactly what is on screen.
 */
const resolve = (ctx: ServiceContext, params: Record<string, unknown>) =>
  resolveReportParams(ctx, params as ReportParams);

registerReports([
  {
    key: "executives",
    title: "Executives & teams",
    description: "Activity and results per executive or team.",
    group: "Performance",
    href: "/reports/executives",
    table: async (ctx, params) => {
      const report = await resolve(ctx, params);
      const data = await executivesReport(ctx, report);
      return performanceTable(
        data.grouping === "team" ? "Teams" : "Executives",
        data.grouping === "team" ? "Team" : "Executive",
        data.rows,
      );
    },
  },
  {
    key: "calls",
    title: "Calling",
    description: "Calls per executive.",
    group: "Activities",
    href: "/reports/calls",
    table: async (ctx, params) => {
      const report = await resolve(ctx, params);
      return callsTable(await getMemberMetrics(ctx, report.filters, report.scope));
    },
  },
  {
    key: "follow-ups",
    title: "Follow-ups",
    description: "Follow-ups per executive.",
    group: "Activities",
    href: "/reports/follow-ups",
    table: async (ctx, params) => {
      const report = await resolve(ctx, params);
      const [members, open] = await Promise.all([
        getMemberMetrics(ctx, report.filters, report.scope),
        openFollowUps(ctx, report),
      ]);
      return followUpsTable(members, open);
    },
  },
  {
    key: "visits",
    title: "Site visits",
    description: "Visits per executive.",
    group: "Deals",
    href: "/reports/visits",
    table: async (ctx, params) => {
      const report = await resolve(ctx, params);
      return visitsTable(await getMemberMetrics(ctx, report.filters, report.scope));
    },
  },
  {
    key: "bookings",
    title: "Bookings & closed business",
    description: "Bookings and closures by dimension.",
    group: "Deals",
    href: "/reports/bookings",
    table: async (ctx, params) =>
      bookingsTable(await bookingsReport(ctx, await resolve(ctx, params))),
  },
  {
    key: "lost",
    title: "Lost leads",
    description: "Leads lost in the period.",
    group: "Leads",
    href: "/reports/lost",
    table: async (ctx, params) =>
      lostTable((await lostReport(ctx, await resolve(ctx, params), 50_000)).recent),
  },
  {
    key: "funnel",
    title: "Funnel & sources",
    description: "Conversion by source and campaign.",
    group: "Leads",
    href: "/reports/funnel",
    table: async (ctx, params) => {
      const report = await resolve(ctx, params);
      const [funnel, sources] = await Promise.all([
        getFunnel(ctx, report.filters, report.scope),
        getSourcePerformance(ctx, report.filters, { byCampaign: true }, report.scope),
      ]);
      return funnelTable(funnel, sources);
    },
  },
  {
    key: "leads",
    title: "Lead database",
    description: "Every lead of the period.",
    group: "Leads",
    href: "/reports/leads",
    large: true,
    table: async (ctx, params) => {
      const report = await resolve(ctx, params);
      const { rows } = await leadReportRows(ctx, report, { skip: 0, take: LEAD_REPORT_MAX_ROWS });
      return leadsTable(rows);
    },
  },
]);
