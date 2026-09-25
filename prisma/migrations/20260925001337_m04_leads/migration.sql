-- Trigram indexes for lead search (name, mobile, e-mail).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "LeadSourceType" AS ENUM ('WEBSITE', 'PORTAL', 'WALK_IN', 'REFERRAL', 'SOCIAL', 'CAMPAIGN', 'IMPORT', 'API', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatusCategory" AS ENUM ('OPEN', 'ACTIVE', 'BOOKING', 'WON', 'LOST', 'INVALID');

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "LeadPurpose" AS ENUM ('END_USE', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "BuyingTimeline" AS ENUM ('IMMEDIATE', 'WITHIN_3_MONTHS', 'WITHIN_6_MONTHS', 'WITHIN_1_YEAR', 'LATER');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('NONE', 'SUSPECTED', 'CONFIRMED', 'DISMISSED', 'MERGED');

-- CreateEnum
CREATE TYPE "LeadChannel" AS ENUM ('MANUAL', 'IMPORT', 'API');

-- CreateEnum
CREATE TYPE "InterestLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "lead_sources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "LeadSourceType" NOT NULL DEFAULT 'OTHER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "cost" DECIMAL(14,2),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_statuses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "category" "LeadStatusCategory" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "requires_reason" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "mobile_normalized" TEXT,
    "alternate_mobile" TEXT,
    "alternate_mobile_normalized" TEXT,
    "email" TEXT,
    "email_normalized" TEXT,
    "city" TEXT,
    "locality" TEXT,
    "address" TEXT,
    "source_id" UUID,
    "campaign_id" UUID,
    "sub_source" TEXT,
    "channel" "LeadChannel" NOT NULL DEFAULT 'MANUAL',
    "status_id" UUID NOT NULL,
    "owner_id" UUID,
    "created_by_id" UUID,
    "budget_min" DECIMAL(14,2),
    "budget_max" DECIMAL(14,2),
    "property_type_id" UUID,
    "configuration_type_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "preferred_locations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purpose" "LeadPurpose",
    "buying_timeline" "BuyingTimeline",
    "requirement_notes" TEXT,
    "temperature" "LeadTemperature",
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duplicate_status" "DuplicateStatus" NOT NULL DEFAULT 'NONE',
    "duplicate_of_id" UUID,
    "status_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_project_interests" (
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "level" "InterestLevel" NOT NULL DEFAULT 'MEDIUM',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_project_interests_pkey" PRIMARY KEY ("lead_id","project_id")
);

-- CreateTable
CREATE TABLE "lead_notes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "author_id" UUID,
    "author_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "edited_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_files" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "uploaded_by_id" UUID,
    "uploaded_by_name" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID,
    "actor_name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "from_status_id" UUID,
    "to_status_id" UUID NOT NULL,
    "reason" TEXT,
    "changed_by_id" UUID,
    "changed_by_name" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "query" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_import_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "mapping" JSONB NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "error_file_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashed_key" TEXT NOT NULL,
    "default_source_id" UUID,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_idempotency_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "api_key_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_windows" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_limit_windows_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_organization_id_code_key" ON "lead_sources"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_organization_id_name_key" ON "lead_sources"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_organization_id_id_key" ON "lead_sources"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_organization_id_code_key" ON "campaigns"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_organization_id_id_key" ON "campaigns"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_statuses_organization_id_key_key" ON "lead_statuses"("organization_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "lead_statuses_organization_id_id_key" ON "lead_statuses"("organization_id", "id");

-- CreateIndex
CREATE INDEX "leads_organization_id_status_id_idx" ON "leads"("organization_id", "status_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_owner_id_idx" ON "leads"("organization_id", "owner_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_created_at_idx" ON "leads"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "leads_organization_id_last_activity_at_idx" ON "leads"("organization_id", "last_activity_at" DESC);

-- CreateIndex
CREATE INDEX "leads_organization_id_mobile_normalized_idx" ON "leads"("organization_id", "mobile_normalized");

-- CreateIndex
CREATE INDEX "leads_organization_id_alternate_mobile_normalized_idx" ON "leads"("organization_id", "alternate_mobile_normalized");

-- CreateIndex
CREATE INDEX "leads_organization_id_email_normalized_idx" ON "leads"("organization_id", "email_normalized");

-- CreateIndex
CREATE INDEX "leads_organization_id_duplicate_status_idx" ON "leads"("organization_id", "duplicate_status");

-- CreateIndex
CREATE INDEX "leads_name_trgm_idx" ON "leads" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "leads_mobile_trgm_idx" ON "leads" USING GIN ("mobile_normalized" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "leads_email_trgm_idx" ON "leads" USING GIN ("email_normalized" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "leads_organization_id_number_key" ON "leads"("organization_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "leads_organization_id_id_key" ON "leads"("organization_id", "id");

-- CreateIndex
CREATE INDEX "lead_project_interests_organization_id_project_id_idx" ON "lead_project_interests"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "lead_notes_organization_id_lead_id_created_at_idx" ON "lead_notes"("organization_id", "lead_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "lead_files_organization_id_lead_id_idx" ON "lead_files"("organization_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_files_organization_id_file_id_key" ON "lead_files"("organization_id", "file_id");

-- CreateIndex
CREATE INDEX "lead_activities_organization_id_lead_id_occurred_at_idx" ON "lead_activities"("organization_id", "lead_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "lead_activities_organization_id_type_occurred_at_idx" ON "lead_activities"("organization_id", "type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "lead_status_history_organization_id_lead_id_changed_at_idx" ON "lead_status_history"("organization_id", "lead_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "lead_status_history_organization_id_to_status_id_changed_at_idx" ON "lead_status_history"("organization_id", "to_status_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "saved_views_organization_id_owner_id_idx" ON "saved_views"("organization_id", "owner_id");

-- CreateIndex
CREATE INDEX "lead_import_batches_organization_id_created_at_idx" ON "lead_import_batches"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_hashed_key_key" ON "api_keys"("hashed_key");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_created_at_idx" ON "api_keys"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_organization_id_id_key" ON "api_keys"("organization_id", "id");

-- CreateIndex
CREATE INDEX "api_idempotency_keys_created_at_idx" ON "api_idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_idempotency_keys_api_key_id_key_key" ON "api_idempotency_keys"("api_key_id", "key");

-- AddForeignKey
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_source_id_fkey" FOREIGN KEY ("organization_id", "source_id") REFERENCES "lead_sources"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_statuses" ADD CONSTRAINT "lead_statuses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_source_id_fkey" FOREIGN KEY ("organization_id", "source_id") REFERENCES "lead_sources"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_campaign_id_fkey" FOREIGN KEY ("organization_id", "campaign_id") REFERENCES "campaigns"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_status_id_fkey" FOREIGN KEY ("organization_id", "status_id") REFERENCES "lead_statuses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_owner_id_fkey" FOREIGN KEY ("organization_id", "owner_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_created_by_id_fkey" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_property_type_id_fkey" FOREIGN KEY ("organization_id", "property_type_id") REFERENCES "property_types"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_duplicate_of_id_fkey" FOREIGN KEY ("organization_id", "duplicate_of_id") REFERENCES "leads"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_project_interests" ADD CONSTRAINT "lead_project_interests_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_project_interests" ADD CONSTRAINT "lead_project_interests_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_organization_id_author_id_fkey" FOREIGN KEY ("organization_id", "author_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_files" ADD CONSTRAINT "lead_files_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_files" ADD CONSTRAINT "lead_files_organization_id_file_id_fkey" FOREIGN KEY ("organization_id", "file_id") REFERENCES "file_objects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organization_id_owner_id_fkey" FOREIGN KEY ("organization_id", "owner_id") REFERENCES "memberships"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_import_batches" ADD CONSTRAINT "lead_import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_idempotency_keys" ADD CONSTRAINT "api_idempotency_keys_organization_id_api_key_id_fkey" FOREIGN KEY ("organization_id", "api_key_id") REFERENCES "api_keys"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
