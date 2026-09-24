import type { Metadata } from "next";
import { createLoader, parseAsString } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { isIsoDate } from "@/lib/date-range";
import { toTableQuery } from "@/lib/table-query";
import { CORE_PERMISSIONS } from "@/modules/core";
import { EventLogTable } from "@/modules/core/components/event-log-table";
import { HealthCards } from "@/modules/core/components/health-cards";
import {
  DOMAIN_EVENT_SORTABLE_FIELDS,
  getSystemHealth,
  listDomainEvents,
  listDomainEventTypes,
} from "@/modules/core/server/service";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "System status" };

const loadSearchParams = createLoader({
  ...tableSearchParams,
  type: parseAsString,
  from: parseAsString,
  to: parseAsString,
});

export default async function SystemStatusPage({ searchParams }: PageProps<"/settings/system">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, CORE_PERMISSIONS.systemStatus);

  const params = await loadSearchParams(searchParams);
  const query = toTableQuery(params, {
    sortable: DOMAIN_EVENT_SORTABLE_FIELDS,
    defaultSort: { field: "occurredAt", direction: "desc" },
  });
  const regional = await getRegionalSettings(ctx);
  const range =
    isIsoDate(params.from) && isIsoDate(params.to) ? { from: params.from, to: params.to } : null;

  const [health, events, eventTypes] = await Promise.all([
    getSystemHealth(ctx),
    listDomainEvents(ctx, query, { type: params.type, range, timezone: regional.timezone }),
    listDomainEventTypes(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="System status"
        description="Health of the platform services and the log of domain events recorded for your organization."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "System status" }]}
      />
      <div className="space-y-8">
        <HealthCards report={health} regional={regional} />
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Event log</h2>
            <p className="text-sm text-muted-foreground">
              Every important change publishes an event that background handlers react to.
            </p>
          </div>
          <EventLogTable rows={events.rows} total={events.total} eventTypes={eventTypes} />
        </section>
      </div>
    </>
  );
}
