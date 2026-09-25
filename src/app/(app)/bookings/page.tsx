import type { Metadata } from "next";
import { createLoader, parseAsString } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { isIsoDate } from "@/lib/date-range";
import { formatMoney } from "@/lib/format";
import { toTableQuery } from "@/lib/table-query";
import { listBuilderOptions, listProjectOptions } from "@/modules/catalog";
import { BookingsTable } from "@/modules/deals/components/bookings-table";
import { DEAL_PERMISSIONS } from "@/modules/deals/permissions";
import {
  BOOKING_SORTABLE_FIELDS,
  canSeeBookingValues,
  listBookings,
  summarizeBookings,
} from "@/modules/deals/server/bookings";
import { listBookingStages } from "@/modules/deals/server/masters";
import { listMemberOptions } from "@/modules/identity";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { resolveDataScope } from "@/platform/rbac/scope";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Bookings" };

const loadParams = createLoader({
  ...tableSearchParams,
  from: parseAsString,
  to: parseAsString,
  builder: parseAsString,
  project: parseAsString,
  manager: parseAsString,
  executive: parseAsString,
  status: parseAsString,
  stage: parseAsString,
});

/** Bookings (M08-08): in progress, closed and cancelled, by builder, project, manager, executive and date. */
export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, DEAL_PERMISSIONS.bookingsView);
  const params = await loadParams(searchParams);
  const [regional, scope] = await Promise.all([
    getRegionalSettings(ctx),
    resolveDataScope(ctx, DEAL_PERMISSIONS.bookingsView),
  ]);
  const filters = {
    range:
      isIsoDate(params.from) && isIsoDate(params.to) ? { from: params.from, to: params.to } : null,
    builderId: params.builder,
    projectId: params.project,
    managerId: params.manager,
    executiveId: params.executive,
    status: params.status,
    stageId: params.stage,
  };
  const showValues = canSeeBookingValues(ctx);
  const query = toTableQuery(params, {
    sortable: showValues ? BOOKING_SORTABLE_FIELDS : ["bookingDate", "number"],
    defaultSort: { field: "bookingDate", direction: "desc" },
  });
  const [bookings, summary, stages, builders, projects, members, managers] = await Promise.all([
    listBookings(ctx, query, filters),
    summarizeBookings(ctx, filters),
    listBookingStages(ctx, { activeOnly: true }),
    listBuilderOptions(ctx, { includeInactive: true }).catch(() => []),
    listProjectOptions(ctx),
    scope.scope === "OWN"
      ? Promise.resolve([])
      : listMemberOptions(ctx, scope.scope === "ALL" ? {} : { ids: scope.membershipIds }),
    scope.scope === "OWN"
      ? Promise.resolve([])
      : listMemberOptions(ctx, {
          managersOnly: true,
          ...(scope.scope === "ALL" ? {} : { ids: scope.membershipIds }),
        }),
  ]);
  return (
    <>
      <PageHeader
        title="Bookings"
        description={
          scope.scope === "OWN"
            ? "Your bookings, from booking to closure."
            : "Bookings of your team, from booking to closure."
        }
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Summary">
        <Badge variant="info">{summary.byStatus.ACTIVE} in progress</Badge>
        <Badge variant="success">{summary.byStatus.CLOSED_WON} closed / won</Badge>
        {summary.byStatus.CANCELLED ? (
          <Badge variant="destructive">{summary.byStatus.CANCELLED} cancelled</Badge>
        ) : null}
        {summary.values ? (
          <Badge variant="outline">
            Agreement value (open and closed):{" "}
            {formatMoney(summary.values.agreementValue, regional, { compact: true })}
          </Badge>
        ) : null}
      </div>
      <BookingsTable
        rows={bookings.rows}
        total={bookings.total}
        builders={builders.map((builder) => ({ id: builder.id, label: builder.name }))}
        projects={projects.map((project) => ({
          id: project.id,
          label: `${project.name} · ${project.builderName}`,
        }))}
        managers={managers.map((member) => ({ id: member.membershipId, label: member.name }))}
        executives={members.map((member) => ({ id: member.membershipId, label: member.name }))}
        stages={stages.map((stage) => ({ id: stage.id, label: stage.label }))}
        canSeeValues={showValues}
      />
    </>
  );
}
