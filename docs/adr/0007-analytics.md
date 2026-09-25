# ADR 0007 — Metrics, aggregates and exports

- **Status:** Accepted (2026-09-25)
- **Related:** BUILD_PLAN M10, PRD §10, §13, §15, §16, §21, `docs/metrics.md`, decisions D-058 → D-061

## Context

Executives, managers and admins each need a dashboard for their scope and period, and the PRD lists a dozen reports
with the same filters and exports. Figures must agree everywhere, respect data scopes, use the organization's time
zone, and stay fast as the data grows to hundreds of thousands of leads and millions of activities.

## Decision

- **One definition per metric, in SQL.** `computeMemberDaily` counts every activity metric per member and local day
  straight from the activity tables, with optional builder / project / source / status filters. Dashboards, reports,
  exports and tests all read those rows; ratios (connect rate, adherence, visit → booking) are derived from them.
  Point-in-time figures (pipeline) and cohort figures (funnel, sources) have their own small queries on the same
  scope helpers.
- **Daily aggregates as the fast path.** `daily_member_stats` stores the unfiltered rows. Each activity event queues a
  refresh of the day it happened on — one queued job per organization and day (`short` queue policy, 20 s debounce) —
  and a nightly job at 02:00 local time reconciles the last 35 days (back-dated entries) and snapshots leads per owner
  and status (`daily_lead_snapshots`). Past days without dimension filters are read from the table; **today** and any
  filtered request are computed live, so dashboards are never stale. A test asserts stored = live.
- **Scope first.** `resolveReportScope` turns `reports.view` into member ids (OWN / TEAM / ALL) and intersects the team
  and executive filters; every query takes those ids. Lead-based figures include unassigned leads only for team and
  organization views without a person filter.
- **Extensible from the modules.** The reports hub is built from `report.catalog` manifest entries (billing lists its
  finance reports); the dashboard renders `dashboard.widget` contributions (billing's finance card); the profile gets a
  Performance tab through `profile.tab`. Analytics reads other modules' tables but never writes them.
- **Tables are exports.** Each exportable report defines its table once; the page renders it and CSV/XLSX exports write
  exactly those rows. Summary reports download at once; row-level ones (the lead database) are built by the worker
  as the requester (their current permissions), stored, announced by a notification and listed under *My exports*.
  Every export is audited.
- **Charts without a library.** Small HTML/CSS chart components (columns, ranked bars, funnel, stat tile) with a
  colour-vision-validated categorical palette defined for light and dark, a legend for two or more series, hover
  details and a table view on every chart.

## Consequences

- New metrics are added in one place and appear consistently; the aggregate table must be refreshed (nightly job or
  a one-off `refreshDailyStats`) after changing a definition.
- Filtered and same-day figures cost live queries; the load test (`pnpm perf:load`) keeps them in check.
- A dashboard figure can lag by the debounce (≈20 s) only for past days touched by a back-dated entry until the
  refresh or the nightly reconciliation runs.
