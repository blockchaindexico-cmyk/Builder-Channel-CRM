import { ListTodo } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FollowUpList } from "@/modules/activities/components/follow-up-list";
import { ACTIVITY_PERMISSIONS } from "@/modules/activities/permissions";
import {
  getTeamFollowUpBoard,
  listTeamFollowUps,
  type TeamBucket,
} from "@/modules/activities/server/agenda";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Team follow-ups" };

const BUCKETS = ["overdue", "today", "upcoming", "missed"] as const;
const BUCKET_LABELS: Record<TeamBucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Next 7 days",
  missed: "Missed",
};

const loadParams = createLoader({
  member: parseAsString,
  bucket: parseAsStringLiteral(BUCKETS),
});

/** Manager follow-up board (M07-15): pending and overdue follow-ups per person, with drill-down. */
export default async function TeamFollowUpsPage({ searchParams }: PageProps<"/team/follow-ups">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ACTIVITY_PERMISSIONS.teamFollowUpsView);
  const { member, bucket } = await loadParams(searchParams);
  const now = new Date();
  const board = await getTeamFollowUpBoard(ctx, now);
  const selected =
    member && bucket ? board.find((row) => (row.membershipId ?? "unassigned") === member) : null;
  const detail = selected
    ? await listTeamFollowUps(ctx, { assigneeId: member, bucket: bucket! }, now)
    : null;

  const cell = (row: (typeof board)[number], key: TeamBucket, value: number, warn = false) => {
    const active = selected === row && bucket === key;
    return value > 0 ? (
      <Link
        href={`/team/follow-ups?member=${row.membershipId ?? "unassigned"}&bucket=${key}`}
        aria-label={`${BUCKET_LABELS[key]} of ${row.name}: ${value}`}
        aria-current={active ? "true" : undefined}
        className={cn(
          "inline-flex min-w-8 justify-center rounded-md px-2 py-0.5 font-medium tabular-nums hover:bg-muted",
          warn && "bg-warning/15 text-warning-foreground dark:text-warning",
          active && "ring-2 ring-primary",
        )}
      >
        {value}
      </Link>
    ) : (
      <span className="inline-flex min-w-8 justify-center text-muted-foreground tabular-nums">
        0
      </span>
    );
  };

  return (
    <>
      <PageHeader
        title="Team follow-ups"
        description="Pending and overdue follow-ups and callbacks of the people you manage."
      />
      {board.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Nobody to show"
          description="People in your team appear here."
        />
      ) : (
        <div className="rounded-lg border">
          <Table aria-label="Follow-ups per person">
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead className="text-center">Overdue</TableHead>
                <TableHead className="text-center">Due today</TableHead>
                <TableHead className="text-center">Next 7 days</TableHead>
                <TableHead className="text-center">Missed</TableHead>
                <TableHead className="text-center">Done today</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {board.map((row) => (
                <TableRow key={row.membershipId ?? "unassigned"}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-center">
                    {cell(row, "overdue", row.overdue, true)}
                  </TableCell>
                  <TableCell className="text-center">{cell(row, "today", row.dueToday)}</TableCell>
                  <TableCell className="text-center">
                    {cell(row, "upcoming", row.upcoming)}
                  </TableCell>
                  <TableCell className="text-center">
                    {cell(row, "missed", row.missed, true)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{row.doneToday}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {selected && detail ? (
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold">
            {BUCKET_LABELS[bucket!]} — {selected.name}
          </h2>
          {detail.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing left here.</p>
          ) : (
            <FollowUpList
              rows={detail}
              canManage={ctx.permissions.has(ACTIVITY_PERMISSIONS.followUpsManage)}
              showLead
              label={`${BUCKET_LABELS[bucket!]} of ${selected.name}`}
              now={now.toISOString()}
            />
          )}
        </section>
      ) : null}
    </>
  );
}
