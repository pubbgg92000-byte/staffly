-- CreateEnum
CREATE TYPE "checkout_type" AS ENUM ('normal', 'emergency');

-- CreateEnum
CREATE TYPE "early_checkout_reason" AS ENUM ('medical', 'personal', 'emergency', 'manager_approved');

-- CreateEnum
CREATE TYPE "attendance_approval_status" AS ENUM ('pending', 'approved', 'rejected', 'not_required');

-- AlterTable
ALTER TABLE "attendance_policies" ADD COLUMN     "early_checkout_threshold_hours" DECIMAL(4,2) NOT NULL DEFAULT 6.00,
ALTER COLUMN "work_days" SET DEFAULT ARRAY[1, 2, 3, 4, 5]::SMALLINT[];

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "approval_status" "attendance_approval_status",
ADD COLUMN     "checkout_type" "checkout_type",
ADD COLUMN     "early_checkout_note" TEXT,
ADD COLUMN     "early_checkout_reason" "early_checkout_reason",
ADD COLUMN     "review_comment" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "reviewed_by" UUID;

-- CreateIndex
CREATE INDEX "attendance_records_organization_id_approval_status_idx" ON "attendance_records"("organization_id", "approval_status");
