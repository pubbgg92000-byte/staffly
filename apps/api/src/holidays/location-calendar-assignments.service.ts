import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class LocationCalendarAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getForLocation(locationId: string): Promise<unknown | null> {
    const location = await this.prisma.db.location.findFirst({
      where: { id: locationId, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    if (!location) throw new NotFoundException({ code: "location.not_found" });
    return this.prisma.db.locationHolidayCalendar.findUnique({
      where: { locationId },
      include: { calendar: true },
    });
  }

  async assign(
    locationId: string,
    calendarId: string,
    actorUserId: string,
  ): Promise<unknown> {
    const location = await this.prisma.db.location.findFirst({
      where: { id: locationId, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    if (!location) throw new NotFoundException({ code: "location.not_found" });
    const calendar = await this.prisma.db.holidayCalendar.findFirst({
      where: { id: calendarId, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    if (!calendar)
      throw new NotFoundException({ code: "holiday.calendar.not_found" });

    const row = await this.prisma.db.locationHolidayCalendar.upsert({
      where: { locationId },
      create: {
        organizationId: location.organizationId,
        locationId,
        calendarId,
        assignedBy: actorUserId,
      },
      update: {
        calendarId,
        assignedBy: actorUserId,
        assignedAt: new Date(),
      } satisfies Prisma.LocationHolidayCalendarUncheckedUpdateInput,
    });
    await this.audit.record({
      action: "holiday.calendar.location_assign",
      resourceType: "location_holiday_calendar",
      resourceId: locationId,
      after: row,
    });
    return row;
  }

  async unassign(locationId: string): Promise<void> {
    const existing = await this.prisma.db.locationHolidayCalendar.findUnique({
      where: { locationId },
    });
    if (!existing)
      throw new NotFoundException({
        code: "holiday.calendar.location_assignment_not_found",
      });
    await this.prisma.db.locationHolidayCalendar.delete({
      where: { locationId },
    });
    await this.audit.record({
      action: "holiday.calendar.location_unassign",
      resourceType: "location_holiday_calendar",
      resourceId: locationId,
      before: existing,
    });
  }
}
