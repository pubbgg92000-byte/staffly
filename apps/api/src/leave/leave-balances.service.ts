import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CallerScopeService } from "../rbac/caller-scope.service";
import { pageOf, skipTake, type Page } from "../common/pagination";
import { currentOrganizationId } from "../tenant/tenant-context";
import { availableBalance } from "./leave-rules";
import type { AdjustBalanceBodyT, BalancesListQueryT } from "./dto";

interface ActorCtx {
  userId: string;
  organizationId: string;
}

@Injectable()
export class LeaveBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly callerScope: CallerScopeService,
  ) {}

  async list(
    q: BalancesListQueryT,
    callerUserId?: string,
  ): Promise<Page<unknown>> {
    const where: Prisma.LeaveBalanceWhereInput = {};
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.leaveTypeId) where.leaveTypeId = q.leaveTypeId;
    if (q.cycleYear) where.cycleYear = q.cycleYear;
    // Team scoping: a manager (leave.read at `team` scope) sees only their
    // team's balances. global scope → no restriction. An explicit employeeId
    // filter is intersected with the team (out-of-team → empty result).
    if (callerUserId) {
      const team = await this.callerScope.teamFilterFor(
        callerUserId,
        "leave.read",
      );
      if (team) {
        if (q.employeeId) {
          if (!team.includes(q.employeeId)) where.employeeId = { in: [] };
        } else {
          where.employeeId = { in: team };
        }
      }
    }
    const [items, total] = await Promise.all([
      this.prisma.db.leaveBalance.findMany({
        where,
        orderBy: { cycleYear: "desc" },
        ...skipTake(q),
        include: {
          leaveType: {
            select: { id: true, code: true, name: true, color: true },
          },
        },
      }),
      this.prisma.db.leaveBalance.count({ where }),
    ]);
    return pageOf(items.map(this.withAvailable), total, q);
  }

  /** Current-year balances for the calling employee. Auto-allocates from leave type accrual if missing. */
  async myBalances(actor: ActorCtx): Promise<unknown> {
    const employee = await this.prisma.db.employee.findFirst({
      where: { userId: actor.userId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException({ code: "leave.no_employee_for_user" });
    }
    const cycleYear = new Date().getUTCFullYear();
    await this.ensureBalancesForCycle(
      employee.id,
      cycleYear,
      actor.organizationId,
    );
    const balances = await this.prisma.db.leaveBalance.findMany({
      where: { employeeId: employee.id, cycleYear },
      include: {
        leaveType: {
          select: { id: true, code: true, name: true, color: true },
        },
      },
      orderBy: { leaveType: { code: "asc" } },
    });
    return {
      employeeId: employee.id,
      cycleYear,
      items: balances.map(this.withAvailable),
    };
  }

  async adjust(
    id: string,
    body: AdjustBalanceBodyT,
    actor: ActorCtx,
  ): Promise<unknown> {
    const before = await this.prisma.db.leaveBalance.findFirst({
      where: { id },
    });
    if (!before) {
      throw new NotFoundException({ code: "leave.balance.not_found" });
    }
    const row = await this.prisma.db.leaveBalance.update({
      where: { id },
      data: {
        ...(body.allocated !== undefined ? { allocated: body.allocated } : {}),
        ...(body.carryForward !== undefined
          ? { carryForward: body.carryForward }
          : {}),
        ...(body.adjusted !== undefined ? { adjusted: body.adjusted } : {}),
        updatedBy: actor.userId,
      },
    });
    await this.audit.record({
      action: "leave.balance.adjust",
      resourceType: "leave_balance",
      resourceId: id,
      before,
      after: row,
      metadata: body.reason ? { reason: body.reason } : {},
    });
    return this.withAvailable(row);
  }

  /**
   * Ensure a balance row exists for each LeaveType for the (employee, cycle).
   * Idempotent — uses `(employeeId, leaveTypeId, cycleYear)` unique key.
   * Allocated defaults to the LeaveType's `accrualAmount` for `annual` accrual;
   * other accrual types start at 0 and are credited by a (future) cron.
   */
  async ensureBalancesForCycle(
    employeeId: string,
    cycleYear: number,
    organizationId: string,
  ): Promise<void> {
    const types = await this.prisma.db.leaveType.findMany({
      where: { deletedAt: null },
      select: { id: true, accrualType: true, accrualAmount: true },
    });
    if (types.length === 0) return;
    await this.prisma.db.leaveBalance.createMany({
      data: types.map((t) => ({
        organizationId,
        employeeId,
        leaveTypeId: t.id,
        cycleYear,
        allocated: t.accrualType === "annual" ? t.accrualAmount : 0,
      })),
      skipDuplicates: true,
    });
  }

  private withAvailable = (b: {
    allocated: unknown;
    used: unknown;
    pending: unknown;
    carryForward: unknown;
    adjusted: unknown;
  }): Record<string, unknown> => {
    const n = (v: unknown): number => Number(v as number);
    const available = availableBalance({
      allocated: n(b.allocated),
      used: n(b.used),
      pending: n(b.pending),
      carryForward: n(b.carryForward),
      adjusted: n(b.adjusted),
    });
    return { ...b, available };
  };
}
