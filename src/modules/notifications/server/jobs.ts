import { z } from "zod";

import { defineJob } from "@/platform/jobs/define";
import { forEachOrganization } from "@/platform/tenant/organizations";

import { NOTIFICATION_JOBS } from "../constants";
import { evaluateAlertRules } from "./alerts";
import { publishDueAnnouncements, runPublishAnnouncementJob } from "./announcements";
import { deliverNotificationEmail } from "./delivery";
import { sendDailyDigests } from "./digest";
import { fireOverdueReminders, runReminderJob } from "./reminders";

/** Sends the e-mail of one notification (M06-04); retried with backoff, attempts tracked on the delivery. */
export const deliverEmailJob = defineJob({
  name: NOTIFICATION_JOBS.deliverEmail,
  description: "Send the e-mail of a notification",
  schema: z.object({ organizationId: z.uuid(), deliveryId: z.uuid() }),
  concurrency: 3,
  queue: { retryLimit: 5, retryDelay: 30, retryBackoff: true, retryDelayMax: 1800 },
  handler: (data, job) =>
    deliverNotificationEmail(data.organizationId, data.deliveryId, job.logger),
});

/** Fires one reminder at its time (M06-05); does nothing when it was moved or cancelled since. */
export const fireReminderJob = defineJob({
  name: NOTIFICATION_JOBS.fireReminder,
  description: "Send a scheduled reminder",
  schema: z.object({ organizationId: z.uuid(), reminderId: z.uuid(), fireAt: z.iso.datetime() }),
  concurrency: 3,
  handler: (data) => runReminderJob(data),
});

/** Notifies the audience when a scheduled announcement goes live (M06-09). */
export const publishAnnouncementJob = defineJob({
  name: NOTIFICATION_JOBS.publishAnnouncement,
  description: "Publish a scheduled announcement",
  schema: z.object({ organizationId: z.uuid(), announcementId: z.uuid() }),
  handler: (data) => runPublishAnnouncementJob(data),
});

/** Recovery sweep: reminders and announcements whose delayed job did not run (every 5 minutes). */
export const sweepJob = defineJob({
  name: NOTIFICATION_JOBS.sweep,
  description: "Send overdue reminders and announcements that missed their job",
  cron: { expression: "*/5 * * * *" },
  queue: { retryLimit: 1, expireInSeconds: 600 },
  handler: (_data, job) =>
    forEachOrganization(
      "Notification sweep",
      async (ctx) => {
        const now = new Date();
        await fireOverdueReminders(ctx, now, job.logger);
        await publishDueAnnouncements(ctx, now, job.logger);
      },
      job.logger,
    ),
});

/** Manager alert rules (M06-11), hourly. */
export const alertsJob = defineJob({
  name: NOTIFICATION_JOBS.alerts,
  description: "Evaluate manager alert rules",
  cron: { expression: "5 * * * *" },
  queue: { retryLimit: 1, expireInSeconds: 1800 },
  handler: (_data, job) =>
    forEachOrganization(
      "Manager alerts",
      (ctx) => evaluateAlertRules(ctx, new Date(), job.logger).then(() => undefined),
      job.logger,
    ),
});

/** Daily summaries (M06-12): checked every 15 minutes against each organization's local time. */
export const digestJob = defineJob({
  name: NOTIFICATION_JOBS.digest,
  description: "Send the daily summaries that are due",
  cron: { expression: "*/15 * * * *" },
  queue: { retryLimit: 1, expireInSeconds: 1800 },
  handler: (_data, job) =>
    forEachOrganization(
      "Daily summary",
      (ctx) => sendDailyDigests(ctx, new Date(), job.logger).then(() => undefined),
      job.logger,
    ),
});

export const notificationJobs = [
  deliverEmailJob,
  fireReminderJob,
  publishAnnouncementJob,
  sweepJob,
  alertsJob,
  digestJob,
];
