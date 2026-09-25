# ADR 0006 — Notifications & reminders engine

- **Status:** Accepted (2026-09-25)
- **Related:** BUILD_PLAN M06, PRD §9 (reminders), §18 (notifications), §21 (preferences), §26 (settings),
  ADR 0003 (domain events and jobs), decisions D-032 → D-037

## Context

"Nothing is forgotten" is a core promise of the CRM: new owners must hear about their leads within a minute,
follow-ups (M07) and site visits (M08) need reminders, and managers need to be told when work waits. Every later
module sends notifications, so the engine must be reusable, must not couple modules to each other and must survive
retries, restarts and bulk operations without spamming or losing anything.

## Decision

- **Types are data.** Modules declare notification types in their manifest (`contributions["notification.type"]`:
  key, label, category, default channels, `critical`, `forManagers`, e-mail button label). The organization can turn
  types off and change their default channels (Settings → Notifications); each person can switch channels per type
  (My profile → Notifications). Critical types cannot be switched off by anybody, only moved between channels, and a
  critical notification with no channel left still arrives in the app. Manager-only types are not offered to people
  who cannot receive them.
- **One entry point.** `notify(ctx, input, { tx })` resolves active recipients, applies settings and preferences,
  stores the in-app notification and, for e-mail, a `notification_deliveries` row plus a pg-boss job — all in the
  caller's transaction, so a rolled-back change notifies nobody. An idempotency key per recipient makes retried events,
  reminders and digests notify once.
- **Events drive notifications.** The notifications module subscribes to domain events (`lead.assigned`,
  `lead.reassigned`, `lead.unassigned`, `lead.duplicate_detected`, `lead.import_completed`, `lead.import_failed`);
  the modules that publish them know nothing about notifications. Nobody is notified about their own action.
- **Bulk changes are grouped.** Events of one request made in bulk (bulk assignment, import, hand-over) share a group
  key: the first creates the notification, the next ones count up and re-render its text ("12 new leads assigned to
  you"). The e-mail of a grouped notification waits 45 seconds so it reports the settled count.
- **E-mail delivery** is a job per delivery with retries and backoff; attempts, last error and sent time are kept on the
  delivery. Most types share one template (title, text, button to the deep link); the daily summary has its own.
- **Reminders** are rows in `scheduled_reminders` (the source of truth) identified by a `dedupeKey` chosen by the
  calling module (e.g. `follow-up:<id>`): scheduling the same key again moves the reminder, cancelling stops it. A
  delayed job fires it at `fireAt` (it does nothing when the reminder was moved or cancelled since) and a sweep every
  5 minutes fires what a job missed. Firing claims the row with a conditional update, so a reminder is sent once.
- **Scheduled work runs per tenant** (`forEachOrganization`): manager alert rules (hourly, sent 09:00–20:00 local time,
  once per day per rule and manager), the daily summary (checked every 15 minutes, sent once per local day at the
  configured time or within the three hours after it) and the recovery sweep. Alert rules and summary sections are
  server extension points (`notifications.alert-rule`, `notifications.digest-section`) that M07–M10 extend; the summary
  sections run with the recipient's own context, so their data scope applies.
- **Announcements** target everyone, some roles or a manager's reporting tree, notify their audience once when they go
  live (immediately or by a delayed job at the publish time, recovered by the sweep), show as a banner until dismissed
  or expired, and track who read them.
- **UI integration** goes through extension points: the shell renders `app.header.action` (the bell) and `app.banner`
  (announcements); identity's profile renders `profile.tab` (preferences). The bell polls a small JSON endpoint every
  30 seconds while the tab is visible and whenever the window regains focus.

## Consequences

- Adding a notification in a later module is a manifest entry plus a `notify()` call (usually from an event handler);
  reminders are `scheduleReminder` / `cancelReminder` calls inside the module's own transaction.
- Polling costs one indexed count and one small query per open tab every 30 seconds; server-sent events can replace it
  later without changing the engine.
- Web push (M06-13, could-have) is deferred; the channel list is an enum so it can be added as a third channel.
- Grouping is per request: a very long import can e-mail a partial count after 45 seconds while the in-app notification
  keeps counting.
