import type { XlsxColumn } from "@/platform/export/spreadsheet";
import type { ServiceContext } from "@/platform/tenant/context";

import type { ReportFilters } from "./metrics";

/**
 * The report catalogue (M10-08): every report can be shown as a table and exported. Report pages render their own
 * charts; this is the tabular form used by exports (and by the tests), computed by the same metrics service.
 */
export type Cell = string | number | null;

export interface TabularReport {
  title: string;
  columns: (XlsxColumn & { numeric?: boolean })[];
  rows: Cell[][];
}

export interface ReportDefinition {
  key: string;
  title: string;
  description: string;
  /** Group on the reports hub. */
  group: "Performance" | "Leads" | "Activities" | "Deals" | "Finance";
  href: string;
  /** Needed in addition to `reports.view` (e.g. finance reports). */
  permission?: string;
  /** Row-level reports that can grow large are always exported by the worker. */
  large?: boolean;
  /** Present when the report can be exported. */
  table?: (
    ctx: ServiceContext,
    filters: ReportFilters & Record<string, unknown>,
  ) => Promise<TabularReport>;
}

const registry = new Map<string, ReportDefinition>();

export function registerReports(definitions: readonly ReportDefinition[]) {
  for (const definition of definitions) registry.set(definition.key, definition);
}

export const getReportDefinition = (key: string) => registry.get(key);
export const listReportDefinitions = () => [...registry.values()];
