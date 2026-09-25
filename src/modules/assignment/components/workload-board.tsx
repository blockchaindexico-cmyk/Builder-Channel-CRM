import { AlertTriangle, Inbox } from "lucide-react";
import Link from "next/link";

import { RelativeTime } from "@/components/shared/relative-time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { TeamWorkload, WorkloadRow } from "../server/workload";

function Count({ value, href, tone }: { value: number; href: string; tone?: string }) {
  if (value === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <Link href={href} className={cn("font-medium tabular-nums hover:underline", tone)}>
      {value}
    </Link>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="text-xs text-muted-foreground">{hint}</CardContent> : null}
    </Card>
  );
}

/**
 * Team workload (M05-08): what each member has on their plate. Every number opens the lead list with the same
 * filter, where leads can be selected and reassigned in bulk.
 */
export function WorkloadBoard({
  workload,
  canAssign,
}: {
  workload: TeamWorkload;
  canAssign: boolean;
}) {
  const leads = (row: WorkloadRow, extra: string) => `/leads?owner=${row.membershipId}&${extra}`;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open leads" value={workload.totals.open} />
        <Stat
          label="Not contacted yet"
          value={workload.totals.untouched}
          hint="New or just assigned"
        />
        <Stat
          label={`Unworked for ${workload.unworkedHours} h+`}
          value={workload.totals.unworked}
          hint="Assigned, but nothing happened since"
        />
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unassigned</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{workload.unassigned.open}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {workload.unassigned.oldestCreatedAt ? (
              <>
                Oldest waiting since <RelativeTime value={workload.unassigned.oldestCreatedAt} />
                {" · "}
                <Link
                  href={canAssign ? "/leads/unassigned" : "/leads?view=unassigned"}
                  className="text-primary hover:underline"
                >
                  {canAssign ? "Assign them" : "View"}
                </Link>
              </>
            ) : (
              "Every open lead has an owner"
            )}
          </CardContent>
        </Card>
      </div>

      {workload.rows.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <Inbox className="size-5" /> Nobody in your team works on leads yet.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="text-right">Not contacted</TableHead>
                <TableHead className="text-right">Unworked {workload.unworkedHours} h+</TableHead>
                <TableHead className="text-right">In progress</TableHead>
                <TableHead className="text-right">Booking</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Lost</TableHead>
                <TableHead className="text-right">Invalid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workload.rows.map((row) => (
                <TableRow key={row.membershipId}>
                  <TableCell className="font-medium whitespace-nowrap">
                    <Link href={leads(row, "open=true")} className="hover:underline">
                      {row.name}
                    </Link>
                    {row.status !== "ACTIVE" ? (
                      <Badge variant="destructive" className="ml-2">
                        <AlertTriangle /> Inactive — hand over
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Count value={row.open} href={leads(row, "open=true")} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Count value={row.untouched} href={leads(row, "category=OPEN")} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Count
                      value={row.unworked}
                      href={leads(row, `unworked=${workload.unworkedHours}`)}
                      tone="text-destructive"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Count value={row.byCategory.ACTIVE} href={leads(row, "category=ACTIVE")} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Count value={row.byCategory.BOOKING} href={leads(row, "category=BOOKING")} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Count value={row.byCategory.WON} href={leads(row, "category=WON")} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Count value={row.byCategory.LOST} href={leads(row, "category=LOST")} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Count value={row.byCategory.INVALID} href={leads(row, "category=INVALID")} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Open a number to see those leads; select them there to reassign in bulk.
      </p>
    </div>
  );
}
