-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('ASSIGN', 'REASSIGN', 'UNASSIGN');

-- CreateEnum
CREATE TYPE "AssignmentMethod" AS ENUM ('MANUAL', 'BULK', 'CREATOR', 'IMPORT', 'RULE', 'DEACTIVATION', 'BACKFILL');

-- CreateEnum
CREATE TYPE "AssignmentStrategy" AS ENUM ('ROUND_ROBIN', 'LEAST_LOADED');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "owner_assigned_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "lead_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "kind" "AssignmentKind" NOT NULL,
    "method" "AssignmentMethod" NOT NULL,
    "assignee_id" UUID,
    "previous_owner_id" UUID,
    "assigned_by_id" UUID,
    "assigned_by_name" TEXT NOT NULL,
    "reason" TEXT,
    "reason_id" UUID,
    "rule_id" UUID,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "lead_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reassignment_reasons" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reassignment_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "channels" "LeadChannel"[] DEFAULT ARRAY[]::"LeadChannel"[],
    "source_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "campaign_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "project_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "strategy" "AssignmentStrategy" NOT NULL DEFAULT 'ROUND_ROBIN',
    "member_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "last_assigned_member_id" UUID,
    "assigned_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_assignments_organization_id_lead_id_assigned_at_idx" ON "lead_assignments"("organization_id", "lead_id", "assigned_at" DESC);

-- CreateIndex
CREATE INDEX "lead_assignments_organization_id_assignee_id_ended_at_idx" ON "lead_assignments"("organization_id", "assignee_id", "ended_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_assignments_organization_id_id_key" ON "lead_assignments"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reassignment_reasons_organization_id_id_key" ON "reassignment_reasons"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reassignment_reasons_organization_id_label_key" ON "reassignment_reasons"("organization_id", "label");

-- CreateIndex
CREATE INDEX "assignment_rules_organization_id_is_active_priority_idx" ON "assignment_rules"("organization_id", "is_active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_rules_organization_id_id_key" ON "assignment_rules"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_organization_id_assignee_id_fkey" FOREIGN KEY ("organization_id", "assignee_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_organization_id_previous_owner_id_fkey" FOREIGN KEY ("organization_id", "previous_owner_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_organization_id_reason_id_fkey" FOREIGN KEY ("organization_id", "reason_id") REFERENCES "reassignment_reasons"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_organization_id_rule_id_fkey" FOREIGN KEY ("organization_id", "rule_id") REFERENCES "assignment_rules"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reassignment_reasons" ADD CONSTRAINT "reassignment_reasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill (M05-01): leads owned before M05 get their first assignment record.
UPDATE "leads" SET "owner_assigned_at" = "created_at" WHERE "owner_id" IS NOT NULL AND "owner_assigned_at" IS NULL;

INSERT INTO "lead_assignments" ("id", "organization_id", "lead_id", "kind", "method", "assignee_id", "assigned_by_name", "assigned_at")
SELECT gen_random_uuid(), "organization_id", "id", 'ASSIGN', 'BACKFILL', "owner_id", 'System', "created_at"
FROM "leads"
WHERE "owner_id" IS NOT NULL;
