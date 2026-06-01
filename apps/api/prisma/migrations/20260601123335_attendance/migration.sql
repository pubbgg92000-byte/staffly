-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('present', 'half_day', 'absent', 'on_leave', 'holiday', 'weekoff');

-- CreateEnum
CREATE TYPE "regularization_status" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "attendance_policies" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "work_days" SMALLINT[] DEFAULT ARRAY[1, 2, 3, 4, 5]::SMALLINT[],
    "expected_hours_per_day" DECIMAL(4,2) NOT NULL DEFAULT 8.00,
    "day_start_time" VARCHAR(8) NOT NULL DEFAULT '09:00',
    "day_end_time" VARCHAR(8) NOT NULL DEFAULT '18:00',
    "grace_minutes_late" SMALLINT NOT NULL DEFAULT 15,
    "half_day_threshold_hours" DECIMAL(4,2) NOT NULL DEFAULT 4.00,
    "regularization_window_days" SMALLINT NOT NULL DEFAULT 14,
    "auto_close_at_minutes_after_end" SMALLINT DEFAULT 120,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "check_in_at" TIMESTAMPTZ(6),
    "check_out_at" TIMESTAMPTZ(6),
    "check_in_ip" INET,
    "check_out_ip" INET,
    "check_in_user_agent" TEXT,
    "check_out_user_agent" TEXT,
    "worked_minutes" INTEGER,
    "status" "attendance_status" NOT NULL DEFAULT 'absent',
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "is_regularized" BOOLEAN NOT NULL DEFAULT false,
    "regularization_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_regularizations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "requested_check_in_at" TIMESTAMPTZ(6),
    "requested_check_out_at" TIMESTAMPTZ(6),
    "reason" TEXT NOT NULL,
    "status" "regularization_status" NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "attendance_regularizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_policies_organization_id_is_default_idx" ON "attendance_policies"("organization_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_organization_id_name_key" ON "attendance_policies"("organization_id", "name");

-- CreateIndex
CREATE INDEX "attendance_records_organization_id_attendance_date_idx" ON "attendance_records"("organization_id", "attendance_date");

-- CreateIndex
CREATE INDEX "attendance_records_organization_id_status_attendance_date_idx" ON "attendance_records"("organization_id", "status", "attendance_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employee_id_attendance_date_key" ON "attendance_records"("employee_id", "attendance_date");

-- CreateIndex
CREATE INDEX "attendance_regularizations_organization_id_status_created_a_idx" ON "attendance_regularizations"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "attendance_regularizations_employee_id_attendance_date_idx" ON "attendance_regularizations"("employee_id", "attendance_date");

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_regularization_id_fkey" FOREIGN KEY ("regularization_id") REFERENCES "attendance_regularizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "attendance_regularizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "attendance_regularizations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
