-- CreateEnum
CREATE TYPE "SiteVisitStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "VisitOutcomeCategory" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'BOOKING');

-- CreateEnum
CREATE TYPE "VisitNextStep" AS ENUM ('REVISIT', 'FOLLOW_UP', 'BOOKING', 'CLOSE');

-- CreateEnum
CREATE TYPE "LossReasonScope" AS ENUM ('LOST', 'NOT_INTERESTED', 'BOOKING_CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('ACTIVE', 'CLOSED_WON', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingHistoryType" AS ENUM ('CREATED', 'UPDATED', 'STAGE_CHANGED', 'CLOSED', 'CANCELLED', 'FILE_ADDED', 'FILE_REMOVED');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "booked_at" TIMESTAMPTZ(3),
ADD COLUMN     "first_visit_at" TIMESTAMPTZ(3),
ADD COLUMN     "loss_reason_id" UUID,
ADD COLUMN     "lost_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "visit_outcomes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT,
    "label" TEXT NOT NULL,
    "category" "VisitOutcomeCategory" NOT NULL,
    "next_step" "VisitNextStep",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "visit_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_visits" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "builder_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "is_revisit" BOOLEAN NOT NULL DEFAULT false,
    "parent_visit_id" UUID,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "SiteVisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "assigned_to_id" UUID,
    "pickup_required" BOOLEAN NOT NULL DEFAULT false,
    "pickup_address" TEXT,
    "attendees" INTEGER,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_by_name" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "conducted_by_id" UUID,
    "conducted_by_name" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "outcome_id" UUID,
    "feedback" TEXT,
    "no_show_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "rescheduled_from_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_reasons" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT,
    "label" TEXT NOT NULL,
    "applies_to" "LossReasonScope"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "loss_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_stages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "lead_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "builder_id" UUID NOT NULL,
    "visit_id" UUID,
    "executive_id" UUID NOT NULL,
    "manager_id" UUID,
    "customer_name" TEXT NOT NULL,
    "co_applicant_name" TEXT,
    "unit_number" TEXT,
    "tower" TEXT,
    "floor" TEXT,
    "configuration_type_id" UUID,
    "area" DECIMAL(10,2),
    "booking_date" DATE NOT NULL,
    "agreement_value" DECIMAL(14,2),
    "token_amount" DECIMAL(14,2),
    "payment_plan" TEXT,
    "builder_reference" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'ACTIVE',
    "stage_id" UUID,
    "remarks" TEXT,
    "created_by_id" UUID,
    "created_by_name" TEXT NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "closed_by_name" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_name" TEXT,
    "cancel_reason_id" UUID,
    "cancel_notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "type" "BookingHistoryType" NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus",
    "from_stage" TEXT,
    "to_stage" TEXT,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "actor_id" UUID,
    "actor_name" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_files" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "uploaded_by_id" UUID,
    "uploaded_by_name" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visit_outcomes_organization_id_id_key" ON "visit_outcomes"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_outcomes_organization_id_label_key" ON "visit_outcomes"("organization_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "visit_outcomes_organization_id_key_key" ON "visit_outcomes"("organization_id", "key");

-- CreateIndex
CREATE INDEX "site_visits_organization_id_lead_id_scheduled_at_idx" ON "site_visits"("organization_id", "lead_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "site_visits_organization_id_assigned_to_id_status_scheduled_idx" ON "site_visits"("organization_id", "assigned_to_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "site_visits_organization_id_project_id_scheduled_at_idx" ON "site_visits"("organization_id", "project_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "site_visits_organization_id_scheduled_at_idx" ON "site_visits"("organization_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_visits_organization_id_id_key" ON "site_visits"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "site_visits_organization_id_rescheduled_from_id_key" ON "site_visits"("organization_id", "rescheduled_from_id");

-- CreateIndex
CREATE UNIQUE INDEX "loss_reasons_organization_id_id_key" ON "loss_reasons"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "loss_reasons_organization_id_label_key" ON "loss_reasons"("organization_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "loss_reasons_organization_id_key_key" ON "loss_reasons"("organization_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "booking_stages_organization_id_id_key" ON "booking_stages"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_stages_organization_id_label_key" ON "booking_stages"("organization_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "booking_stages_organization_id_key_key" ON "booking_stages"("organization_id", "key");

-- CreateIndex
CREATE INDEX "bookings_organization_id_lead_id_idx" ON "bookings"("organization_id", "lead_id");

-- CreateIndex
CREATE INDEX "bookings_organization_id_status_booking_date_idx" ON "bookings"("organization_id", "status", "booking_date" DESC);

-- CreateIndex
CREATE INDEX "bookings_organization_id_executive_id_booking_date_idx" ON "bookings"("organization_id", "executive_id", "booking_date" DESC);

-- CreateIndex
CREATE INDEX "bookings_organization_id_manager_id_booking_date_idx" ON "bookings"("organization_id", "manager_id", "booking_date" DESC);

-- CreateIndex
CREATE INDEX "bookings_organization_id_project_id_booking_date_idx" ON "bookings"("organization_id", "project_id", "booking_date" DESC);

-- CreateIndex
CREATE INDEX "bookings_organization_id_builder_id_booking_date_idx" ON "bookings"("organization_id", "builder_id", "booking_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_organization_id_number_key" ON "bookings"("organization_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_organization_id_id_key" ON "bookings"("organization_id", "id");

-- CreateIndex
CREATE INDEX "booking_history_organization_id_booking_id_occurred_at_idx" ON "booking_history"("organization_id", "booking_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "booking_files_organization_id_booking_id_idx" ON "booking_files"("organization_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_files_organization_id_file_id_key" ON "booking_files"("organization_id", "file_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_loss_reason_id_idx" ON "leads"("organization_id", "loss_reason_id");

-- AddForeignKey
ALTER TABLE "visit_outcomes" ADD CONSTRAINT "visit_outcomes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_organization_id_builder_id_fkey" FOREIGN KEY ("organization_id", "builder_id") REFERENCES "builders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_organization_id_parent_visit_id_fkey" FOREIGN KEY ("organization_id", "parent_visit_id") REFERENCES "site_visits"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_organization_id_assigned_to_id_fkey" FOREIGN KEY ("organization_id", "assigned_to_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_organization_id_conducted_by_id_fkey" FOREIGN KEY ("organization_id", "conducted_by_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_organization_id_outcome_id_fkey" FOREIGN KEY ("organization_id", "outcome_id") REFERENCES "visit_outcomes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_organization_id_rescheduled_from_id_fkey" FOREIGN KEY ("organization_id", "rescheduled_from_id") REFERENCES "site_visits"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_reasons" ADD CONSTRAINT "loss_reasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_stages" ADD CONSTRAINT "booking_stages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_builder_id_fkey" FOREIGN KEY ("organization_id", "builder_id") REFERENCES "builders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_visit_id_fkey" FOREIGN KEY ("organization_id", "visit_id") REFERENCES "site_visits"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_executive_id_fkey" FOREIGN KEY ("organization_id", "executive_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_manager_id_fkey" FOREIGN KEY ("organization_id", "manager_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_configuration_type_id_fkey" FOREIGN KEY ("organization_id", "configuration_type_id") REFERENCES "configuration_types"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_stage_id_fkey" FOREIGN KEY ("organization_id", "stage_id") REFERENCES "booking_stages"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_cancel_reason_id_fkey" FOREIGN KEY ("organization_id", "cancel_reason_id") REFERENCES "loss_reasons"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_history" ADD CONSTRAINT "booking_history_organization_id_booking_id_fkey" FOREIGN KEY ("organization_id", "booking_id") REFERENCES "bookings"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_files" ADD CONSTRAINT "booking_files_organization_id_booking_id_fkey" FOREIGN KEY ("organization_id", "booking_id") REFERENCES "bookings"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_files" ADD CONSTRAINT "booking_files_organization_id_file_id_fkey" FOREIGN KEY ("organization_id", "file_id") REFERENCES "file_objects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_loss_reason_id_fkey" FOREIGN KEY ("organization_id", "loss_reason_id") REFERENCES "loss_reasons"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Milestones of existing leads: `closed_at` now means "closed as won"; losses get `lost_at`.
UPDATE "leads" AS l SET "lost_at" = l."status_changed_at"
FROM "lead_statuses" AS s
WHERE s."id" = l."status_id" AND s."category" = 'LOST';

UPDATE "leads" AS l SET "closed_at" = NULL
FROM "lead_statuses" AS s
WHERE s."id" = l."status_id" AND s."category" <> 'WON' AND l."closed_at" IS NOT NULL;
