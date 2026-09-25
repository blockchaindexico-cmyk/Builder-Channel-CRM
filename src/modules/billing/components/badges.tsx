import { Badge } from "@/components/ui/badge";
import type { DealFinancialStatus, InvoiceStatus } from "@/generated/prisma/enums";

import { DEAL_FINANCIAL_STATUSES, INVOICE_STATUSES } from "../constants";

const DEAL_VARIANTS = { DRAFT: "warning", CONFIRMED: "success", CANCELLED: "muted" } as const;
const INVOICE_VARIANTS = {
  DRAFT: "muted",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "destructive",
} as const;

export function DealStatusBadge({ status }: { status: DealFinancialStatus }) {
  return (
    <Badge variant={DEAL_VARIANTS[status]}>
      {DEAL_FINANCIAL_STATUSES.find((entry) => entry.value === status)?.label ?? status}
    </Badge>
  );
}

export function InvoiceStatusBadge({
  status,
  overdue,
}: {
  status: InvoiceStatus;
  overdue?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge variant={INVOICE_VARIANTS[status]}>
        {INVOICE_STATUSES.find((entry) => entry.value === status)?.label ?? status}
      </Badge>
      {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
    </span>
  );
}
