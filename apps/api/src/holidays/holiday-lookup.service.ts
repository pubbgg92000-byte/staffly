import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";

/**
 * Resolves which holiday calendar applies to an employee, and returns
 * holiday dates within a range. Read-only entry point for leave/attendance.
 *
 * Resolution rule: employee → location → assigned calendar; fallback to the
 * org's default calendar. Returns null only when neither path yields one.
 */
@Injectable()
export class HolidayLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCalendarIdForEmployee(
    employeeId: string,
  ): Promise<string | null> {
    const employee = await this.prisma.db.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { locationId: true },
    });
    if (!employee) return null;
    if (employee.locationId) {
      const assignment =
        await this.prisma.db.locationHolidayCalendar.findUnique({
          where: { locationId: employee.locationId },
          select: { calendarId: true },
        });
      if (assignment) return assignment.calendarId;
    }
    const def = await this.prisma.db.holidayCalendar.findFirst({
      where: { isDefault: true, deletedAt: null },
      select: { id: true },
    });
    return def?.id ?? null;
  }

  async holidayDatesInRange(
    calendarId: string,
    startIso: string,
    endIso: string,
  ): Promise<Set<string>> {
    const rows = await this.prisma.db.holiday.findMany({
      where: {
        calendarId,
        date: { gte: new Date(startIso), lte: new Date(endIso) },
      },
      select: { date: true },
    });
    return new Set(rows.map((r) => toIsoDate(r.date)));
  }

  async holidaysInRange(
    calendarId: string,
    startIso: string,
    endIso: string,
  ): Promise<unknown[]> {
    return this.prisma.db.holiday.findMany({
      where: {
        calendarId,
        date: { gte: new Date(startIso), lte: new Date(endIso) },
      },
      orderBy: { date: "asc" },
    });
  }

  async isHoliday(dateIso: string, employeeId: string): Promise<boolean> {
    const calendarId = await this.resolveCalendarIdForEmployee(employeeId);
    if (!calendarId) return false;
    const row = await this.prisma.db.holiday.findUnique({
      where: {
        calendarId_date: {
          calendarId,
          date: new Date(dateIso),
        },
      },
      select: { id: true },
    });
    return !!row;
  }
}

function toIsoDate(d: Date): string {
  // Prisma returns `Date` for `@db.Date`; the time portion is 00:00 UTC.
  return d.toISOString().slice(0, 10);
}
