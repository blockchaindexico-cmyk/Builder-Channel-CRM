-- AlterTable
ALTER TABLE "api_idempotency_keys" ALTER COLUMN "status_code" DROP NOT NULL,
ALTER COLUMN "response" DROP NOT NULL;

-- AlterTable
ALTER TABLE "lead_import_batches" ADD COLUMN     "processed_rows" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "import_batch_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "lead_import_batches_organization_id_id_key" ON "lead_import_batches"("organization_id", "id");

-- CreateIndex
CREATE INDEX "leads_organization_id_import_batch_id_idx" ON "leads"("organization_id", "import_batch_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_import_batch_id_fkey" FOREIGN KEY ("organization_id", "import_batch_id") REFERENCES "lead_import_batches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

