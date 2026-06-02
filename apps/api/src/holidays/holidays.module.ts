import { Module } from "@nestjs/common";
import { HolidaysController } from "./holidays.controller";
import { HolidayCalendarsService } from "./holiday-calendars.service";
import { HolidaysService } from "./holidays.service";
import { LocationCalendarAssignmentsService } from "./location-calendar-assignments.service";
import { HolidayLookupService } from "./holiday-lookup.service";
import { RbacModule } from "../rbac/rbac.module";

@Module({
  imports: [RbacModule],
  controllers: [HolidaysController],
  providers: [
    HolidayCalendarsService,
    HolidaysService,
    LocationCalendarAssignmentsService,
    HolidayLookupService,
  ],
  exports: [
    HolidayCalendarsService,
    HolidaysService,
    LocationCalendarAssignmentsService,
    HolidayLookupService,
  ],
})
export class HolidaysModule {}
