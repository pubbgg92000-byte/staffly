import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { isUniqueViolation } from "../org-structure/departments.service";
import { currentOrganizationId } from "../tenant/tenant-context";
import {
  pageOf,
  skipTake,
  type Page,
  type PaginationQueryT,
} from "../common/pagination";
import type {
  CreateHolidayCalendarBodyT,
  UpdateHolidayCalendarBodyT,
} from "./dto";

function requireOrg(): string {
  const id = currentOrganizationId();
  if (!id) throw new Error("no active tenant context");
  return id;
}

@Injectable()
export class HolidayCalendarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: PaginationQueryT): Promise<Page<unknown>> {
    const where: Prisma.HolidayCalendarWhereInput = { deletedAt: null };
    if (q.search) where.name = { contains: q.search, mode: "insensitive" };
    const sortBy =
      q.sortBy && ["name", "createdAt", "isDefault"].includes(q.sortBy)
        ? q.sortBy
        : "name";
    const [items, total] = await Promise.all([
      this.prisma.db.holidayCalendar.findMany({
        where,
        orderBy: [{ isDefault: "desc" }, { [sortBy]: q.sortDir }],
        ...skipTake(q),
      }),
      this.prisma.db.holidayCalendar.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.holidayCalendar.findFirst({
      where: { id, deletedAt: null },
      include: {
        holidays: { orderBy: { date: "asc" } },
      },
    });
    if (!row)
      throw new NotFoundException({ code: "holiday.calendar.not_found" });
    return row;
  }

  async create(body: CreateHolidayCalendarBodyT): Promise<unknown> {
    const orgId = requireOrg();
    try {
      const row = await this.prisma.db.$transaction(
        async (tx: Prisma.TransactionClient) => {
          if (body.isDefault === true) {
            await tx.holidayCalendar.updateMany({
              where: { organizationId: orgId, isDefault: true },
              data: { isDefault: false },
            });
          }
          return tx.holidayCalendar.create({
            data: {
              organizationId: orgId,
              name: body.name,
              code: body.code ?? null,
              description: body.description ?? null,
              isDefault: body.isDefault ?? false,
            },
          });
        },
      );
      await this.audit.record({
        action: "holiday.calendar.create",
        resourceType: "holiday_calendar",
        resourceId: row.id,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException({
          code: "holiday.calendar.conflict_name_or_code",
        });
      throw e;
    }
  }

  async update(id: string, body: UpdateHolidayCalendarBodyT): Promise<unknown> {
    const before = (await this.get(id)) as { isDefault: boolean };
    try {
      const row = await this.prisma.db.$transaction(
        async (tx: Prisma.TransactionClient) => {
          if (body.isDefault === true && !before.isDefault) {
            const orgId = requireOrg();
            await tx.holidayCalendar.updateMany({
              where: {
                organizationId: orgId,
                isDefault: true,
                NOT: { id },
              },
              data: { isDefault: false },
            });
          }
          if (body.isDefault === false && before.isDefault) {
            throw new BadRequestException({
              code: "holiday.calendar.default_required",
            });
          }
          return tx.holidayCalendar.update({
            where: { id },
            data: {
              name: body.name,
              code: body.code,
              description: body.description,
              isDefault: body.isDefault,
            },
          });
        },
      );
      await this.audit.record({
        action: "holiday.calendar.update",
        resourceType: "holiday_calendar",
        resourceId: id,
        before,
        after: row,
      });
      return row;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      if (isUniqueViolation(e))
        throw new ConflictException({
          code: "holiday.calendar.conflict_name_or_code",
        });
      throw e;
    }
  }

  async setDefault(id: string): Promise<unknown> {
    const orgId = requireOrg();
    const target = await this.prisma.db.holidayCalendar.findFirst({
      where: { id, deletedAt: null },
    });
    if (!target)
      throw new NotFoundException({ code: "holiday.calendar.not_found" });
    if (target.isDefault) return target;
    const row = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.holidayCalendar.updateMany({
          where: { organizationId: orgId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
        return tx.holidayCalendar.update({
          where: { id },
          data: { isDefault: true },
        });
      },
    );
    await this.audit.record({
      action: "holiday.calendar.set_default",
      resourceType: "holiday_calendar",
      resourceId: id,
      before: target,
      after: row,
    });
    return row;
  }

  async remove(id: string): Promise<void> {
    const before = await this.prisma.db.holidayCalendar.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before)
      throw new NotFoundException({ code: "holiday.calendar.not_found" });
    if (before.isDefault) {
      throw new BadRequestException({
        code: "holiday.calendar.default_undeletable",
      });
    }
    await this.prisma.db.holidayCalendar.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      action: "holiday.calendar.delete",
      resourceType: "holiday_calendar",
      resourceId: id,
      before,
    });
  }
}
