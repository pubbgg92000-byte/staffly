-- CreateEnum
CREATE TYPE "holiday_type" AS ENUM ('public', 'restricted', 'optional', 'company');

-- CreateTable
CREATE TABLE "holiday_calendars" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "code" VARCHAR(20),
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "holiday_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "holiday_type" NOT NULL DEFAULT 'public',
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_holiday_calendars" (
    "location_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,

    CONSTRAINT "location_holiday_calendars_pkey" PRIMARY KEY ("location_id")
);

-- CreateIndex
CREATE INDEX "holiday_calendars_organization_id_is_default_idx" ON "holiday_calendars"("organization_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_calendars_organization_id_name_key" ON "holiday_calendars"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_calendars_organization_id_code_key" ON "holiday_calendars"("organization_id", "code");

-- CreateIndex (hand-added): enforce at most one default calendar per org.
-- Prisma cannot model a partial unique index in the schema today.
CREATE UNIQUE INDEX "holiday_calendars_one_default_per_org"
    ON "holiday_calendars"("organization_id")
    WHERE "is_default" = TRUE AND "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "holidays_organization_id_date_idx" ON "holidays"("organization_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_calendar_id_date_key" ON "holidays"("calendar_id", "date");

-- CreateIndex
CREATE INDEX "location_holiday_calendars_organization_id_idx" ON "location_holiday_calendars"("organization_id");

-- CreateIndex
CREATE INDEX "location_holiday_calendars_calendar_id_idx" ON "location_holiday_calendars"("calendar_id");

-- AddForeignKey
ALTER TABLE "holiday_calendars" ADD CONSTRAINT "holiday_calendars_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "holiday_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_holiday_calendars" ADD CONSTRAINT "location_holiday_calendars_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_holiday_calendars" ADD CONSTRAINT "location_holiday_calendars_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_holiday_calendars" ADD CONSTRAINT "location_holiday_calendars_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "holiday_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
