import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PermissionsService } from "../rbac/permissions.service";
import { pageOf, skipTake, type Page } from "../common/pagination";
import { resolveEmployeeTimezone } from "../common/timezone";
import {
  hhmmToMinutes,
  localDateInTimezone,
  localMinutesInTimezone,
} from "./local-date";
import type { CheckInBodyT, CheckOutBodyT, RecordsListQueryT } from "./dto";

interface ActorCtx {
  userId: string;
  organizationId: string;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
  ) {}

  async list(q: RecordsListQueryT): Promise<Page<unknown>> {
    const where: Prisma.AttendanceRecordWhereInput = {};
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.status) where.status = q.status;
    if (q.from || q.to) {
      where.attendanceDate = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    const [items, total] = await Promise.all([
      this.prisma.db.attendanceRecord.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortDir },
        ...skipTake(q),
      }),
      this.prisma.db.attendanceRecord.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.attendanceRecord.findFirst({
      where: { id },
    });
    if (!row) throw new NotFoundException({ code: "attendance.not_found" });
    return row;
  }

  async checkIn(body: CheckInBodyT, actor: ActorCtx): Promise<unknown> {
    const employee = await this.resolveTargetEmployee(body.employeeId, actor);
    const tz = resolveEmployeeTimezone(employee);
    const now = new Date();
    const localDate = localDateInTimezone(now, tz);

    const existing = await this.prisma.db.attendanceRecord.findUnique({
      where: {
        employeeId_attendanceDate: {
          employeeId: employee.id,
          attendanceDate: new Date(localDate),
        },
      },
    });
    if (existing && existing.checkInAt) {
      throw new BadRequestException({ code: "attendance.already_checked_in" });
    }

    const policy = await this.policyFor();
    const isLate = policy
      ? localMinutesInTimezone(now, tz) >
        hhmmToMinutes(policy.dayStartTime) + policy.graceMinutesLate
      : false;

    const data: Prisma.AttendanceRecordUncheckedCreateInput = {
      organizationId: actor.organizationId,
      employeeId: employee.id,
      attendanceDate: new Date(localDate),
      checkInAt: now,
      checkInIp: actor.ipAddress ?? null,
      checkInUserAgent: actor.userAgent ?? null,
      status: "present",
      isLate,
      notes: body.notes ?? null,
    };

    const row = existing
      ? await this.prisma.db.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            checkInAt: now,
            checkInIp: actor.ipAddress ?? null,
            checkInUserAgent: actor.userAgent ?? null,
            status: "present",
            isLate,
            notes: body.notes ?? existing.notes,
          },
        })
      : await this.prisma.db.attendanceRecord.create({ data });

    await this.audit.record({
      action: "attendance.check_in",
      resourceType: "attendance_record",
      resourceId: row.id,
      after: row,
    });
    return row;
  }

  async checkOut(body: CheckOutBodyT, actor: ActorCtx): Promise<unknown> {
    const employee = await this.resolveTargetEmployee(body.employeeId, actor);
    const tz = resolveEmployeeTimezone(employee);
    const now = new Date();
    const localDate = localDateInTimezone(now, tz);

    const record = await this.prisma.db.attendanceRecord.findUnique({
      where: {
        employeeId_attendanceDate: {
          employeeId: employee.id,
          attendanceDate: new Date(localDate),
        },
      },
    });
    if (!record || !record.checkInAt) {
      throw new BadRequestException({ code: "attendance.not_checked_in" });
    }
    if (record.checkOutAt) {
      throw new BadRequestException({ code: "attendance.already_checked_out" });
    }

    const worked = Math.max(
      0,
      Math.round((now.getTime() - record.checkInAt.getTime()) / 60_000),
    );

    const policy = await this.policyFor();
    let status: "present" | "half_day" = "present";
    if (policy) {
      const halfMin = Math.round(Number(policy.halfDayThresholdHours) * 60);
      if (worked < halfMin) status = "half_day";
    }

    const updated = await this.prisma.db.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutAt: now,
        checkOutIp: actor.ipAddress ?? null,
        checkOutUserAgent: actor.userAgent ?? null,
        workedMinutes: worked,
        status,
        notes: body.notes ?? record.notes,
      },
    });

    await this.audit.record({
      action: "attendance.check_out",
      resourceType: "attendance_record",
      resourceId: updated.id,
      before: record,
      after: updated,
    });
    return updated;
  }

  /** Today's record for the calling employee. Auto-locates by user_id. */
  async myToday(actor: ActorCtx): Promise<unknown> {
    const employee = await this.findEmployeeByUserId(actor.userId);
    if (!employee) {
      throw new NotFoundException({ code: "attendance.no_employee_for_user" });
    }
    const tz = resolveEmployeeTimezone(employee);
    const localDate = localDateInTimezone(new Date(), tz);
    const row = await this.prisma.db.attendanceRecord.findUnique({
      where: {
        employeeId_attendanceDate: {
          employeeId: employee.id,
          attendanceDate: new Date(localDate),
        },
      },
    });
    return {
      employee: { id: employee.id, displayName: employee.displayName },
      date: localDate,
      timezone: tz,
      record: row,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private async findEmployeeByUserId(userId: string) {
    return this.prisma.db.employee.findFirst({
      where: { userId, deletedAt: null },
      include: {
        location: { select: { timezone: true } },
        organization: { select: { timezone: true } },
      },
    });
  }

  private async findEmployeeById(id: string) {
    return this.prisma.db.employee.findFirst({
      where: { id, deletedAt: null },
      include: {
        location: { select: { timezone: true } },
        organization: { select: { timezone: true } },
      },
    });
  }

  /**
   * Returns the employee whose attendance the call refers to.
   *
   *   - If `targetEmployeeId` is provided, the caller must hold
   *     `attendance.write` (admin punching someone else).
   *   - Otherwise we look up the employee linked to the caller's user.
   *
   * Tenant scoping is enforced by the Prisma extension — both lookups are
   * automatically org-scoped.
   */
  private async resolveTargetEmployee(
    targetEmployeeId: string | undefined,
    actor: ActorCtx,
  ): Promise<
    NonNullable<Awaited<ReturnType<AttendanceService["findEmployeeById"]>>>
  > {
    if (targetEmployeeId) {
      // Self-service callers have `attendance.write`. To punch on behalf of
      // another employee, the caller must hold the admin-level
      // `attendance.approve` permission (v0.5 will introduce permission
      // scopes (self vs global) and collapse this into one check).
      const perms = await this.permissions.loadUserPermissions(actor.userId);
      if (!perms.has("attendance.approve")) {
        throw new ForbiddenException({ code: "auth.forbidden" });
      }
      const target = await this.findEmployeeById(targetEmployeeId);
      if (!target) {
        throw new NotFoundException({ code: "employee.not_found" });
      }
      return target;
    }
    const me = await this.findEmployeeByUserId(actor.userId);
    if (!me) {
      throw new NotFoundException({ code: "attendance.no_employee_for_user" });
    }
    return me;
  }

  private async policyFor() {
    return this.prisma.db.attendancePolicy.findFirst({
      where: { isDefault: true, deletedAt: null },
    });
  }
}
