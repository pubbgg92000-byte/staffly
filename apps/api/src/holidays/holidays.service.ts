import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { isUniqueViolation } from "../org-structure/departments.service";
import {
  pageOf,
  skipTake,
  type Page,
} from "../common/pagination";
import type {
  BulkUpsertHolidaysBodyT,
  CreateHolidayBodyT,
  HolidayListQueryT,
  UpdateHolidayBodyT,
} from "./dto";

async function requireCalendar(
  prisma: PrismaService,
  calendarId: string,
): Promise<{ id: string; organizationId: string }> {
  const cal = await prisma.db.holidayCalendar.findFirst({
    where: { id: calendarId, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!cal)
    throw new NotFoundException({ code: "holiday.calendar.not_found" });
  return cal;
}

@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(calendarId: string, q: HolidayListQueryT): Promise<Page<unknown>> {
    await requireCalendar(this.prisma, calendarId);
    const where: Prisma.HolidayWhereInput = { calendarId };
    if (q.from || q.to) {
      where.date = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    if (q.type) where.type = q.type;
    const [items, total] = await Promise.all([
      this.prisma.db.holiday.findMany({
        where,
        orderBy: { date: q.sortDir },
        ...skipTake(q),
      }),
      this.prisma.db.holiday.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.holiday.findFirst({ where: { id } });
    if (!row) throw new NotFoundException({ code: "holiday.not_found" });
    return row;
  }

  async create(
    calendarId: string,
    body: CreateHolidayBodyT,
  ): Promise<unknown> {
    const cal = await requireCalendar(this.prisma, calendarId);
    try {
      const row = await this.prisma.db.holiday.create({
        data: {
          organizationId: cal.organizationId,
          calendarId: cal.id,
          date: new Date(body.date),
          name: body.name,
          type: body.type ?? "public",
          isOptional: body.isOptional ?? false,
          description: body.description ?? null,
        },
      });
      await this.audit.record({
        action: "holiday.create",
        resourceType: "holiday",
        resourceId: row.id,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException({ code: "holiday.conflict_date" });
      throw e;
    }
  }

  async update(id: string, body: UpdateHolidayBodyT): Promise<unknown> {
    const before = await this.prisma.db.holiday.findFirst({ where: { id } });
    if (!before) throw new NotFoundException({ code: "holiday.not_found" });
    try {
      const row = await this.prisma.db.holiday.update({
        where: { id },
        data: {
          date: body.date ? new Date(body.date) : undefined,
          name: body.name,
          type: body.type,
          isOptional: body.isOptional,
          description: body.description,
        },
      });
      await this.audit.record({
        action: "holiday.update",
        resourceType: "holiday",
        resourceId: id,
        before,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException({ code: "holiday.conflict_date" });
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const before = await this.prisma.db.holiday.findFirst({ where: { id } });
    if (!before) throw new NotFoundException({ code: "holiday.not_found" });
    await this.prisma.db.holiday.delete({ where: { id } });
    await this.audit.record({
      action: "holiday.delete",
      resourceType: "holiday",
      resourceId: id,
      before,
    });
  }

  async bulkUpsert(
    calendarId: string,
    body: BulkUpsertHolidaysBodyT,
  ): Promise<{ upserted: number }> {
    const cal = await requireCalendar(this.prisma, calendarId);
    let upserted = 0;
    await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        for (const item of body.items) {
          await tx.holiday.upsert({
            where: {
              calendarId_date: {
                calendarId: cal.id,
                date: new Date(item.date),
              },
            },
            create: {
              organizationId: cal.organizationId,
              calendarId: cal.id,
              date: new Date(item.date),
              name: item.name,
              type: item.type ?? "public",
              isOptional: item.isOptional ?? false,
              description: item.description ?? null,
            },
            update: {
              name: item.name,
              type: item.type ?? "public",
              isOptional: item.isOptional ?? false,
              description: item.description ?? null,
            },
          });
          upserted += 1;
        }
      },
    );
    await this.audit.record({
      action: "holiday.bulk_upsert",
      resourceType: "holiday_calendar",
      resourceId: cal.id,
      metadata: { count: upserted },
    });
    return { upserted };
  }
}
