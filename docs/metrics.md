# Metric definitions

Every dashboard, report and export computes these figures the same way (BUILD_PLAN §1.6, M10-01). They come from one
SQL definition per metric (`src/modules/analytics/server/member-daily.ts`) and one catalogue of labels
(`src/modules/analytics/metrics.ts`).

## Common rules

- **Days** are calendar days in the organization's time zone (Settings → Organization). A call at 00:30 IST on the
  11th counts on the 11th, although it is still the 10th in UTC.
- **Periods** are inclusive date ranges; the *previous period* is the range of the same length just before.
- **Scope.** Figures are limited to what the viewer's `reports.view` scope allows: their own work (OWN), their
  reporting tree (TEAM) or everyone (ALL). Choosing a team or an executive narrows further, never widens.
- **Attribution.** Activity counts for the **member who did it** (the caller, the member the follow-up or visit was
  assigned to, the executive credited with the booking). Lead outcomes (lost, not interested) count for the lead's
  **owner** at the time of the report.
- **Filters.** Builder and project filters use the lead's project interests for calls and follow-ups, and the
  visit's or booking's own project for visits and bookings. Source and status use the lead's source and *current*
  status.
- Deleted and merged leads never count.

## Activity counters (per member and day)

| Metric | Definition |
|---|---|
| Leads assigned | Assignments and reassignments received (`lead_assignments.assigned_at`). |
| Leads added | Leads created by the member (`leads.created_by_id`, by creation time). |
| Calls | Calls logged by the member (`call_logs.started_at`), connected or not. |
| Connected calls | Calls marked connected. **Connect rate** = connected ÷ calls. |
| Positive / negative / unresponsive calls | Calls by the *category* of their outcome: positive or interested; negative or not interested; unresponsive. Callback outcomes are counted as **callbacks asked**. |
| Talk time | Sum of call durations. |
| Follow-ups due | Follow-ups and callbacks whose due time falls on the day, excluding moved (rescheduled) and cancelled ones. |
| Done on time | Of those, the ones completed before they were marked missed. **Adherence** = done on time ÷ due. |
| Follow-ups done | Follow-ups and callbacks completed on the day (by whoever completed them). |
| Follow-ups missed | Follow-ups that passed their grace period without being done (`missed_at`). |
| Site visits / revisits | Visits completed on the day, first visits and revisits separately, for the member the visit was planned for. |
| No-shows | Visits marked no-show on the day. |
| Bookings | Bookings by **booking date**, for the credited executive. **Visit → booking** = bookings ÷ visits and revisits. |
| Closed / won | Bookings closed as won on the day. |
| Bookings cancelled | Bookings cancelled on the day. |
| Lost / not interested | Leads closed as lost / not interested on the day, for their owner. |

## Point-in-time figures ("now")

| Metric | Definition |
|---|---|
| Open leads | Leads whose status category is open, active or booking. |
| Pending leads | Open leads with an overdue follow-up or callback, **or** with nothing planned (no scheduled follow-up and no upcoming visit). |
| Unworked leads | Open leads assigned more than *N* hours ago (Settings → Lead assignment) with no activity since. |
| Overdue follow-ups | Follow-ups and callbacks past their due time and not done. |
| Unassigned leads | Open leads without an owner (team and organization views only). |

## Lead journey (cohort of leads created in the period)

Stages are cumulative — a lead booked without a recorded visit counts as visited — so each stage is a subset of the
one before: **leads → contacted** (a connected call or any later milestone) **→ visited → booked → closed / won**.
*Days to …* averages the days from the lead's creation to the first connected call, first visit, booking and closure,
for the leads that got there. Source and campaign performance is the same funnel per source (or campaign).

## Finance (with finance permissions)

Commission, net revenue and net profit follow the deal financials of M09 (see decision D-055): the period is the
closing date of the deal.
