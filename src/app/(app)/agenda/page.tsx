import { CalendarCheck, CalendarClock, CircleCheck, PhoneCall } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { UrlTabs } from "@/components/shared/url-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { zonedClock } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import { FollowUpList } from "@/modules/activities/components/follow-up-list";
import { WeekCalendar } from "@/modules/activities/components/week-calendar";
import { ACTIVITY_PERMISSIONS } from "@/modules/activities/permissions";
import { getMyAgenda } from "@/modules/activities/server/agenda";
import type { FollowUpRow } from "@/modules/activities/server/follow-ups";
import { getRegionalSettings } from "@/modules/organization";
import { uiRegistry } from "@/modules/registry.ui";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "My agenda" };

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof PhoneCall;
  tone?: "warning";
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary",
            tone === "warning" && "bg-warning/15 text-warning-foreground dark:text-warning",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** "My agenda" (M07-14, PRD §10): overdue, today and upcoming follow-ups and callbacks, and the week. */
export default async function AgendaPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, ACTIVITY_PERMISSIONS.followUpsView);
  const now = new Date();
  const [agenda, regional, sections] = await Promise.all([
    getMyAgenda(ctx, now),
    getRegionalSettings(ctx),
    Promise.all(
      uiRegistry
        .extensions("agenda.section")
        .filter((section) => !section.permission || ctx.permissions.has(section.permission))
        .toSorted((a, b) => a.order - b.order)
        .map(async (section) => ({ key: section.key, tab: await section.load({ now }) })),
    ),
  ]);
  const canManage = ctx.permissions.has(ACTIVITY_PERMISSIONS.followUpsManage);
  const canCall = ctx.permissions.has(ACTIVITY_PERMISSIONS.callsLog);
  const list = (
    rows: FollowUpRow[],
    label: string,
    empty: { title: string; description: string },
  ) =>
    rows.length === 0 ? (
      <EmptyState icon={CalendarCheck} title={empty.title} description={empty.description} />
    ) : (
      <FollowUpList
        rows={rows}
        canManage={canManage}
        showLead
        showCall={canCall}
        label={label}
        now={now.toISOString()}
      />
    );

  return (
    <>
      <PageHeader
        title="My agenda"
        description="Your follow-ups, callbacks and site visits: what is overdue, due today and coming up."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Overdue" value={agenda.overdue.length} icon={CalendarClock} tone="warning" />
        <Stat label="Due today" value={agenda.today.length} icon={CalendarCheck} />
        <Stat
          label={`Calls today (${agenda.stats.connectedToday} reached)`}
          value={agenda.stats.callsToday}
          icon={PhoneCall}
        />
        <Stat label="Done today" value={agenda.stats.doneToday} icon={CircleCheck} />
      </div>
      <UrlTabs
        tabs={[
          {
            value: agenda.overdue.length > 0 ? "overdue" : "today",
            label:
              agenda.overdue.length > 0
                ? `Overdue (${agenda.overdue.length})`
                : `Today (${agenda.today.length})`,
            content:
              agenda.overdue.length > 0
                ? list(agenda.overdue, "Overdue", { title: "", description: "" })
                : list(agenda.today, "Due today", {
                    title: "Nothing due today",
                    description: "Schedule follow-ups from a lead's page or after a call.",
                  }),
          },
          ...(agenda.overdue.length > 0
            ? [
                {
                  value: "today",
                  label: `Today (${agenda.today.length})`,
                  content: list(agenda.today, "Due today", {
                    title: "Nothing else due today",
                    description: "Clear the overdue ones first.",
                  }),
                },
              ]
            : []),
          {
            value: "upcoming",
            label: `Upcoming (${agenda.upcoming.length})`,
            content: list(agenda.upcoming, "Upcoming", {
              title: "Nothing planned yet",
              description: "Follow-ups for the next two weeks will show here.",
            }),
          },
          {
            value: "week",
            label: "This week",
            content: (
              <WeekCalendar week={agenda.week} today={zonedClock(now, regional.timezone).date} />
            ),
          },
          ...sections.flatMap((section) =>
            section.tab
              ? [{ value: section.key, label: section.tab.label, content: section.tab.content }]
              : [],
          ),
        ]}
      />
    </>
  );
}
