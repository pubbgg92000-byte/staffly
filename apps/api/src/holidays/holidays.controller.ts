import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { HolidayCalendarsService } from "./holiday-calendars.service";
import { HolidaysService } from "./holidays.service";
import { LocationCalendarAssignmentsService } from "./location-calendar-assignments.service";
import { HolidayLookupService } from "./holiday-lookup.service";
import { PrismaService } from "../infra/prisma/prisma.service";
import {
  AssignLocationCalendarBody,
  BulkUpsertHolidaysBody,
  CreateHolidayBody,
  CreateHolidayCalendarBody,
  HolidayListQuery,
  MyHolidaysQuery,
  UpdateHolidayBody,
  UpdateHolidayCalendarBody,
  type AssignLocationCalendarBodyT,
  type BulkUpsertHolidaysBodyT,
  type CreateHolidayBodyT,
  type CreateHolidayCalendarBodyT,
  type HolidayListQueryT,
  type MyHolidaysQueryT,
  type UpdateHolidayBodyT,
  type UpdateHolidayCalendarBodyT,
} from "./dto";
import { ZodBody } from "../common/zod-validation.pipe";
import { ZodQuery } from "../common/zod-query.pipe";
import { PaginationQuery, type PaginationQueryT } from "../common/pagination";
import { RequirePermission } from "../rbac/decorators/require-permission.decorator";
import {
  CurrentUser,
  type RequestUser,
} from "../auth/decorators/current-user.decorator";

@Controller()
export class HolidaysController {
  constructor(
    private readonly calendars: HolidayCalendarsService,
    private readonly holidays: HolidaysService,
    private readonly assignments: LocationCalendarAssignmentsService,
    private readonly lookup: HolidayLookupService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Calendars ───────────────────────────────────────────────────────

  @Get("holiday-calendars")
  @RequirePermission("holiday.read")
  listCalendars(
    @Query(new ZodQuery(PaginationQuery)) q: PaginationQueryT,
  ): Promise<unknown> {
    return this.calendars.list(q);
  }

  @Post("holiday-calendars")
  @RequirePermission("holiday.write")
  createCalendar(
    @Body(new ZodBody(CreateHolidayCalendarBody))
    body: CreateHolidayCalendarBodyT,
  ): Promise<unknown> {
    return this.calendars.create(body);
  }

  @Get("holiday-calendars/:id")
  @RequirePermission("holiday.read")
  getCalendar(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.calendars.get(id);
  }

  @Patch("holiday-calendars/:id")
  @RequirePermission("holiday.write")
  updateCalendar(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdateHolidayCalendarBody))
    body: UpdateHolidayCalendarBodyT,
  ): Promise<unknown> {
    return this.calendars.update(id, body);
  }

  @Delete("holiday-calendars/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("holiday.write")
  removeCalendar(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.calendars.remove(id);
  }

  @Post("holiday-calendars/:id/set-default")
  @RequirePermission("holiday.write")
  setDefault(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.calendars.setDefault(id);
  }

  // ─── Holidays in a calendar ──────────────────────────────────────────

  @Get("holiday-calendars/:id/holidays")
  @RequirePermission("holiday.read")
  listHolidays(
    @Param("id", new ParseUUIDPipe()) calendarId: string,
    @Query(new ZodQuery(HolidayListQuery)) q: HolidayListQueryT,
  ): Promise<unknown> {
    return this.holidays.list(calendarId, q);
  }

  @Post("holiday-calendars/:id/holidays")
  @RequirePermission("holiday.write")
  createHoliday(
    @Param("id", new ParseUUIDPipe()) calendarId: string,
    @Body(new ZodBody(CreateHolidayBody)) body: CreateHolidayBodyT,
  ): Promise<unknown> {
    return this.holidays.create(calendarId, body);
  }

  @Post("holiday-calendars/:id/holidays/bulk")
  @RequirePermission("holiday.write")
  bulkUpsertHolidays(
    @Param("id", new ParseUUIDPipe()) calendarId: string,
    @Body(new ZodBody(BulkUpsertHolidaysBody)) body: BulkUpsertHolidaysBodyT,
  ): Promise<unknown> {
    return this.holidays.bulkUpsert(calendarId, body);
  }

  @Patch("holidays/:id")
  @RequirePermission("holiday.write")
  updateHoliday(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdateHolidayBody)) body: UpdateHolidayBodyT,
  ): Promise<unknown> {
    return this.holidays.update(id, body);
  }

  @Delete("holidays/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("holiday.write")
  removeHoliday(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.holidays.remove(id);
  }

  // ─── /holidays/me — resolved for the calling employee ────────────────

  @Get("holidays/me")
  async myHolidays(
    @CurrentUser() user: RequestUser,
    @Query(new ZodQuery(MyHolidaysQuery)) q: MyHolidaysQueryT,
  ): Promise<{ calendarId: string | null; holidays: unknown[] }> {
    const employee = await this.prisma.db.employee.findFirst({
      where: { userId: user.userId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException({ code: "employee.not_found" });
    const calendarId = await this.lookup.resolveCalendarIdForEmployee(
      employee.id,
    );
    if (!calendarId) return { calendarId: null, holidays: [] };
    const holidays = await this.lookup.holidaysInRange(
      calendarId,
      q.from,
      q.to,
    );
    return { calendarId, holidays };
  }

  // ─── Location ↔ calendar assignment ──────────────────────────────────

  @Get("locations/:id/holiday-calendar")
  @RequirePermission("holiday.read")
  getLocationCalendar(
    @Param("id", new ParseUUIDPipe()) locationId: string,
  ): Promise<unknown> {
    return this.assignments.getForLocation(locationId);
  }

  @Post("locations/:id/holiday-calendar")
  @RequirePermission("holiday.write")
  assignLocationCalendar(
    @Param("id", new ParseUUIDPipe()) locationId: string,
    @Body(new ZodBody(AssignLocationCalendarBody))
    body: AssignLocationCalendarBodyT,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.assignments.assign(locationId, body.calendarId, user.userId);
  }

  @Delete("locations/:id/holiday-calendar")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("holiday.write")
  unassignLocationCalendar(
    @Param("id", new ParseUUIDPipe()) locationId: string,
  ): Promise<void> {
    return this.assignments.unassign(locationId);
  }
}
