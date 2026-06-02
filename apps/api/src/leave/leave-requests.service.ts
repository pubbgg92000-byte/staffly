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
import { LeaveBalancesService } from "./leave-balances.service";
import { pageOf, skipTake, type Page } from "../common/pagination";
import { availableBalance, computeUnits } from "./leave-rules";
import type { ApplyLeaveBodyT, DecideBodyT, RequestsListQueryT } from "./dto";

interface ActorCtx {
  userId: string;
  organizationId: string;
}

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
    private readonly balances: LeaveBalancesService,
  ) {}

  async list(q: RequestsListQueryT): Promise<Page<unknown>> {
    const where: Prisma.LeaveRequestWhereInput = {};
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.leaveTypeId) where.leaveTypeId = q.leaveTypeId;
    if (q.status) where.status = q.status;
    if (q.from || q.to) {
      where.startDate = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    const [items, total] = await Promise.all([
      this.prisma.db.leaveRequest.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortDir },
        ...skipTake(q),
        include: {
          leaveType: {
            select: { id: true, code: true, name: true, color: true },
          },
        },
      }),
      this.prisma.db.leaveRequest.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async myList(actor: ActorCtx, q: RequestsListQueryT): Promise<Page<unknown>> {
    const employee = await this.findEmployee(actor.userId);
    return this.list({ ...q, employeeId: employee.id });
  }

  async apply(body: ApplyLeaveBodyT, actor: ActorCtx): Promise<unknown> {
    // 1. Resolve employee: self by user_id, or admin-supplied employeeId
    //    with attendance.approve-style elevation (leave.balance.adjust is the
    //    HR-only permission we re-use; for v0.5 we use leave.approve as the
    //    proxy because it implies admin role).
    let employee: { id: string };
    if (body.employeeId) {
      const perms = await this.permissions.loadUserPermissions(actor.userId);
      if (!perms.has("leave.approve")) {
        throw new ForbiddenException({ code: "auth.forbidden" });
      }
      const e = await this.prisma.db.employee.findFirst({
        where: { id: body.employeeId, deletedAt: null },
        select: { id: true },
      });
      if (!e) throw new NotFoundException({ code: "employee.not_found" });
      employee = e;
    } else {
      employee = await this.findEmployee(actor.userId);
    }

    // 2. Compute units and validate against the leave type's min/max bounds.
    const units = computeUnits({
      startDate: body.startDate,
      endDate: body.endDate,
      halfDayStart: body.halfDayStart ?? false,
      halfDayEnd: body.halfDayEnd ?? false,
    });
    if (units <= 0) {
      throw new BadRequestException({ code: "leave.units.invalid" });
    }
    const leaveType = await this.prisma.db.leaveType.findFirst({
      where: { id: body.leaveTypeId, deletedAt: null },
    });
    if (!leaveType) {
      throw new NotFoundException({ code: "leave.type.not_found" });
    }
    if (units < Number(leaveType.minRequestUnits)) {
      throw new BadRequestException({ code: "leave.units.below_minimum" });
    }
    if (
      leaveType.maxRequestUnits !== null &&
      units > Number(leaveType.maxRequestUnits)
    ) {
      throw new BadRequestException({ code: "leave.units.above_maximum" });
    }

    // 3. Reject overlap with any non-terminal request from this employee.
    const overlap = await this.prisma.db.leaveRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: { in: ["pending", "approved"] },
        startDate: { lte: new Date(body.endDate) },
        endDate: { gte: new Date(body.startDate) },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new BadRequestException({ code: "leave.overlap" });
    }

    // 4. Balance check (skip for LOP-style "none" accrual types: no balance row).
    const cycleYear = new Date(body.startDate).getUTCFullYear();
    await this.balances.ensureBalancesForCycle(
      employee.id,
      cycleYear,
      actor.organizationId,
    );
    const balance = await this.prisma.db.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_cycleYear: {
          employeeId: employee.id,
          leaveTypeId: body.leaveTypeId,
          cycleYear,
        },
      },
    });
    if (balance && leaveType.accrualType !== "none") {
      const available = availableBalance({
        allocated: Number(balance.allocated),
        carryForward: Number(balance.carryForward),
        adjusted: Number(balance.adjusted),
        used: Number(balance.used),
        pending: Number(balance.pending),
      });
      if (available < units) {
        throw new BadRequestException({ code: "leave.insufficient_balance" });
      }
    }

    // 5. Create the request + reserve balance (pending += units) atomically.
    const result = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const created = await tx.leaveRequest.create({
          data: {
            organizationId: actor.organizationId,
            employeeId: employee.id,
            leaveTypeId: body.leaveTypeId,
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
            halfDayStart: body.halfDayStart ?? false,
            halfDayEnd: body.halfDayEnd ?? false,
            units,
            reason: body.reason ?? null,
            attachmentUrl: body.attachmentUrl ?? null,
            status: leaveType.requiresApproval ? "pending" : "approved",
            createdBy: actor.userId,
          },
        });
        if (balance) {
          if (created.status === "approved") {
            await tx.leaveBalance.update({
              where: { id: balance.id },
              data: { used: { increment: units } },
            });
          } else {
            await tx.leaveBalance.update({
              where: { id: balance.id },
              data: { pending: { increment: units } },
            });
          }
        }
        return created;
      },
    );

    await this.audit.record({
      action: "leave.request.create",
      resourceType: "leave_request",
      resourceId: result.id,
      after: result,
    });
    return result;
  }

  async cancel(id: string, actor: ActorCtx): Promise<unknown> {
    const before = await this.prisma.db.leaveRequest.findFirst({
      where: { id },
    });
    if (!before)
      throw new NotFoundException({ code: "leave.request.not_found" });
    if (before.status !== "pending" && before.status !== "approved") {
      throw new BadRequestException({ code: "leave.request.not_cancellable" });
    }
    // Authorization: self may cancel own request, otherwise need leave.approve.
    const me = await this.prisma.db.employee.findFirst({
      where: { userId: actor.userId, deletedAt: null },
      select: { id: true },
    });
    const isSelf = me?.id === before.employeeId;
    if (!isSelf) {
      const perms = await this.permissions.loadUserPermissions(actor.userId);
      if (!perms.has("leave.approve")) {
        throw new ForbiddenException({ code: "auth.forbidden" });
      }
    }

    const result = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updated = await tx.leaveRequest.update({
          where: { id },
          data: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelledBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
        // Release the balance reservation.
        const bal = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_cycleYear: {
              employeeId: before.employeeId,
              leaveTypeId: before.leaveTypeId,
              cycleYear: before.startDate.getUTCFullYear(),
            },
          },
        });
        if (bal) {
          if (before.status === "pending") {
            await tx.leaveBalance.update({
              where: { id: bal.id },
              data: { pending: { decrement: Number(before.units) } },
            });
          } else {
            await tx.leaveBalance.update({
              where: { id: bal.id },
              data: { used: { decrement: Number(before.units) } },
            });
          }
        }
        return updated;
      },
    );
    await this.audit.record({
      action: "leave.request.cancel",
      resourceType: "leave_request",
      resourceId: id,
      before,
      after: result,
    });
    return result;
  }

  approve(id: string, body: DecideBodyT, actor: ActorCtx): Promise<unknown> {
    return this.decide(id, "approved", body, actor);
  }

  reject(id: string, body: DecideBodyT, actor: ActorCtx): Promise<unknown> {
    return this.decide(id, "rejected", body, actor);
  }

  private async decide(
    id: string,
    decision: "approved" | "rejected",
    body: DecideBodyT,
    actor: ActorCtx,
  ): Promise<unknown> {
    const before = await this.prisma.db.leaveRequest.findFirst({
      where: { id },
    });
    if (!before)
      throw new NotFoundException({ code: "leave.request.not_found" });
    if (before.status !== "pending") {
      throw new BadRequestException({ code: "leave.request.not_pending" });
    }

    const result = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updated = await tx.leaveRequest.update({
          where: { id },
          data: {
            status: decision,
            decidedAt: new Date(),
            decidedBy: actor.userId,
            decisionComment: body.comment ?? null,
            updatedBy: actor.userId,
          },
        });
        await tx.leaveApproval.create({
          data: {
            organizationId: actor.organizationId,
            leaveRequestId: id,
            approverUserId: actor.userId,
            decision,
            comment: body.comment ?? null,
          },
        });
        // Move pending → used on approve, release pending on reject.
        const bal = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_cycleYear: {
              employeeId: before.employeeId,
              leaveTypeId: before.leaveTypeId,
              cycleYear: before.startDate.getUTCFullYear(),
            },
          },
        });
        if (bal) {
          if (decision === "approved") {
            await tx.leaveBalance.update({
              where: { id: bal.id },
              data: {
                pending: { decrement: Number(before.units) },
                used: { increment: Number(before.units) },
              },
            });
          } else {
            await tx.leaveBalance.update({
              where: { id: bal.id },
              data: { pending: { decrement: Number(before.units) } },
            });
          }
        }
        return updated;
      },
    );

    await this.audit.record({
      action: `leave.request.${decision === "approved" ? "approve" : "reject"}`,
      resourceType: "leave_request",
      resourceId: id,
      before,
      after: result,
      metadata: body.comment ? { comment: body.comment } : {},
    });
    return result;
  }

  private async findEmployee(userId: string): Promise<{ id: string }> {
    const employee = await this.prisma.db.employee.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException({ code: "leave.no_employee_for_user" });
    }
    return employee;
  }
}
