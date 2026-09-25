/** Permissions of billing, commission & profit/loss (M09-03). Nobody but admins holds them by default (Q-16). */
export const BILLING_PERMISSIONS = {
  /** Deal financials (commission, costs, profit), the P&L and lost-opportunity reports. */
  financeView: "finance.view",
  /** Edit, confirm and unlock deal financials; business expenses. */
  financeManage: "finance.manage",
  /** Invoices, payments, receivables and billing reports. */
  billingView: "billing.view",
  /** Create, issue, send and cancel invoices; record payments; billing settings. */
  billingManage: "billing.manage",
  /** Commission rate cards of builders and projects. */
  commissionManage: "commission.manage",
} as const;
