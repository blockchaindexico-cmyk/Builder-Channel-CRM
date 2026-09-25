import Link from "next/link";
import type { ReactNode } from "react";

import { BarList } from "@/components/shared/charts/bar-list";
import { ColumnChart } from "@/components/shared/charts/column-chart";
import { Funnel } from "@/components/shared/charts/funnel";
import { StatTile } from "@/components/shared/charts/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateRangeLabel } from "@/lib/date-range";

import type { MetricKey } from "../metrics";
import { METRICS } from "../metrics";
import type { DashboardData } from "../server/dashboard";

const n = (value: number) => value.toLocaleString("en-IN");
const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** The role-adaptive dashboard (M10-04 → M10-06). Widgets of other modules follow in `widgets`. */
export function DashboardView({ data, widgets }: { data: DashboardData; widgets: ReactNode }) {
  const { summary, view, pipeline, agenda } = data;
  const current = summary.current;
  const tile = (
    key: MetricKey & keyof typeof summary.change,
    value: ReactNode,
    hint?: ReactNode,
    href?: string,
  ) => (
    <StatTile
      label={METRICS[key].label}
      value={value}
      change={summary.change[key]}
      higherIsBetter={METRICS[key].higherIsBetter}
      hint={hint}
      href={href}
    />
  );
  const previousLabel = formatDateRangeLabel(summary.previousRange, "d MMM");
  const otherCalls = (values: typeof current) =>
    Math.max(
      0,
      values.calls - values.callsPositive - values.callsNegative - values.callsUnresponsive,
    );

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Changes compare with {previousLabel}.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tile("leadsAssigned", n(current.leadsAssigned), `${n(current.leadsCreated)} added`)}
        {tile(
          "calls",
          n(current.calls),
          `${n(current.callsConnected)} connected · ${pct(current.connectRate)}`,
          "/calls",
        )}
        {tile(
          "followUpsCompleted",
          n(current.followUpsCompleted),
          `${n(current.followUpsDue)} due · ${pct(current.followUpAdherence)} on time`,
        )}
        {tile("followUpsMissed", n(current.followUpsMissed))}
        {tile(
          "visitsCompleted",
          n(current.visitsCompleted),
          `${n(current.revisitsCompleted)} revisits · ${n(current.visitsNoShow)} no-shows`,
          "/visits",
        )}
        {tile(
          "bookings",
          n(current.bookings),
          `${pct(current.visitToBooking)} of visits`,
          "/bookings",
        )}
        {tile("closures", n(current.closures), undefined, "/bookings?status=CLOSED_WON")}
        {tile(
          "lost",
          n(current.lost),
          `${n(current.notInterested)} not interested`,
          "/leads?closure=lost",
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {agenda ? (
          <Section
            title="Today"
            description="Planned for today and still overdue."
            action={
              <Link href="/agenda" className="text-sm text-primary hover:underline">
                Open agenda
              </Link>
            }
          >
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Figure label="Follow-ups due" value={agenda.followUpsDue} />
              <Figure label="Callbacks due" value={agenda.callbacksDue} />
              <Figure label="Site visits" value={agenda.visitsToday} />
              <Figure label="Done today" value={agenda.followUpsDone} />
              <Figure label="Overdue" value={agenda.overdue} attention />
            </dl>
          </Section>
        ) : null}
        <Section title="Leads now" description="Where the leads stand, whatever the period.">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Figure label="Open" value={pipeline.open} href="/leads?open=true" />
            <Figure
              label="Pending"
              value={pipeline.pending}
              attention
              hint="overdue or nothing planned"
            />
            <Figure
              label="Unworked"
              value={pipeline.unworked}
              attention
              hint="no activity since assigned"
            />
            <Figure label="Overdue follow-ups" value={pipeline.overdueFollowUps} attention />
            {pipeline.unassigned !== null ? (
              <Figure
                label="Unassigned"
                value={pipeline.unassigned}
                href="/leads/unassigned"
                attention
              />
            ) : null}
          </dl>
        </Section>
        <Section title="Call outcomes" description="Calls of the period by how they went.">
          <BarList
            title="Call outcomes"
            items={[
              { key: "positive", label: "Positive", values: [current.callsPositive] },
              { key: "negative", label: "Negative", values: [current.callsNegative] },
              { key: "unresponsive", label: "Unresponsive", values: [current.callsUnresponsive] },
              { key: "other", label: "Callback / other", values: [otherCalls(current)] },
            ]}
          />
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Calls" description={chartDescription(data)}>
          <ColumnChart
            title="Calls by outcome"
            data={data.series.map((point) => ({
              key: point.key,
              label: point.label,
              values: {
                positive: point.values.callsPositive,
                negative: point.values.callsNegative,
                unresponsive: point.values.callsUnresponsive,
                other: otherCalls(point.values),
              },
            }))}
            series={[
              { key: "positive", label: "Positive", slot: 1 },
              { key: "negative", label: "Negative", slot: 2 },
              { key: "unresponsive", label: "Unresponsive", slot: 3 },
              { key: "other", label: "Callback / other", slot: 4 },
            ]}
          />
        </Section>
        <Section title="Site visits" description={chartDescription(data)}>
          <ColumnChart
            title="Site visits and revisits"
            data={data.series.map((point) => ({
              key: point.key,
              label: point.label,
              values: {
                visits: point.values.visitsCompleted,
                revisits: point.values.revisitsCompleted,
              },
            }))}
            series={[
              { key: "visits", label: "First visits", slot: 1 },
              { key: "revisits", label: "Revisits", slot: 2 },
            ]}
          />
        </Section>
      </div>

      {view !== "OWN" ? <TeamSection data={data} /> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        {data.funnel ? (
          <Section
            title="Lead journey"
            description="Leads created in the period and how far they have come."
          >
            <Funnel
              title="Lead journey"
              steps={[
                { key: "created", label: "Leads", value: data.funnel.created },
                { key: "contacted", label: "Contacted", value: data.funnel.contacted },
                { key: "visited", label: "Visited", value: data.funnel.visited },
                { key: "booked", label: "Booked", value: data.funnel.booked },
                { key: "won", label: "Closed / won", value: data.funnel.won },
              ]}
            />
          </Section>
        ) : null}
        <Section title="Leads by status" description="All leads in scope, by their current status.">
          <BarList
            title="Leads by status"
            items={pipeline.byStatus.map((status) => ({
              key: status.statusId,
              label: status.label,
              values: [status.count],
              href: `/leads?status=${status.statusId}`,
            }))}
            empty="No leads yet."
          />
        </Section>
      </div>

      {view !== "OWN" && data.projects.length ? (
        <Section
          title="Projects"
          description="Visits, bookings and closures of the period by project."
        >
          <BarList
            title="Projects"
            segments={[
              { label: "Visits and revisits", slot: 1 },
              { label: "Bookings", slot: 2 },
            ]}
            items={data.projects.slice(0, 12).map((project) => ({
              key: project.projectId,
              label: project.projectName,
              hint: project.builderName,
              values: [project.visits + project.revisits, project.bookings],
              display: `${n(project.visits + project.revisits)} visits · ${n(project.bookings)} booked · ${n(project.closures)} closed`,
            }))}
          />
        </Section>
      ) : null}

      {view === "ALL" && data.sources.length ? (
        <Section
          title="Lead sources"
          description="Leads created in the period by source, and what came of them."
        >
          <SourceTable sources={data.sources} />
        </Section>
      ) : null}

      {widgets}
    </div>
  );
}

function chartDescription(data: DashboardData) {
  return data.period.range.from === data.period.range.to
    ? "The last 14 days."
    : `Per ${data.period.granularity} of the period.`;
}

function Figure({
  label,
  value,
  hint,
  href,
  attention,
}: {
  label: string;
  value: number;
  hint?: string;
  href?: string;
  attention?: boolean;
}) {
  const content = (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          attention && value > 0
            ? "text-xl font-semibold text-warning-foreground dark:text-warning"
            : "text-xl font-semibold"
        }
      >
        {n(value)}
      </dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-md hover:bg-muted/50">
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  );
}

function TeamSection({ data }: { data: DashboardData }) {
  const members = [...data.members].sort(
    (a, b) =>
      b.values.closures - a.values.closures ||
      b.values.bookings - a.values.bookings ||
      b.values.calls - a.values.calls ||
      a.name.localeCompare(b.name),
  );
  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Section
        title={data.view === "ALL" ? "Team performance" : "My team"}
        description="Ranked by closures, then bookings and calls."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Connect</TableHead>
                <TableHead className="text-right">Follow-ups</TableHead>
                <TableHead className="text-right">On time</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Lost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.memberId}>
                  <TableCell>
                    <Link
                      href={`/reports/executives?executive=${member.memberId}&from=${data.period.range.from}&to=${data.period.range.to}`}
                      className="font-medium hover:underline"
                    >
                      {member.name}
                    </Link>
                    {member.managerName ? (
                      <span className="block text-xs text-muted-foreground">
                        {member.managerName}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {n(member.values.calls)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(member.values.connectRate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {n(member.values.followUpsCompleted)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(member.values.followUpAdherence)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {n(member.values.visitsCompleted + member.values.revisitsCompleted)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {n(member.values.bookings)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {n(member.values.closures)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{n(member.values.lost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
      <Section title="Call patterns" description="How each member's calls went.">
        <BarList
          title="Call patterns by member"
          segments={[
            { label: "Positive", slot: 1 },
            { label: "Negative", slot: 2 },
            { label: "Unresponsive", slot: 3 },
            { label: "Callback / other", slot: 4 },
          ]}
          items={members
            .filter((member) => member.values.calls > 0)
            .sort((a, b) => b.values.calls - a.values.calls)
            .map((member) => ({
              key: member.memberId,
              label: member.name,
              values: [
                member.values.callsPositive,
                member.values.callsNegative,
                member.values.callsUnresponsive,
                Math.max(
                  0,
                  member.values.calls -
                    member.values.callsPositive -
                    member.values.callsNegative -
                    member.values.callsUnresponsive,
                ),
              ],
            }))}
          empty="No calls in this period."
        />
      </Section>
    </div>
  );
}

function SourceTable({ sources }: { sources: DashboardData["sources"] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Contacted</TableHead>
            <TableHead className="text-right">Visited</TableHead>
            <TableHead className="text-right">Booked</TableHead>
            <TableHead className="text-right">Won</TableHead>
            <TableHead className="text-right">Conversion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((source) => (
            <TableRow key={source.key}>
              <TableCell className="font-medium">{source.sourceName}</TableCell>
              <TableCell className="text-right tabular-nums">{n(source.created)}</TableCell>
              <TableCell className="text-right tabular-nums">{n(source.contacted)}</TableCell>
              <TableCell className="text-right tabular-nums">{n(source.visited)}</TableCell>
              <TableCell className="text-right tabular-nums">{n(source.booked)}</TableCell>
              <TableCell className="text-right tabular-nums">{n(source.won)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {source.created ? `${Math.round((source.won / source.created) * 1000) / 10}%` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
