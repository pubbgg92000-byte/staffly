-- CreateEnum
CREATE TYPE "document_audience_type" AS ENUM ('all_employees', 'department', 'designation', 'location', 'employment_type', 'specific_employees');

-- AlterTable
ALTER TABLE "attendance_policies" ALTER COLUMN "work_days" SET DEFAULT ARRAY[1, 2, 3, 4, 5]::SMALLINT[];

-- CreateTable
CREATE TABLE "document_categories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "code" VARCHAR(20),
    "color" VARCHAR(9) NOT NULL DEFAULT '#94A3B8',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_personal" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_personal" BOOLEAN NOT NULL DEFAULT false,
    "subject_employee_id" UUID,
    "current_version_id" UUID,
    "due_by" DATE,
    "published_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" UUID,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_audiences" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "audience_type" "document_audience_type" NOT NULL,
    "department_id" UUID,
    "designation_id" UUID,
    "location_id" UUID,
    "employment_type" "employment_type",
    "employee_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_acknowledgements" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" INET,
    "user_agent" TEXT,

    CONSTRAINT "document_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_categories_organization_id_is_active_idx" ON "document_categories"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_organization_id_name_key" ON "document_categories"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_organization_id_code_key" ON "document_categories"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "documents_current_version_id_key" ON "documents"("current_version_id");

-- CreateIndex
CREATE INDEX "documents_organization_id_category_id_idx" ON "documents"("organization_id", "category_id");

-- CreateIndex
CREATE INDEX "documents_organization_id_published_at_idx" ON "documents"("organization_id", "published_at" DESC);

-- CreateIndex
CREATE INDEX "documents_organization_id_expires_at_idx" ON "documents"("organization_id", "expires_at");

-- CreateIndex
CREATE INDEX "documents_subject_employee_id_idx" ON "documents"("subject_employee_id");

-- CreateIndex
CREATE INDEX "document_versions_organization_id_document_id_uploaded_at_idx" ON "document_versions"("organization_id", "document_id", "uploaded_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_no_key" ON "document_versions"("document_id", "version_no");

-- CreateIndex
CREATE INDEX "document_audiences_document_id_idx" ON "document_audiences"("document_id");

-- CreateIndex
CREATE INDEX "document_audiences_organization_id_audience_type_idx" ON "document_audiences"("organization_id", "audience_type");

-- CreateIndex
CREATE INDEX "document_acknowledgements_organization_id_acknowledged_at_idx" ON "document_acknowledgements"("organization_id", "acknowledged_at" DESC);

-- CreateIndex
CREATE INDEX "document_acknowledgements_employee_id_acknowledged_at_idx" ON "document_acknowledgements"("employee_id", "acknowledged_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "document_acknowledgements_document_id_employee_id_key" ON "document_acknowledgements"("document_id", "employee_id");

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "document_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_subject_employee_id_fkey" FOREIGN KEY ("subject_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_audiences" ADD CONSTRAINT "document_audiences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_audiences" ADD CONSTRAINT "document_audiences_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_acknowledgements" ADD CONSTRAINT "document_acknowledgements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_acknowledgements" ADD CONSTRAINT "document_acknowledgements_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_acknowledgements" ADD CONSTRAINT "document_acknowledgements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
