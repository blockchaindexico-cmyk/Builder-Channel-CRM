import { forbidden } from "next/navigation";

import { BillingNav } from "@/modules/billing/components/billing-nav";
import { BILLING_PERMISSIONS } from "@/modules/billing/permissions";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Billing, collections, deal financials and business expenses (M09). */
export default async function BillingLayout({ children }: LayoutProps<"/billing">) {
  const ctx = await getRequestContext();
  const billing = ctx.permissions.has(BILLING_PERMISSIONS.billingView);
  const finance = ctx.permissions.has(BILLING_PERMISSIONS.financeView);
  if (!billing && !finance) forbidden();
  return (
    <>
      <BillingNav billing={billing} finance={finance} />
      {children}
    </>
  );
}
