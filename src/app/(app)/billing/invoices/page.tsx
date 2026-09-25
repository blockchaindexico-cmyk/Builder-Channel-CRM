import { FilePlus2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createLoader, parseAsString } from "nuqs/server";

import { tableSearchParams } from "@/components/shared/data-table/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { toTableQuery } from "@/lib/table-query";
import { InvoicesTable } from "@/modules/billing/components/invoices-table";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { INVOICE_SORTABLE_FIELDS, listInvoices } from "@/modules/billing/server/invoices";
import { resolvePeriod } from "@/modules/billing/server/period";
import { listBuilderOptions } from "@/modules/catalog";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Invoices" };

const loadParams = createLoader({
  ...tableSearchParams,
  from: parseAsString,
  to: parseAsString,
  status: parseAsString,
  builder: parseAsString,
  overdue: parseAsString,
});

/** Invoice register (M09-07, M09-14). */
export default async function InvoicesPage({ searchParams }: PageProps<"/billing/invoices">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, BILLING_PERMISSIONS.billingView);
  const params = await loadParams(searchParams);
  const regional = await getRegionalSettings(ctx);
  const { today } = resolvePeriod(regional, {});
  const query = toTableQuery(params, {
    sortable: INVOICE_SORTABLE_FIELDS,
    defaultSort: { field: "issueDate", direction: "desc" },
  });
  const [invoices, builders] = await Promise.all([
    listInvoices(ctx, query, {
      from: params.from,
      to: params.to,
      status: params.status,
      builderId: params.builder,
      overdue: params.overdue === "1",
      today,
    }),
    listBuilderOptions(ctx, { includeInactive: true }).catch(() => []),
  ]);
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Brokerage invoices to builders — drafts, issued, paid and cancelled."
        actions={
          ctx.permissions.has(BILLING_PERMISSIONS.billingManage) ? (
            <Button asChild>
              <Link href="/billing/invoices/new">
                <FilePlus2 /> New invoice
              </Link>
            </Button>
          ) : null
        }
      />
      <InvoicesTable
        rows={invoices.rows}
        total={invoices.total}
        builders={builders.map((builder) => ({ id: builder.id, label: builder.name }))}
      />
    </>
  );
}
