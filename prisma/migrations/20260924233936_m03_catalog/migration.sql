-- CreateEnum
CREATE TYPE "PropertyCategory" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'LAND');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('UPCOMING', 'PRE_LAUNCH', 'UNDER_CONSTRUCTION', 'READY_TO_MOVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('BROCHURE', 'FLOOR_PLAN', 'PRICE_SHEET', 'IMAGE', 'LEGAL', 'AGREEMENT', 'OTHER');

-- CreateTable
CREATE TABLE "property_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PropertyCategory" NOT NULL DEFAULT 'RESIDENTIAL',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "property_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuration_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bedrooms" DECIMAL(3,1),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuration_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "builders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "tax_id" TEXT,
    "address_line" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deactivated_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "builders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "builder_contacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "builder_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "builder_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "builder_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'UPCOMING',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deactivated_at" TIMESTAMPTZ(3),
    "rera_number" TEXT,
    "address_line" TEXT,
    "locality" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "map_url" TEXT,
    "launch_date" DATE,
    "possession_date" DATE,
    "possession_note" TEXT,
    "price_min" DECIMAL(14,2),
    "price_max" DECIMAL(14,2),
    "total_towers" INTEGER,
    "total_units" INTEGER,
    "project_area" TEXT,
    "description" TEXT,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_property_types" (
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "property_type_id" UUID NOT NULL,

    CONSTRAINT "project_property_types_pkey" PRIMARY KEY ("project_id","property_type_id")
);

-- CreateTable
CREATE TABLE "project_configurations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "configuration_type_id" UUID NOT NULL,
    "carpet_area_min" DECIMAL(10,2),
    "carpet_area_max" DECIMAL(10,2),
    "price_min" DECIMAL(14,2),
    "price_max" DECIMAL(14,2),
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_amenities" (
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "amenity_id" UUID NOT NULL,

    CONSTRAINT "project_amenities_pkey" PRIMARY KEY ("project_id","amenity_id")
);

-- CreateTable
CREATE TABLE "project_files" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "builder_files" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "builder_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "builder_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_types_organization_id_name_key" ON "property_types"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "property_types_organization_id_id_key" ON "property_types"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "configuration_types_organization_id_name_key" ON "configuration_types"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "configuration_types_organization_id_id_key" ON "configuration_types"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_organization_id_name_key" ON "amenities"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_organization_id_id_key" ON "amenities"("organization_id", "id");

-- CreateIndex
CREATE INDEX "builders_organization_id_is_active_name_idx" ON "builders"("organization_id", "is_active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "builders_organization_id_code_key" ON "builders"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "builders_organization_id_id_key" ON "builders"("organization_id", "id");

-- CreateIndex
CREATE INDEX "builder_contacts_organization_id_builder_id_idx" ON "builder_contacts"("organization_id", "builder_id");

-- CreateIndex
CREATE INDEX "projects_organization_id_builder_id_idx" ON "projects"("organization_id", "builder_id");

-- CreateIndex
CREATE INDEX "projects_organization_id_is_active_status_idx" ON "projects"("organization_id", "is_active", "status");

-- CreateIndex
CREATE INDEX "projects_organization_id_city_idx" ON "projects"("organization_id", "city");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_code_key" ON "projects"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_id_key" ON "projects"("organization_id", "id");

-- CreateIndex
CREATE INDEX "project_property_types_organization_id_property_type_id_idx" ON "project_property_types"("organization_id", "property_type_id");

-- CreateIndex
CREATE INDEX "project_configurations_organization_id_project_id_idx" ON "project_configurations"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "project_configurations_organization_id_configuration_type_i_idx" ON "project_configurations"("organization_id", "configuration_type_id");

-- CreateIndex
CREATE INDEX "project_amenities_organization_id_amenity_id_idx" ON "project_amenities"("organization_id", "amenity_id");

-- CreateIndex
CREATE INDEX "project_files_organization_id_project_id_category_idx" ON "project_files"("organization_id", "project_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "project_files_organization_id_file_id_key" ON "project_files"("organization_id", "file_id");

-- CreateIndex
CREATE INDEX "builder_files_organization_id_builder_id_idx" ON "builder_files"("organization_id", "builder_id");

-- CreateIndex
CREATE UNIQUE INDEX "builder_files_organization_id_file_id_key" ON "builder_files"("organization_id", "file_id");

-- AddForeignKey
ALTER TABLE "property_types" ADD CONSTRAINT "property_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuration_types" ADD CONSTRAINT "configuration_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "builders" ADD CONSTRAINT "builders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "builder_contacts" ADD CONSTRAINT "builder_contacts_organization_id_builder_id_fkey" FOREIGN KEY ("organization_id", "builder_id") REFERENCES "builders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_builder_id_fkey" FOREIGN KEY ("organization_id", "builder_id") REFERENCES "builders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_property_types" ADD CONSTRAINT "project_property_types_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_property_types" ADD CONSTRAINT "project_property_types_organization_id_property_type_id_fkey" FOREIGN KEY ("organization_id", "property_type_id") REFERENCES "property_types"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_configurations" ADD CONSTRAINT "project_configurations_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_configurations" ADD CONSTRAINT "project_configurations_organization_id_configuration_type__fkey" FOREIGN KEY ("organization_id", "configuration_type_id") REFERENCES "configuration_types"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_amenities" ADD CONSTRAINT "project_amenities_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_amenities" ADD CONSTRAINT "project_amenities_organization_id_amenity_id_fkey" FOREIGN KEY ("organization_id", "amenity_id") REFERENCES "amenities"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_organization_id_file_id_fkey" FOREIGN KEY ("organization_id", "file_id") REFERENCES "file_objects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "builder_files" ADD CONSTRAINT "builder_files_organization_id_builder_id_fkey" FOREIGN KEY ("organization_id", "builder_id") REFERENCES "builders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "builder_files" ADD CONSTRAINT "builder_files_organization_id_file_id_fkey" FOREIGN KEY ("organization_id", "file_id") REFERENCES "file_objects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
