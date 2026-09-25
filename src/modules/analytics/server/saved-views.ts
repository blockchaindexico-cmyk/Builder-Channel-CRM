import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";

import { ANALYTICS_PERMISSIONS } from "../permissions";
import { REPORT_PARAM_KEYS } from "./report-params";

/** Saved report filters (M10-08): personal, per report; only the known filter parameters are kept. */
export interface SavedReportViewRow {
  id: string;
  name: string;
  query: string;
}

export function cleanReportQuery(query: string): string {
  const input = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const output = new URLSearchParams();
  for (const key of REPORT_PARAM_KEYS) {
    const value = input.get(key);
    if (value && value.length <= 100) output.set(key, value);
  }
  return output.toString();
}

export async function listSavedReportViews(
  ctx: ServiceContext,
  report: string,
): Promise<SavedReportViewRow[]> {
  if (!ctx.actor.membershipId) return [];
  return ctx.db.savedReportView.findMany({
    where: { membershipId: ctx.actor.membershipId, report },
    orderBy: { name: "asc" },
    select: { id: true, name: true, query: true },
  });
}

export async function saveReportView(
  ctx: ServiceContext,
  input: { report: string; name: string; query: string },
): Promise<{ id: string }> {
  ctx.permissions.assert(ANALYTICS_PERMISSIONS.reportsView);
  const membershipId = ctx.actor.membershipId;
  if (!membershipId) throw new ValidationError("Views are saved by members.");
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw new ValidationError("Name the view.", { name: ["Too short"] });
  if (!/^[a-z-]{2,40}$/.test(input.report)) throw new ValidationError("Unknown report.");
  const query = cleanReportQuery(input.query);
  const existing = await ctx.db.savedReportView.findFirst({
    where: { membershipId, report: input.report, name },
    select: { id: true },
  });
  if (existing) {
    await ctx.db.savedReportView.update({ where: { id: existing.id }, data: { query } });
    return existing;
  }
  const count = await ctx.db.savedReportView.count({
    where: { membershipId, report: input.report },
  });
  if (count >= 20) throw new ConflictError("You can keep up to 20 views per report.");
  const created = await ctx.db.savedReportView.create({
    data: { organizationId: ctx.organizationId, membershipId, report: input.report, name, query },
  });
  return { id: created.id };
}

export async function deleteReportView(ctx: ServiceContext, viewId: string) {
  const { count } = await ctx.db.savedReportView.deleteMany({
    where: { id: viewId, membershipId: ctx.actor.membershipId ?? "" },
  });
  if (count === 0) throw new NotFoundError("Saved view", viewId);
}
