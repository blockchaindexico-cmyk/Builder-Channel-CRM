-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "CallOutcomeCategory" AS ENUM ('POSITIVE', 'NEGATIVE', 'UNRESPONSIVE', 'CALLBACK', 'INTERESTED', 'NOT_INTERESTED', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('FOLLOW_UP', 'CALLBACK');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED', 'RESCHEDULED');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "call_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_call_at" TIMESTAMPTZ(3),
ADD COLUMN     "last_call_outcome_id" UUID,
ADD COLUMN     "last_contacted_at" TIMESTAMPTZ(3),
ADD COLUMN     "next_follow_up_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "call_outcomes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT,
    "label" TEXT NOT NULL,
    "category" "CallOutcomeCategory" NOT NULL,
    "connected" BOOLEAN NOT NULL,
    "suggested_status_key" TEXT,
    "requires_next_action" BOOLEAN NOT NULL DEFAULT false,
    "next_action_type" "FollowUpType",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "call_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "caller_id" UUID,
    "caller_name" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "connected" BOOLEAN NOT NULL,
    "outcome_id" UUID NOT NULL,
    "notes" TEXT,
    "recording_file_id" UUID,
    "provider" TEXT NOT NULL DEFAULT 'MANUAL',
    "provider_call_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_purposes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "follow_up_purposes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "type" "FollowUpType" NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'SCHEDULED',
    "assigned_to_id" UUID,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "purpose_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_by_name" TEXT NOT NULL,
    "source_call_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_id" UUID,
    "completed_by_name" TEXT,
    "completion_notes" TEXT,
    "completed_call_id" UUID,
    "missed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "rescheduled_from_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "call_outcomes_organization_id_id_key" ON "call_outcomes"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "call_outcomes_organization_id_label_key" ON "call_outcomes"("organization_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "call_outcomes_organization_id_key_key" ON "call_outcomes"("organization_id", "key");

-- CreateIndex
CREATE INDEX "call_logs_organization_id_lead_id_started_at_idx" ON "call_logs"("organization_id", "lead_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "call_logs_organization_id_caller_id_started_at_idx" ON "call_logs"("organization_id", "caller_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "call_logs_organization_id_started_at_idx" ON "call_logs"("organization_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_organization_id_id_key" ON "call_logs"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_organization_id_provider_provider_call_id_key" ON "call_logs"("organization_id", "provider", "provider_call_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_organization_id_recording_file_id_key" ON "call_logs"("organization_id", "recording_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_purposes_organization_id_id_key" ON "follow_up_purposes"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_purposes_organization_id_label_key" ON "follow_up_purposes"("organization_id", "label");

-- CreateIndex
CREATE INDEX "follow_ups_organization_id_assigned_to_id_status_due_at_idx" ON "follow_ups"("organization_id", "assigned_to_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "follow_ups_organization_id_lead_id_due_at_idx" ON "follow_ups"("organization_id", "lead_id", "due_at");

-- CreateIndex
CREATE INDEX "follow_ups_status_due_at_idx" ON "follow_ups"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "follow_ups_organization_id_id_key" ON "follow_ups"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "follow_ups_organization_id_rescheduled_from_id_key" ON "follow_ups"("organization_id", "rescheduled_from_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_next_follow_up_at_idx" ON "leads"("organization_id", "next_follow_up_at");

-- AddForeignKey
ALTER TABLE "call_outcomes" ADD CONSTRAINT "call_outcomes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_organization_id_caller_id_fkey" FOREIGN KEY ("organization_id", "caller_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_organization_id_outcome_id_fkey" FOREIGN KEY ("organization_id", "outcome_id") REFERENCES "call_outcomes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_organization_id_recording_file_id_fkey" FOREIGN KEY ("organization_id", "recording_file_id") REFERENCES "file_objects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_purposes" ADD CONSTRAINT "follow_up_purposes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organization_id_assigned_to_id_fkey" FOREIGN KEY ("organization_id", "assigned_to_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organization_id_purpose_id_fkey" FOREIGN KEY ("organization_id", "purpose_id") REFERENCES "follow_up_purposes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organization_id_source_call_id_fkey" FOREIGN KEY ("organization_id", "source_call_id") REFERENCES "call_logs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organization_id_completed_call_id_fkey" FOREIGN KEY ("organization_id", "completed_call_id") REFERENCES "call_logs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organization_id_rescheduled_from_id_fkey" FOREIGN KEY ("organization_id", "rescheduled_from_id") REFERENCES "follow_ups"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_last_call_outcome_id_fkey" FOREIGN KEY ("organization_id", "last_call_outcome_id") REFERENCES "call_outcomes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

