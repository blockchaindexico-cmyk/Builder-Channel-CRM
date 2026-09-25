-- CreateEnum
CREATE TYPE "ReportExportStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "daily_member_stats" (
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "leads_assigned" INTEGER NOT NULL DEFAULT 0,
    "leads_created" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "calls_connected" INTEGER NOT NULL DEFAULT 0,
    "calls_positive" INTEGER NOT NULL DEFAULT 0,
    "calls_negative" INTEGER NOT NULL DEFAULT 0,
    "calls_unresponsive" INTEGER NOT NULL DEFAULT 0,
    "calls_callback" INTEGER NOT NULL DEFAULT 0,
    "talk_seconds" INTEGER NOT NULL DEFAULT 0,
    "follow_ups_due" INTEGER NOT NULL DEFAULT 0,
    "follow_ups_completed" INTEGER NOT NULL DEFAULT 0,
    "follow_ups_on_time" INTEGER NOT NULL DEFAULT 0,
    "follow_ups_missed" INTEGER NOT NULL DEFAULT 0,
    "visits_completed" INTEGER NOT NULL DEFAULT 0,
    "revisits_completed" INTEGER NOT NULL DEFAULT 0,
    "visits_no_show" INTEGER NOT NULL DEFAULT 0,
    "bookings" INTEGER NOT NULL DEFAULT 0,
    "closures" INTEGER NOT NULL DEFAULT 0,
    "bookings_cancelled" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "not_interested" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_member_stats_pkey" PRIMARY KEY ("organization_id","membership_id","day")
);

-- CreateTable
CREATE TABLE "daily_lead_snapshots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "owner_id" UUID,
    "status_id" UUID NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "daily_lead_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "report" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "status" "ReportExportStatus" NOT NULL DEFAULT 'QUEUED',
    "row_count" INTEGER,
    "file_id" UUID,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_member_stats_organization_id_day_idx" ON "daily_member_stats"("organization_id", "day");

-- CreateIndex
CREATE INDEX "daily_lead_snapshots_organization_id_day_idx" ON "daily_lead_snapshots"("organization_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "daily_lead_snapshots_organization_id_day_owner_id_status_id_key" ON "daily_lead_snapshots"("organization_id", "day", "owner_id", "status_id") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "report_exports_organization_id_requested_by_id_created_at_idx" ON "report_exports"("organization_id", "requested_by_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "report_exports_organization_id_id_key" ON "report_exports"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "daily_member_stats" ADD CONSTRAINT "daily_member_stats_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_member_stats" ADD CONSTRAINT "daily_member_stats_organization_id_membership_id_fkey" FOREIGN KEY ("organization_id", "membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_lead_snapshots" ADD CONSTRAINT "daily_lead_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_organization_id_requested_by_id_fkey" FOREIGN KEY ("organization_id", "requested_by_id") REFERENCES "memberships"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_organization_id_file_id_fkey" FOREIGN KEY ("organization_id", "file_id") REFERENCES "file_objects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

