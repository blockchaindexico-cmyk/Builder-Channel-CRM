-- CreateTable
CREATE TABLE "saved_report_views" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "report" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_report_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_report_views_organization_id_membership_id_report_idx" ON "saved_report_views"("organization_id", "membership_id", "report");

-- CreateIndex
CREATE UNIQUE INDEX "saved_report_views_organization_id_membership_id_report_nam_key" ON "saved_report_views"("organization_id", "membership_id", "report", "name");

-- AddForeignKey
ALTER TABLE "saved_report_views" ADD CONSTRAINT "saved_report_views_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_report_views" ADD CONSTRAINT "saved_report_views_organization_id_membership_id_fkey" FOREIGN KEY ("organization_id", "membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

