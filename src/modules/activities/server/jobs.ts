import { defineJob } from "@/platform/jobs/define";
import { forEachOrganization } from "@/platform/tenant/organizations";

import { ACTIVITY_JOBS } from "../constants";
import { detectMissedFollowUps } from "./follow-ups";

/** Marks overdue follow-ups as missed after the grace period and tells their owners (M07-12), every 5 minutes. */
export const detectMissedJob = defineJob({
  name: ACTIVITY_JOBS.detectMissed,
  description: "Mark follow-ups missed after their grace period",
  cron: { expression: "*/5 * * * *" },
  queue: { retryLimit: 1, expireInSeconds: 600 },
  handler: (_data, job) =>
    forEachOrganization(
      "Follow-up check",
      (ctx) => detectMissedFollowUps(ctx, new Date(), job.logger).then(() => undefined),
      job.logger,
    ),
});
