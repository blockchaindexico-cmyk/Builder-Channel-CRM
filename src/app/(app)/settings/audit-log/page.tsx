import type { Metadata } from "next";
import { createLoader, parseAsString } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { isIsoDate } from "@/lib/date-range";
import { toTableQuery } from "@/lib/table-query";
import { IDENTITY_PERMISSIONS } from "@/modules/identity";
import { AuditLogTable } from "@/modules/identity/components/audit/audit-log-table";
import {
  AUDIT_SORTABLE_FIELDS,
  getAuditLogFilterOptions,
  listAuditLogs,
} from "@/modules/identity/server/audit-log";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Audit log" };

const loadSearchParams = createLoader({
  ...tableSearchParams,
  actor: parseAsString,
  entity: parseAsString,
  action: parseAsString,
  from: parseAsString,
  to: parseAsString,
});

/** Audit log viewer (M02-18). */
export default async function AuditLogPage({ searchParams }: PageProps<"/settings/audit-log">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, IDENTITY_PERMISSIONS.auditView);

  const params = await loadSearchParams(searchParams);
  const query = toTableQuery(params, {
    sortable: AUDIT_SORTABLE_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const regional = await getRegionalSettings(ctx);
  const range =
    isIsoDate(params.from) && isIsoDate(params.to) ? { from: params.from, to: params.to } : null;
  const [entries, options] = await Promise.all([
    listAuditLogs(ctx, query, {
      actorId: params.actor,
      entityType: params.entity,
      action: params.action,
      range,
      timezone: regional.timezone,
    }),
    getAuditLogFilterOptions(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every important change and sign-in, who made it and when. Entries cannot be edited or deleted."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Audit log" }]}
      />
      <AuditLogTable
        rows={entries.rows}
        total={entries.total}
        actors={options.actors}
        entityTypes={options.entityTypes}
        actions={options.actions}
      />
    </>
  );
}
