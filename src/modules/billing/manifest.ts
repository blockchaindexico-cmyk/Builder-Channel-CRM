import {
  BadgeIndianRupee,
  ChartNoAxesCombined,
  FileText,
  Percent,
  TrendingDown,
} from "lucide-react";

import type {} from "@/modules/analytics";
import type { ModuleManifest } from "@/platform/registry/types";

import { BILLING_PERMISSIONS } from "./permissions";

/** M09 — billing, commission & profit/loss (PRD §13, §14, §15, §23, §24). */
export const billingManifest: ModuleManifest = {
  key: "billing",
  planId: "M09",
  name: "Billing & profit",
  nav: [
    {
      key: "billing.home",
      label: "Billing",
      href: "/billing",
      icon: BadgeIndianRupee,
      section: "main",
      order: 15,
      permission: BILLING_PERMISSIONS.billingView,
    },
    {
      key: "billing.deals",
      label: "Deal financials",
      href: "/billing/deals",
      icon: FileText,
      section: "main",
      order: 16,
      permission: BILLING_PERMISSIONS.financeView,
    },
    {
      key: "billing.profit-loss",
      label: "Profit & loss",
      href: "/reports/profit-loss",
      icon: ChartNoAxesCombined,
      section: "insights",
      order: 20,
      permission: BILLING_PERMISSIONS.financeView,
    },
    {
      key: "billing.lost",
      label: "Lost opportunities",
      href: "/reports/lost-opportunities",
      icon: TrendingDown,
      section: "insights",
      order: 30,
      permission: BILLING_PERMISSIONS.financeView,
    },
  ],
  settings: [
    {
      key: "billing.settings",
      label: "Billing & invoices",
      description:
        "Legal name, GSTIN, invoice numbering, tax and TDS rates, payment terms and bank details.",
      href: "/settings/billing",
      icon: BadgeIndianRupee,
      group: "Finance",
      order: 10,
      permission: BILLING_PERMISSIONS.billingManage,
    },
    {
      key: "billing.commission",
      label: "Commission rate cards",
      description:
        "Percentage, flat or slab commission per builder and project, with validity dates.",
      href: "/settings/commission",
      icon: Percent,
      group: "Finance",
      order: 20,
      permission: BILLING_PERMISSIONS.commissionManage,
    },
  ],
  permissions: [
    {
      key: BILLING_PERMISSIONS.financeView,
      label: "View deal financials and profit",
      description:
        "Commission, costs and profit of each deal, the profit & loss and lost-opportunity reports, business expenses.",
      group: "Billing & profit",
    },
    {
      key: BILLING_PERMISSIONS.financeManage,
      label: "Manage deal financials",
      description:
        "Record cashback, payouts, incentives and expenses; override commission; confirm and unlock deals.",
      group: "Billing & profit",
    },
    {
      key: BILLING_PERMISSIONS.billingView,
      label: "View invoices and collections",
      description: "Invoices, payments received, receivables and their ageing.",
      group: "Billing & profit",
    },
    {
      key: BILLING_PERMISSIONS.billingManage,
      label: "Manage invoices and payments",
      description:
        "Create, issue, send and cancel invoices; record and void payments; change billing settings.",
      group: "Billing & profit",
    },
    {
      key: BILLING_PERMISSIONS.commissionManage,
      label: "Manage commission rate cards",
      group: "Billing & profit",
    },
  ],
  contributions: {
    "report.catalog": [
      {
        key: "profit-loss",
        title: "Profit & loss",
        description:
          "Commission, cashback, payouts and profit by builder, project, executive, manager or month.",
        group: "Finance",
        href: "/reports/profit-loss",
        order: 10,
        permission: BILLING_PERMISSIONS.financeView,
      },
      {
        key: "lost-opportunities",
        title: "Lost opportunities",
        description: "Estimated value of lost leads and cancelled bookings, by reason.",
        group: "Finance",
        href: "/reports/lost-opportunities",
        order: 20,
        permission: BILLING_PERMISSIONS.financeView,
      },
      {
        key: "collections",
        title: "Billing & collections",
        description: "Invoices billed, collected and outstanding, with receivables ageing.",
        group: "Finance",
        href: "/billing",
        order: 30,
        permission: BILLING_PERMISSIONS.billingView,
      },
    ],
    "notification.type": [
      {
        key: "billing.invoices_overdue",
        label: "Overdue invoices",
        description: "Once a day while invoices are past their due date.",
        category: "Team",
        defaultChannels: ["IN_APP", "EMAIL"],
        emailAction: "Open the invoices",
      },
    ],
  },
};
