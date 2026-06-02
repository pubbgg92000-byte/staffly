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
import type {
  CreateRegularizationBodyT,
  DecideRegularizationBodyT,
  RegularizationsListQueryT,
} from "./dto";

interface ActorCtx {
  userId: string;
  organizationId: string;
}

@Injectable()
export class RegularizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
  ) {}

  async list(q: RegularizationsListQueryT): Promise<Page<unknown>> {
    const where: Prisma.AttendanceRegularizationWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.employeeId) where.employeeId = q.employeeId;
    const [items, total] = await Promise.all([
      this.prisma.db.attendanceRegularization.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...skipTake(q),
      }),
      this.prisma.db.attendanceRegularization.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.attendanceRegularization.findFirst({
      where: { id },
    });
    if (!row) throw new NotFoundException({ code: "regularization.not_found" });
    return row;
  }

  async create(
    body: CreateRegularizationBodyT,
    actor: ActorCtx,
  ): Promise<unknown> {
    // Self-service (no employeeId) → resolve employee from user. Else admin
    // submitting on someone else's behalf → require attendance.write.
    let employeeId: string;
    if (body.employeeId) {
      const perms = await this.permissions.loadUserPermissions(actor.userId);
      if (!perms.has("attendance.write")) {
        throw new ForbiddenException({ code: "auth.forbidden" });
      }
      employeeId = body.employeeId;
    } else {
      const me = await this.prisma.db.employee.findFirst({
        where: { userId: actor.userId, deletedAt: null },
        select: { id: true },
      });
      if (!me) {
        throw new NotFoundException({
          code: "attendance.no_employee_for_user",
        });
      }
      employeeId = me.id;
    }

    const data: Prisma.AttendanceRegularizationUncheckedCreateInput = {
      organizationId: actor.organizationId,
      employeeId,
      attendanceDate: new Date(body.attendanceDate),
      requestedCheckInAt: body.requestedCheckInAt
        ? new Date(body.requestedCheckInAt)
        : null,
      requestedCheckOutAt: body.requestedCheckOutAt
        ? new Date(body.requestedCheckOutAt)
        : null,
      reason: body.reason,
      status: "pending",
    };
    const row = await this.prisma.db.attendanceRegularization.create({ data });
    await this.audit.record({
      action: "attendance.regularization.create",
      resourceType: "attendance_regularization",
      resourceId: row.id,
      after: row,
    });
    return row;
  }

  async decide(
    id: string,
    body: DecideRegularizationBodyT,
    actor: ActorCtx,
  ): Promise<unknown> {
    const reg = (await this.prisma.db.attendanceRegularization.findFirst({
      where: { id },
    })) as Awaited<
      ReturnType<typeof this.prisma.db.attendanceRegularization.findFirst>
    >;
    if (!reg) {
      throw new NotFoundException({ code: "regularization.not_found" });
    }
    if (reg.status !== "pending") {
      throw new BadRequestException({
        code: "regularization.already_decided",
      });
    }

    const updated = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const upd = await tx.attendanceRegularization.update({
          where: { id },
          data: {
            status: body.decision,
            decidedBy: actor.userId,
            decidedAt: new Date(),
            decisionComment: body.comment ?? null,
          },
        });

        if (body.decision === "approved") {
          const existing = await tx.attendanceRecord.findUnique({
            where: {
              employeeId_attendanceDate: {
                employeeId: reg.employeeId,
                attendanceDate: reg.attendanceDate,
              },
            },
          });
          const recordData = {
            organizationId: reg.organizationId,
            employeeId: reg.employeeId,
            attendanceDate: reg.attendanceDate,
            checkInAt: reg.requestedCheckInAt ?? existing?.checkInAt ?? null,
            checkOutAt: reg.requestedCheckOutAt ?? existing?.checkOutAt ?? null,
            status: "present" as const,
            isRegularized: true,
            regularizationId: reg.id,
          };
          if (existing) {
            await tx.attendanceRecord.update({
              where: { id: existing.id },
              data: recordData,
            });
          } else {
            await tx.attendanceRecord.create({ data: recordData });
          }
        }
        return upd;
      },
    );

    await this.audit.record({
      action: `attendance.regularization.${body.decision}`,
      resourceType: "attendance_regularization",
      resourceId: id,
      before: reg,
      after: updated,
    });
    return updated;
  }
}
