import type { Metadata } from "next";
import { createLoader, parseAsString } from "nuqs/server";

import { PageHeader } from "@/components/shared/page-header";
import { InvoiceForm } from "@/modules/billing/components/invoice-form";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { getBillingSettings } from "@/modules/billing/server/settings";
import { listBuilderOptions } from "@/modules/catalog";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "New invoice" };

const loadParams = createLoader({ builder: parseAsString });

export default async function NewInvoicePage({ searchParams }: PageProps<"/billing/invoices/new">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, BILLING_PERMISSIONS.billingManage);
  const params = await loadParams(searchParams);
  const [settings, builders] = await Promise.all([
    getBillingSettings(ctx.db, ctx),
    listBuilderOptions(ctx, { includeInactive: true }),
  ]);
  return (
    <>
      <PageHeader
        title="New invoice"
        breadcrumbs={[{ label: "Invoices", href: "/billing/invoices" }, { label: "New" }]}
      />
      <InvoiceForm
        builders={builders.map((builder) => ({ id: builder.id, label: builder.name }))}
        tax={{
          rate: settings.taxRate,
          split: settings.splitTax,
          splitLabels: settings.splitTaxLabels,
          singleLabel: settings.singleTaxLabel,
        }}
        initial={{
          invoiceId: null,
          builderId: builders.some((builder) => builder.id === params.builder)
            ? params.builder!
            : "",
          dealIds: [],
          manualLines: [],
          intraState: true,
          notes: "",
        }}
      />
    </>
  );
}
