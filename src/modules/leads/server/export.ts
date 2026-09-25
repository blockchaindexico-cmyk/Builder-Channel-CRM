import { TZDate } from "@date-fns/tz";
import { format as formatDate } from "date-fns";

import type { Prisma } from "@/generated/prisma/client";
import { plural } from "@/lib/utils";
import { getRegionalSettings } from "@/modules/organization";
import { recordAudit } from "@/platform/audit";
import { ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { BUYING_TIMELINES, PURPOSES, TEMPERATURES } from "../constants";
import { LEAD_PERMISSIONS } from "../permissions";
import { type ExportRequestInput, exportRequestSchema, MAX_EXPORT_ROWS } from "../schemas";
import { CSV_TYPE, writeCsv, writeXlsx, XLSX_TYPE, type XlsxColumn } from "./import/spreadsheet";
import { buildLeadWhere } from "./leads";
import { loadLeadListParams, resolveLeadListRequest } from "./list-query";
import { leadScopeWhere } from "./scope";

/**
 * Lead export (M04-19): the leads the person is looking at (view, search and filters) or the rows they selected,
 * limited to their data scope, as CSV or Excel. Column names match the import template, so an export can be edited
 * and imported again. Every export is audited.
 */
export interface LeadExport {
  fileName: string;
  contentType: string;
  body: Uint8Array | string;
  count: number;
}

const COLUMNS: XlsxColumn[] = [
  { header: "Lead number", width: 14 },
  { header: "Name", width: 26 },
  { header: "Mobile", width: 18 },
  { header: "Alternate mobile", width: 18 },
  { header: "E-mail", width: 28 },
  { header: "City" },
  { header: "Locality" },
  { header: "Address", width: 30 },
  { header: "Status", width: 16 },
  { header: "Owner", width: 20 },
  { header: "Owner e-mail", width: 26 },
  { header: "Source", width: 16 },
  { header: "Campaign", width: 18 },
  { header: "Source detail", width: 18 },
  { header: "Budget from", width: 14, numFmt: "#,##0" },
  { header: "Budget up to", width: 14, numFmt: "#,##0" },
  { header: "Property type", width: 16 },
  { header: "Configurations", width: 18 },
  { header: "Preferred locations", width: 22 },
  { header: "Purpose" },
  { header: "Buying timeline", width: 18 },
  { header: "Temperature" },
  { header: "Tags", width: 18 },
  { header: "Projects of interest", width: 30 },
  { header: "Requirement notes", width: 40 },
  { header: "Received via", width: 14 },
  { header: "Created", width: 18 },
  { header: "Created by", width: 20 },
  { header: "Status since", width: 18 },
  { header: "Last activity", width: 18 },
  { header: "Possible duplicate of", width: 20 },
];

const exportInclude = {
  status: { select: { label: true } },
  owner: { select: { user: { select: { name: true, email: true } } } },
  createdBy: { select: { user: { select: { name: true } } } },
  source: { select: { name: true } },
  campaign: { select: { name: true } },
  propertyType: { select: { name: true } },
  duplicateOf: { select: { number: true } },
  interests: {
    select: { project: { select: { code: true, name: true } } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.LeadInclude;

const CHANNEL_LABELS = { MANUAL: "Entered by hand", IMPORT: "Import", API: "Intake API" } as const;
const label = (choices: readonly { value: string; label: string }[], value: string | null) =>
  value ? (choices.find((choice) => choice.value === value)?.label ?? value) : "";

/** Budgets are exact decimals; spreadsheets get whole rupees as numbers (the paise are always .00 in practice). */
function amount(value: Prisma.Decimal | null, format: "csv" | "xlsx"): string | number | null {
  if (!value) return null;
  const text = value.toFixed(2).replace(/\.00$/, "");
  return format === "xlsx" && !text.includes(".") ? Number(text) : text;
}

export async function exportLeads(
  ctx: ServiceContext,
  input: ExportRequestInput,
): Promise<LeadExport> {
  ctx.permissions.assert(LEAD_PERMISSIONS.export);
  const { format, query, ids } = parseInput(exportRequestSchema, input);

  let where: Prisma.LeadWhereInput;
  let scopeDescription: Record<string, unknown>;
  if (ids?.length) {
    where = { AND: [await leadScopeWhere(ctx), { id: { in: ids } }] };
    scopeDescription = { selected: ids.length };
  } else {
    const request = await resolveLeadListRequest(ctx, await loadLeadListParams(query ?? ""));
    where = await buildLeadWhere(ctx, request.query, request.filters);
    scopeDescription = { view: request.view, query: query ?? "" };
  }

  const count = await ctx.db.lead.count({ where });
  if (count === 0) throw new ValidationError("There are no leads to export.");
  if (count > MAX_EXPORT_ROWS) {
    throw new ValidationError(
      `${count.toLocaleString("en-IN")} leads match. Narrow the filters to at most ${MAX_EXPORT_ROWS.toLocaleString("en-IN")} leads per export.`,
    );
  }

  const regional = await getRegionalSettings(ctx);
  const when = (value: Date | null) =>
    value ? formatDate(new TZDate(value, regional.timezone), "yyyy-MM-dd HH:mm") : "";
  const configurationNames = new Map(
    (await ctx.db.configurationType.findMany({ select: { id: true, name: true } })).map((type) => [
      type.id,
      type.name,
    ]),
  );

  const rows: (string | number | null)[][] = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await ctx.db.lead.findMany({
      where,
      include: exportInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1000,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const lead of batch) {
      rows.push([
        lead.number,
        lead.name,
        lead.mobileNormalized ?? lead.mobile ?? "",
        lead.alternateMobileNormalized ?? lead.alternateMobile ?? "",
        lead.email ?? "",
        lead.city ?? "",
        lead.locality ?? "",
        lead.address ?? "",
        lead.status.label,
        lead.owner?.user.name ?? "",
        lead.owner?.user.email ?? "",
        lead.source?.name ?? "",
        lead.campaign?.name ?? "",
        lead.subSource ?? "",
        amount(lead.budgetMin, format),
        amount(lead.budgetMax, format),
        lead.propertyType?.name ?? "",
        lead.configurationTypeIds.map((id) => configurationNames.get(id) ?? "").join(", "),
        lead.preferredLocations.join(", "),
        label(PURPOSES, lead.purpose),
        label(BUYING_TIMELINES, lead.buyingTimeline),
        label(TEMPERATURES, lead.temperature),
        lead.tags.join(", "),
        lead.interests.map((interest) => interest.project.code).join(", "),
        lead.requirementNotes ?? "",
        CHANNEL_LABELS[lead.channel],
        when(lead.createdAt),
        lead.createdBy?.user.name ?? "",
        when(lead.statusChangedAt),
        when(lead.lastActivityAt),
        lead.duplicateOf?.number ?? "",
      ]);
    }
    if (batch.length < 1000) break;
    cursor = batch[batch.length - 1]!.id;
  }

  const stamp = formatDate(new TZDate(new Date(), regional.timezone), "yyyy-MM-dd-HHmm");
  const fileName = `leads-${stamp}.${format}`;
  const body =
    format === "csv"
      ? writeCsv(
          COLUMNS.map((column) => column.header),
          rows,
        )
      : await writeXlsx("Leads", COLUMNS, rows);

  await recordAudit(ctx.db, ctx, {
    action: "lead.export",
    entityType: "Lead",
    summary: `Exported ${plural(rows.length, "lead")} (${format.toUpperCase()})`,
    metadata: { count: rows.length, format, ...scopeDescription },
  });
  return {
    fileName,
    contentType: format === "csv" ? CSV_TYPE : XLSX_TYPE,
    body,
    count: rows.length,
  };
}
