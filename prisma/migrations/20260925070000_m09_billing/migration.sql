-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FLAT', 'SLAB');

-- CreateEnum
CREATE TYPE "CommissionSlabBasis" AS ENUM ('VALUE', 'VOLUME');

-- CreateEnum
CREATE TYPE "DealFinancialStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DealFinancialChangeType" AS ENUM ('CREATED', 'RECALCULATED', 'UPDATED', 'CONFIRMED', 'UNLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('BANK_TRANSFER', 'CHEQUE', 'UPI', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "BusinessExpenseCategory" AS ENUM ('MARKETING', 'SALARIES', 'RENT', 'TRAVEL', 'SOFTWARE', 'OTHER');

-- CreateTable
CREATE TABLE "commission_terms" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "builder_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT,
    "type" "CommissionType" NOT NULL,
    "percentage" DECIMAL(6,3),
    "flat_amount" DECIMAL(14,2),
    "slab_basis" "CommissionSlabBasis",
    "slabs" JSONB NOT NULL DEFAULT '[]',
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commission_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_financials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "status" "DealFinancialStatus" NOT NULL DEFAULT 'DRAFT',
    "builder_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "executive_id" UUID NOT NULL,
    "manager_id" UUID,
    "recognized_on" DATE NOT NULL,
    "agreement_value" DECIMAL(14,2) NOT NULL,
    "commission_term_id" UUID,
    "commission_basis" TEXT NOT NULL,
    "commission_rate" DECIMAL(6,3),
    "commission_overridden" BOOLEAN NOT NULL DEFAULT false,
    "gross_commission" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "tds_rate" DECIMAL(5,2) NOT NULL,
    "tds_amount" DECIMAL(14,2) NOT NULL,
    "cashback" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sub_broker_payout" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sub_broker_name" TEXT,
    "executive_incentive" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_expenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_revenue" DECIMAL(14,2) NOT NULL,
    "net_profit" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "deal_financials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_expenses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deal_financial_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_financial_changes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deal_financial_id" UUID NOT NULL,
    "type" "DealFinancialChangeType" NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "actor_id" UUID,
    "actor_name" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_financial_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" TEXT,
    "fiscal_year" TEXT,
    "builder_id" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issue_date" DATE,
    "due_date" DATE,
    "seller" JSONB NOT NULL DEFAULT '{}',
    "bill_to" JSONB NOT NULL DEFAULT '{}',
    "intra_state" BOOLEAN NOT NULL DEFAULT true,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_lines" JSONB NOT NULL DEFAULT '[]',
    "tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_settled" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tds_deducted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "pdf_file_id" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "sent_to" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_by_id" UUID,
    "created_by_name" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(3),
    "issued_by_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "deal_financial_id" UUID,
    "description" TEXT NOT NULL,
    "service_code" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "received_on" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "tds_deducted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recorded_by_id" UUID,
    "recorded_by_name" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_name" TEXT,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_expenses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "spent_on" DATE NOT NULL,
    "category" "BusinessExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "source_id" UUID,
    "campaign_id" UUID,
    "project_id" UUID,
    "paid_to" TEXT,
    "reference" TEXT,
    "created_by_id" UUID,
    "created_by_name" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_terms_organization_id_builder_id_project_id_vali_idx" ON "commission_terms"("organization_id", "builder_id", "project_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "commission_terms_organization_id_id_key" ON "commission_terms"("organization_id", "id");

-- CreateIndex
CREATE INDEX "deal_financials_organization_id_recognized_on_idx" ON "deal_financials"("organization_id", "recognized_on");

-- CreateIndex
CREATE INDEX "deal_financials_organization_id_builder_id_recognized_on_idx" ON "deal_financials"("organization_id", "builder_id", "recognized_on");

-- CreateIndex
CREATE INDEX "deal_financials_organization_id_project_id_recognized_on_idx" ON "deal_financials"("organization_id", "project_id", "recognized_on");

-- CreateIndex
CREATE INDEX "deal_financials_organization_id_executive_id_recognized_on_idx" ON "deal_financials"("organization_id", "executive_id", "recognized_on");

-- CreateIndex
CREATE INDEX "deal_financials_organization_id_manager_id_recognized_on_idx" ON "deal_financials"("organization_id", "manager_id", "recognized_on");

-- CreateIndex
CREATE UNIQUE INDEX "deal_financials_organization_id_booking_id_key" ON "deal_financials"("organization_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_financials_organization_id_id_key" ON "deal_financials"("organization_id", "id");

-- CreateIndex
CREATE INDEX "deal_expenses_organization_id_deal_financial_id_idx" ON "deal_expenses"("organization_id", "deal_financial_id");

-- CreateIndex
CREATE INDEX "deal_financial_changes_organization_id_deal_financial_id_oc_idx" ON "deal_financial_changes"("organization_id", "deal_financial_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "invoices_organization_id_builder_id_issue_date_idx" ON "invoices"("organization_id", "builder_id", "issue_date");

-- CreateIndex
CREATE INDEX "invoices_organization_id_status_due_date_idx" ON "invoices"("organization_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organization_id_number_key" ON "invoices"("organization_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organization_id_id_key" ON "invoices"("organization_id", "id");

-- CreateIndex
CREATE INDEX "invoice_lines_organization_id_invoice_id_idx" ON "invoice_lines"("organization_id", "invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_organization_id_deal_financial_id_idx" ON "invoice_lines"("organization_id", "deal_financial_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_invoice_id_idx" ON "payments"("organization_id", "invoice_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_received_on_idx" ON "payments"("organization_id", "received_on");

-- CreateIndex
CREATE INDEX "business_expenses_organization_id_spent_on_idx" ON "business_expenses"("organization_id", "spent_on");

-- CreateIndex
CREATE INDEX "business_expenses_organization_id_category_spent_on_idx" ON "business_expenses"("organization_id", "category", "spent_on");

-- AddForeignKey
ALTER TABLE "commission_terms" ADD CONSTRAINT "commission_terms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_terms" ADD CONSTRAINT "commission_terms_organization_id_builder_id_fkey" FOREIGN KEY ("organization_id", "builder_id") REFERENCES "builders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_terms" ADD CONSTRAINT "commission_terms_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_financials" ADD CONSTRAINT "deal_financials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_financials" ADD CONSTRAINT "deal_financials_organization_id_booking_id_fkey" FOREIGN KEY ("organization_id", "booking_id") REFERENCES "bookings"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_financials" ADD CONSTRAINT "deal_financials_organization_id_builder_id_fkey" FOREIGN KEY ("organization_id", "builder_id") REFERENCES "builders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_financials" ADD CONSTRAINT "deal_financials_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_financials" ADD CONSTRAINT "deal_financials_organization_id_executive_id_fkey" FOREIGN KEY ("organization_id", "executive_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_financials" ADD CONSTRAINT "deal_financials_organization_id_manager_id_fkey" FOREIGN KEY ("organization_id", "manager_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_financials" ADD CONSTRAINT "deal_financials_organization_id_commission_term_id_fkey" FOREIGN KEY ("organization_id", "commission_term_id") REFERENCES "commission_terms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_expenses" ADD CONSTRAINT "deal_expenses_organization_id_deal_financial_id_fkey" FOREIGN KEY ("organization_id", "deal_financial_id") REFERENCES "deal_financials"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_financial_changes" ADD CONSTRAINT "deal_financial_changes_organization_id_deal_financial_id_fkey" FOREIGN KEY ("organization_id", "deal_financial_id") REFERENCES "deal_financials"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_builder_id_fkey" FOREIGN KEY ("organization_id", "builder_id") REFERENCES "builders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_pdf_file_id_fkey" FOREIGN KEY ("organization_id", "pdf_file_id") REFERENCES "file_objects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_invoice_id_fkey" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "invoices"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_deal_financial_id_fkey" FOREIGN KEY ("organization_id", "deal_financial_id") REFERENCES "deal_financials"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_invoice_id_fkey" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "invoices"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_organization_id_source_id_fkey" FOREIGN KEY ("organization_id", "source_id") REFERENCES "lead_sources"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_organization_id_campaign_id_fkey" FOREIGN KEY ("organization_id", "campaign_id") REFERENCES "campaigns"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

