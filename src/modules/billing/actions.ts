"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { tenantAction } from "@/platform/actions/client";

import { BILLING_PERMISSIONS } from "./permissions";
import type {
  BusinessExpenseInput,
  CommissionTermInput,
  DealFinancialUpdateInput,
  InvoiceDraftInput,
  PaymentInput,
} from "./schemas";
import * as expenses from "./server/expenses";
import * as financials from "./server/financials";
import * as invoices from "./server/invoices";
import * as settings from "./server/settings";
import * as terms from "./server/terms";

/** Server actions of billing (M09). Inputs are validated by the services. */
const values = z.record(z.string(), z.unknown());

const refreshBilling = () => {
  revalidatePath("/billing", "layout");
  revalidatePath("/reports", "layout");
  revalidatePath("/bookings", "layout");
};

// --- Settings & rate cards ------------------------------------------------------------------------------------------

export const saveBillingSettingsAction = tenantAction
  .metadata({ name: "billing.settings.update", permission: BILLING_PERMISSIONS.billingManage })
  .inputSchema(values)
  .action(async ({ parsedInput, ctx }) => {
    await settings.updateBillingSettings(ctx.service, parsedInput);
    revalidatePath("/settings/billing");
  });

export const saveCommissionTermAction = tenantAction
  .metadata({ name: "billing.term.save", permission: BILLING_PERMISSIONS.commissionManage })
  .inputSchema(z.object({ termId: z.uuid().nullable(), values }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await terms.saveCommissionTerm(
      ctx.service,
      parsedInput.termId,
      parsedInput.values as CommissionTermInput,
    );
    revalidatePath("/settings/commission");
    return result;
  });

export const deleteCommissionTermAction = tenantAction
  .metadata({ name: "billing.term.delete", permission: BILLING_PERMISSIONS.commissionManage })
  .inputSchema(z.object({ termId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await terms.deleteCommissionTerm(ctx.service, parsedInput.termId);
    revalidatePath("/settings/commission");
  });

// --- Deal financials ------------------------------------------------------------------------------------------------

export const updateDealAction = tenantAction
  .metadata({ name: "billing.deal.update", permission: BILLING_PERMISSIONS.financeManage })
  .inputSchema(values)
  .action(async ({ parsedInput, ctx }) => {
    const result = await financials.updateDealFinancial(
      ctx.service,
      parsedInput as DealFinancialUpdateInput,
    );
    refreshBilling();
    return result;
  });

export const confirmDealAction = tenantAction
  .metadata({ name: "billing.deal.confirm", permission: BILLING_PERMISSIONS.financeManage })
  .inputSchema(z.object({ dealId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await financials.confirmDealFinancial(ctx.service, parsedInput.dealId);
    refreshBilling();
  });

export const unlockDealAction = tenantAction
  .metadata({ name: "billing.deal.unlock", permission: BILLING_PERMISSIONS.financeManage })
  .inputSchema(z.object({ dealId: z.uuid(), reason: z.string().max(300) }))
  .action(async ({ parsedInput, ctx }) => {
    await financials.unlockDealFinancial(ctx.service, parsedInput);
    refreshBilling();
  });

export const recalculateDealAction = tenantAction
  .metadata({ name: "billing.deal.recalculate", permission: BILLING_PERMISSIONS.financeManage })
  .inputSchema(z.object({ dealId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const changed = await financials.recalculateDealFinancial(ctx.service, parsedInput.dealId);
    refreshBilling();
    return { changed };
  });

export const ensureDealsAction = tenantAction
  .metadata({ name: "billing.deal.backfill", permission: BILLING_PERMISSIONS.financeManage })
  .action(async ({ ctx }) => {
    const created = await financials.ensureDealFinancials(ctx.service);
    refreshBilling();
    return { created };
  });

// --- Invoices & payments --------------------------------------------------------------------------------------------

export const billableDealsAction = tenantAction
  .metadata({ name: "billing.invoice.billable", permission: BILLING_PERMISSIONS.billingManage })
  .inputSchema(z.object({ builderId: z.uuid(), invoiceId: z.uuid().nullable().optional() }))
  .action(async ({ parsedInput, ctx }) => {
    const [deals, intraState] = await Promise.all([
      invoices.listBillableDeals(ctx.service, parsedInput.builderId, parsedInput.invoiceId ?? null),
      invoices.suggestIntraState(ctx.service, parsedInput.builderId),
    ]);
    return { deals, intraState };
  });

export const saveInvoiceDraftAction = tenantAction
  .metadata({ name: "billing.invoice.save", permission: BILLING_PERMISSIONS.billingManage })
  .inputSchema(z.object({ invoiceId: z.uuid().nullable(), values }))
  .action(async ({ parsedInput, ctx }) => {
    const input = parsedInput.values as InvoiceDraftInput;
    const result = parsedInput.invoiceId
      ? (await invoices.updateInvoiceDraft(ctx.service, parsedInput.invoiceId, input),
        { id: parsedInput.invoiceId })
      : await invoices.createInvoiceDraft(ctx.service, input);
    refreshBilling();
    return result;
  });

export const deleteInvoiceDraftAction = tenantAction
  .metadata({ name: "billing.invoice.discard", permission: BILLING_PERMISSIONS.billingManage })
  .inputSchema(z.object({ invoiceId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await invoices.deleteInvoiceDraft(ctx.service, parsedInput.invoiceId);
    refreshBilling();
  });

export const issueInvoiceAction = tenantAction
  .metadata({ name: "billing.invoice.issue", permission: BILLING_PERMISSIONS.billingManage })
  .inputSchema(values)
  .action(async ({ parsedInput, ctx }) => {
    const result = await invoices.issueInvoice(
      ctx.service,
      parsedInput as { invoiceId: string; issueDate: string; dueDate?: string | null },
    );
    refreshBilling();
    return result;
  });

export const cancelInvoiceAction = tenantAction
  .metadata({ name: "billing.invoice.cancel", permission: BILLING_PERMISSIONS.billingManage })
  .inputSchema(z.object({ invoiceId: z.uuid(), reason: z.string().max(300) }))
  .action(async ({ parsedInput, ctx }) => {
    await invoices.cancelInvoice(ctx.service, parsedInput);
    refreshBilling();
  });

export const recordPaymentAction = tenantAction
  .metadata({ name: "billing.payment.record", permission: BILLING_PERMISSIONS.billingManage })
  .inputSchema(values)
  .action(async ({ parsedInput, ctx }) => {
    const result = await invoices.recordPayment(ctx.service, parsedInput as PaymentInput);
    refreshBilling();
    return result;
  });

export const voidPaymentAction = tenantAction
  .metadata({ name: "billing.payment.void", permission: BILLING_PERMISSIONS.billingManage })
  .inputSchema(z.object({ paymentId: z.uuid(), reason: z.string().max(300) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await invoices.voidPayment(ctx.service, parsedInput);
    refreshBilling();
    return result;
  });

// --- Business expenses ----------------------------------------------------------------------------------------------

export const saveExpenseAction = tenantAction
  .metadata({ name: "billing.expense.save", permission: BILLING_PERMISSIONS.financeManage })
  .inputSchema(z.object({ expenseId: z.uuid().nullable(), values }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await expenses.saveBusinessExpense(
      ctx.service,
      parsedInput.expenseId,
      parsedInput.values as BusinessExpenseInput,
    );
    refreshBilling();
    return result;
  });

export const deleteExpenseAction = tenantAction
  .metadata({ name: "billing.expense.delete", permission: BILLING_PERMISSIONS.financeManage })
  .inputSchema(z.object({ expenseId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await expenses.deleteBusinessExpense(ctx.service, parsedInput.expenseId);
    refreshBilling();
  });
