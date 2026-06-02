-- CreateEnum
CREATE TYPE "announcement_status" AS ENUM ('draft', 'scheduled', 'published', 'archived');

-- CreateEnum
CREATE TYPE "announcement_priority" AS ENUM ('low', 'normal', 'high');

-- CreateEnum
CREATE TYPE "announcement_audience_type" AS ENUM ('all_employees', 'department', 'designation', 'location', 'employment_type', 'specific_employees');

-- AlterTable
ALTER TABLE "attendance_policies" ALTER COLUMN "work_days" SET DEFAULT ARRAY[1, 2, 3, 4, 5]::SMALLINT[];

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "body_html" TEXT NOT NULL,
    "cover_image_url" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "requires_acknowledgment" BOOLEAN NOT NULL DEFAULT false,
    "priority" "announcement_priority" NOT NULL DEFAULT 'normal',
    "status" "announcement_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "scheduled_for" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_audiences" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "audience_type" "announcement_audience_type" NOT NULL,
    "department_id" UUID,
    "designation_id" UUID,
    "location_id" UUID,
    "employment_type" "employment_type",
    "employee_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_acknowledgements" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_organization_id_status_published_at_idx" ON "announcements"("organization_id", "status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "announcements_organization_id_scheduled_for_idx" ON "announcements"("organization_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "announcements_organization_id_pinned_published_at_idx" ON "announcements"("organization_id", "pinned", "published_at" DESC);

-- CreateIndex
CREATE INDEX "announcement_audiences_announcement_id_idx" ON "announcement_audiences"("announcement_id");

-- CreateIndex
CREATE INDEX "announcement_audiences_organization_id_audience_type_idx" ON "announcement_audiences"("organization_id", "audience_type");

-- CreateIndex
CREATE INDEX "announcement_acknowledgements_organization_id_acknowledged__idx" ON "announcement_acknowledgements"("organization_id", "acknowledged_at" DESC);

-- CreateIndex
CREATE INDEX "announcement_acknowledgements_employee_id_acknowledged_at_idx" ON "announcement_acknowledgements"("employee_id", "acknowledged_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "announcement_acknowledgements_announcement_id_employee_id_key" ON "announcement_acknowledgements"("announcement_id", "employee_id");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_audiences" ADD CONSTRAINT "announcement_audiences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_audiences" ADD CONSTRAINT "announcement_audiences_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_acknowledgements" ADD CONSTRAINT "announcement_acknowledgements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_acknowledgements" ADD CONSTRAINT "announcement_acknowledgements_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_acknowledgements" ADD CONSTRAINT "announcement_acknowledgements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
