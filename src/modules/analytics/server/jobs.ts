import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import { z } from "zod";

import { getRegionalSettings } from "@/modules/organization";
import { defineJob } from "@/platform/jobs/define";
import { enqueueJob } from "@/platform/jobs/enqueue";
import { createSystemContext, type ServiceContext } from "@/platform/tenant/context";
import { forEachOrganization } from "@/platform/tenant/organizations";

import {
  ANALYTICS_JOBS,
  NIGHTLY_LOCAL_HOUR,
  RECONCILE_DAYS,
  REFRESH_DEBOUNCE_SECONDS,
} from "../constants";
import { refreshDailyStats, snapshotLeads } from "./aggregates";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Recomputes stored daily counters for some days of one organization (after activity, debounced). */
export const refreshDaysJob = defineJob({
  name: ANALYTICS_JOBS.refreshDays,
  description: "Recompute daily member statistics for recent activity",
  schema: z.object({ organizationId: z.uuid(), from: day, to: day }),
  // One queued refresh per organization and day: events of a burst share it (see `scheduleDayRefresh`).
  queue: { policy: "short", retryLimit: 3, expireInSeconds: 600 },
  async handler(data, job) {
    const ctx = createSystemContext(data.organizationId, { name: "Statistics refresh" });
    const { timezone } = await getRegionalSettings(ctx);
    const rows = await refreshDailyStats(ctx.db, data.organizationId, { ...data, timezone });
    job.logger.debug({ ...data, rows }, "daily statistics refreshed");
  },
});

/** Queues a refresh of `day` for the organization; events of the same day share one job. */
export async function scheduleDayRefresh(ctx: ServiceContext, dayValue: string) {
  await enqueueJob(
    ANALYTICS_JOBS.refreshDays,
    { organizationId: ctx.organizationId, from: dayValue, to: dayValue },
    { singletonKey: `${ctx.organizationId}:${dayValue}`, startAfter: REFRESH_DEBOUNCE_SECONDS },
  );
}

/**
 * Nightly work per organization, at its local 02:00: yesterday's lead snapshot and reconciliation of the last five
 * weeks of counters (M10-03). Runs hourly and acts only where it is that hour.
 */
export async function runNightly(ctx: ServiceContext, now: Date): Promise<boolean> {
  const { timezone } = await getRegionalSettings(ctx);
  const local = new TZDate(now, timezone);
  if (local.getHours() !== NIGHTLY_LOCAL_HOUR) return false;
  const today = format(local, "yyyy-MM-dd");
  const yesterday = format(addDays(local, -1), "yyyy-MM-dd");
  await snapshotLeads(ctx.db, ctx.organizationId, yesterday);
  await refreshDailyStats(ctx.db, ctx.organizationId, {
    from: format(addDays(local, -RECONCILE_DAYS), "yyyy-MM-dd"),
    to: today,
    timezone,
  });
  return true;
}

export const nightlyJob = defineJob({
  name: ANALYTICS_JOBS.nightly,
  description: "Lead snapshot and reconciliation of daily statistics (02:00 local time)",
  cron: { expression: "7 * * * *" },
  queue: { retryLimit: 1, expireInSeconds: 3000 },
  handler: (_data, job) =>
    forEachOrganization(
      "Statistics nightly",
      (ctx) => runNightly(ctx, new Date()).then(() => undefined),
      job.logger,
    ),
});

/** Builds a large report export in the background (M10-18). */
export const runExportJob = defineJob({
  name: ANALYTICS_JOBS.runExport,
  description: "Build a report export file",
  schema: z.object({ organizationId: z.uuid(), exportId: z.uuid() }),
  queue: { retryLimit: 1, expireInSeconds: 1800 },
  async handler(data, job) {
    // Loaded lazily: the export service enqueues jobs itself, which would make this module import itself.
    const { runReportExport } = await import("./exports");
    await runReportExport(data.organizationId, data.exportId, job.logger);
  },
});

export const analyticsJobs = [refreshDaysJob, nightlyJob, runExportJob];
