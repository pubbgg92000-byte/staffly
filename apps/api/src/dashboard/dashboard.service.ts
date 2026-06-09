import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { currentOrganizationId } from "../tenant/tenant-context";
import { resolveEmployeeTimezone } from "../common/timezone";
import { localDateInTimezone } from "../attendance/local-date";
import {
  daysAgoWindow,
  denseDailySeries,
  startOfDayUTC,
  startOfMonthUTC,
} from "./date-windows";

function requireOrg(): string {
  const id = currentOrganizationId();
  if (!id) throw new Error("no active tenant context");
  return id;
}

/**
 * Dashboard aggregation service.
 *
 * Both endpoints fan out across the same Prisma client via
 * `Promise.all(...)`. Because the tenant extension auto-scopes every query
 * to the active org, we never thread `organizationId` through filters
 * manually — that keeps the queries readable and audit-able.
 *
 * Why Promise.all and not $transaction:
 *   - Every sub-query is a read; we don't need write atomicity.
 *   - Prisma fires concurrent reads on a single pool connection per query,
 *     so the wall-clock cost is bound by the slowest query, not the sum.
 *   - $transaction would block on a single connection and serialize the
 *     reads — strictly slower for this workload.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Admin ──────────────────────────────────────────────────────────

  async admin(): Promise<unknown> {
    const orgId = requireOrg();
    const now = new Date();
    const today = startOfDayUTC(now);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const monthStart = startOfMonthUTC(now);
    const window7 = daysAgoWindow(7, now);
    const window30 = daysAgoWindow(30, now);

    const [
      totalEmployees,
      activeEmployees,
      newJoinsThisMonth,
      onLeaveToday,
      attendanceTodayGroups,
      pendingLeave,
      pendingRegularizations,
      pendingDocAcks,
      publishedAnnouncements,
      upcomingHolidays,
      headcountByDept,
      attendanceTrend7,
      attendanceTrend30,
      leaveTrend7,
      leaveTrend30,
      leaveTypeDistribution,
      employeeStatusDist,
      recentEmployees,
      recentLeaveApprovals,
      recentRegularizationDecisions,
      recentDocAcks,
      recentAnnouncementsPublished,
    ] = await Promise.all([
      this.prisma.db.employee.count({ where: { deletedAt: null } }),
      this.prisma.db.employee.count({
        where: { deletedAt: null, status: "active" },
      }),
      this.prisma.db.employee.count({
        where: { deletedAt: null, joinedOn: { gte: monthStart } },
      }),
      this.prisma.db.leaveRequest.count({
        where: {
          status: "approved",
          startDate: { lte: today },
          endDate: { gte: today },
        },
      }),
      this.prisma.db.attendanceRecord.groupBy({
        by: ["status"],
        where: { attendanceDate: today },
        _count: { _all: true },
      }),
      this.prisma.db.leaveRequest.count({ where: { status: "pending" } }),
      this.prisma.db.attendanceRegularization.count({
        where: { status: "pending" },
      }),
      this.countPendingRequiredDocAcks(orgId),
      this.prisma.db.announcement.count({
        where: { status: "published", deletedAt: null },
      }),
      this.prisma.db.holiday.findMany({
        where: { date: { gte: today } },
        orderBy: { date: "asc" },
        take: 5,
        select: {
          id: true,
          date: true,
          name: true,
          type: true,
          calendar: { select: { id: true, name: true } },
        },
      }),
      this.prisma.db.employee.groupBy({
        by: ["departmentId"],
        where: { deletedAt: null, status: { not: "offboarded" } },
        _count: { _all: true },
      }),
      this.prisma.db.attendanceRecord.groupBy({
        by: ["attendanceDate", "status"],
        where: { attendanceDate: { gte: window7.from, lte: window7.to } },
        _count: { _all: true },
      }),
      this.prisma.db.attendanceRecord.groupBy({
        by: ["attendanceDate", "status"],
        where: { attendanceDate: { gte: window30.from, lte: window30.to } },
        _count: { _all: true },
      }),
      this.prisma.db.leaveRequest.groupBy({
        by: ["status"],
        where: { createdAt: { gte: window7.from } },
        _count: { _all: true },
      }),
      this.prisma.db.leaveRequest.groupBy({
        by: ["status"],
        where: { createdAt: { gte: window30.from } },
        _count: { _all: true },
      }),
      this.prisma.db.leaveRequest.groupBy({
        by: ["leaveTypeId"],
        where: { createdAt: { gte: window30.from } },
        _count: { _all: true },
      }),
      this.prisma.db.employee.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.db.employee.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          displayName: true,
          employeeCode: true,
          joinedOn: true,
          createdAt: true,
        },
      }),
      this.prisma.db.leaveRequest.findMany({
        where: { status: "approved" },
        orderBy: { decidedAt: "desc" },
        take: 5,
        select: {
          id: true,
          decidedAt: true,
          startDate: true,
          endDate: true,
          employee: {
            select: { id: true, displayName: true, employeeCode: true },
          },
          leaveType: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.db.attendanceRegularization.findMany({
        where: { status: { in: ["approved", "rejected"] } },
        orderBy: { decidedAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          decidedAt: true,
          attendanceDate: true,
          employee: {
            select: { id: true, displayName: true, employeeCode: true },
          },
        },
      }),
      this.prisma.db.documentAcknowledgement.findMany({
        orderBy: { acknowledgedAt: "desc" },
        take: 5,
        select: {
          id: true,
          acknowledgedAt: true,
          versionNo: true,
          document: { select: { id: true, title: true } },
          employee: {
            select: { id: true, displayName: true, employeeCode: true },
          },
        },
      }),
      this.prisma.db.announcement.findMany({
        where: { status: "published", deletedAt: null },
        orderBy: { publishedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          publishedAt: true,
          priority: true,
          requiresAcknowledgment: true,
        },
      }),
    ]);

    // Resolve department names referenced by the headcount group, in one
    // round-trip rather than per-row.
    const deptIds = headcountByDept
      .map((g) => g.departmentId)
      .filter((id): id is string => id !== null);
    const departments = deptIds.length
      ? await this.prisma.db.department.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, name: true },
        })
      : [];
    const deptNameById = new Map(departments.map((d) => [d.id, d.name]));

    // Same trick for the leave-type distribution.
    const leaveTypeIds = leaveTypeDistribution.map((g) => g.leaveTypeId);
    const leaveTypes = leaveTypeIds.length
      ? await this.prisma.db.leaveType.findMany({
          where: { id: { in: leaveTypeIds } },
          select: { id: true, code: true, name: true, color: true },
        })
      : [];
    const leaveTypeById = new Map(leaveTypes.map((lt) => [lt.id, lt]));

    return {
      generatedAt: now.toISOString(),
      metrics: {
        totalEmployees,
        activeEmployees,
        onLeaveToday,
        newJoinsThisMonth,
        attendanceToday: this.bucketAttendance(attendanceTodayGroups),
        pendingApprovals: {
          leave: pendingLeave,
          regularization: pendingRegularizations,
          documentAcknowledgements: pendingDocAcks,
        },
        publishedAnnouncements,
      },
      upcomingHolidays: upcomingHolidays.map((h) => ({
        id: h.id,
        date: h.date.toISOString().slice(0, 10),
        name: h.name,
        type: h.type,
        calendarName: h.calendar.name,
      })),
      analytics: {
        headcountByDepartment: headcountByDept
          .map((g) => ({
            departmentId: g.departmentId,
            departmentName: g.departmentId
              ? (deptNameById.get(g.departmentId) ?? "Unknown")
              : "Unassigned",
            count: g._count._all,
          }))
          .sort((a, b) => b.count - a.count),
        attendanceTrend7d: this.buildAttendanceTrend(attendanceTrend7, window7),
        attendanceTrend30d: this.buildAttendanceTrend(
          attendanceTrend30,
          window30,
        ),
        leaveTrend7d: this.bucketLeaveStatus(leaveTrend7),
        leaveTrend30d: this.bucketLeaveStatus(leaveTrend30),
        leaveTypeDistribution: leaveTypeDistribution
          .map((g) => ({
            leaveTypeId: g.leaveTypeId,
            code: leaveTypeById.get(g.leaveTypeId)?.code ?? null,
            name: leaveTypeById.get(g.leaveTypeId)?.name ?? null,
            color: leaveTypeById.get(g.leaveTypeId)?.color ?? null,
            count: g._count._all,
          }))
          .sort((a, b) => b.count - a.count),
        employeeStatusDistribution: employeeStatusDist.map((g) => ({
          status: g.status,
          count: g._count._all,
        })),
      },
      recentActivity: {
        newEmployees: recentEmployees,
        leaveApprovals: recentLeaveApprovals,
        regularizations: recentRegularizationDecisions,
        documentAcknowledgements: recentDocAcks,
        announcementsPublished: recentAnnouncementsPublished,
      },
    };
  }

  // ─── Employee ───────────────────────────────────────────────────────

  async employee(userId: string): Promise<unknown> {
    const me = await this.prisma.db.employee.findFirst({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        organizationId: true,
        departmentId: true,
        designationId: true,
        locationId: true,
        employmentType: true,
        timezoneOverride: true,
        location: { select: { timezone: true } },
        organization: { select: { timezone: true } },
      },
    });
    if (!me) throw new NotFoundException({ code: "employee.not_found" });

    const now = new Date();
    const today = startOfDayUTC(now);
    // Attendance rows are dated by the EMPLOYEE'S local calendar day (see
    // AttendanceService.checkIn). When the employee's tz differs from UTC,
    // `startOfDayUTC(now)` and the local date diverge — that mismatch was
    // the v0.23.1 bug where the dashboard couldn't find an active session
    // it had just written. Use the local date for the attendance lookup
    // and the displayed `todayStatus.date`; keep UTC for trend windows and
    // forward-looking date filters (leave/holidays), which are intentionally
    // tz-agnostic per docs/02 § 1.2.
    const employeeTz = resolveEmployeeTimezone(me);
    const localToday = new Date(localDateInTimezone(now, employeeTz));
    const window7 = daysAgoWindow(7, now);
    const cycleYear = now.getUTCFullYear();

    // Same Promise.all pattern. Audience filter for /me feed identical
    // shape to the one in documents/announcements modules.
    const audienceMatch: Prisma.DocumentAudienceWhereInput = {
      OR: [
        { audienceType: "all_employees" },
        ...(me.departmentId
          ? [
              {
                audienceType: "department" as const,
                departmentId: me.departmentId,
              },
            ]
          : []),
        ...(me.designationId
          ? [
              {
                audienceType: "designation" as const,
                designationId: me.designationId,
              },
            ]
          : []),
        ...(me.locationId
          ? [
              {
                audienceType: "location" as const,
                locationId: me.locationId,
              },
            ]
          : []),
        {
          audienceType: "employment_type",
          employmentType: me.employmentType,
        },
        { audienceType: "specific_employees", employeeId: me.id },
      ],
    };
    const annAudienceMatch: Prisma.AnnouncementAudienceWhereInput = {
      OR: audienceMatch.OR as Prisma.AnnouncementAudienceWhereInput[],
    };

    const expiringSoon = new Date(today);
    expiringSoon.setUTCDate(expiringSoon.getUTCDate() + 30);

    const [
      todayRecord,
      leaveBalances,
      upcomingLeave,
      pendingRegs,
      pendingDocAcks,
      pendingAnnouncementAcks,
      recentAnnouncements,
      upcomingHolidays,
      recentDocuments,
      expiringDocuments,
      last7Attendance,
    ] = await Promise.all([
      this.prisma.db.attendanceRecord.findFirst({
        where: { employeeId: me.id, attendanceDate: localToday },
      }),
      this.prisma.db.leaveBalance.findMany({
        where: { employeeId: me.id, cycleYear },
        include: {
          leaveType: {
            select: { id: true, code: true, name: true, color: true },
          },
        },
      }),
      this.prisma.db.leaveRequest.findFirst({
        where: {
          employeeId: me.id,
          status: "approved",
          startDate: { gte: today },
        },
        orderBy: { startDate: "asc" },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          units: true,
          leaveType: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.db.attendanceRegularization.count({
        where: { employeeId: me.id, status: "pending" },
      }),
      // Pending: required, published, in-audience (or personal-self),
      // and not yet acknowledged.
      this.prisma.db.document.count({
        where: {
          deletedAt: null,
          archivedAt: null,
          publishedAt: { not: null },
          isRequired: true,
          acknowledgements: { none: { employeeId: me.id } },
          OR: [
            { isPersonal: true, subjectEmployeeId: me.id },
            {
              isPersonal: false,
              audiences: { some: audienceMatch },
            },
          ],
        },
      }),
      this.prisma.db.announcement.count({
        where: {
          deletedAt: null,
          status: "published",
          requiresAcknowledgment: true,
          acknowledgements: { none: { employeeId: me.id } },
          audiences: { some: annAudienceMatch },
        },
      }),
      this.prisma.db.announcement.findMany({
        where: {
          deletedAt: null,
          status: "published",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          audiences: { some: annAudienceMatch },
        },
        orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
        take: 3,
        select: {
          id: true,
          title: true,
          publishedAt: true,
          priority: true,
          requiresAcknowledgment: true,
          pinned: true,
        },
      }),
      this.prisma.db.holiday.findMany({
        where: { date: { gte: today } },
        orderBy: { date: "asc" },
        take: 3,
        select: {
          id: true,
          date: true,
          name: true,
          type: true,
          calendar: { select: { id: true, name: true } },
        },
      }),
      this.prisma.db.document.findMany({
        where: {
          deletedAt: null,
          archivedAt: null,
          publishedAt: { not: null },
          OR: [
            { isPersonal: true, subjectEmployeeId: me.id },
            { isPersonal: false, audiences: { some: audienceMatch } },
          ],
        },
        orderBy: { publishedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          publishedAt: true,
          isRequired: true,
          category: { select: { id: true, name: true, color: true } },
          acknowledgements: {
            where: { employeeId: me.id },
            select: { acknowledgedAt: true },
          },
        },
      }),
      this.prisma.db.document.findMany({
        where: {
          deletedAt: null,
          archivedAt: null,
          publishedAt: { not: null },
          expiresAt: { gte: now, lte: expiringSoon },
          OR: [
            { isPersonal: true, subjectEmployeeId: me.id },
            { isPersonal: false, audiences: { some: audienceMatch } },
          ],
        },
        orderBy: { expiresAt: "asc" },
        take: 5,
        select: {
          id: true,
          title: true,
          expiresAt: true,
          category: { select: { id: true, name: true } },
        },
      }),
      this.prisma.db.attendanceRecord.findMany({
        where: {
          employeeId: me.id,
          attendanceDate: { gte: window7.from, lte: window7.to },
        },
        select: {
          attendanceDate: true,
          status: true,
          workedMinutes: true,
          checkInAt: true,
          checkOutAt: true,
        },
        orderBy: { attendanceDate: "asc" },
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      me: {
        employeeId: me.id,
        displayName: me.displayName,
      },
      todayStatus: {
        date: localToday.toISOString().slice(0, 10),
        attendance: todayRecord,
      },
      attendanceLast7Days: this.buildEmployeeAttendanceSeries(
        last7Attendance,
        window7,
      ),
      leaveBalances: leaveBalances.map((b) => ({
        cycleYear: b.cycleYear,
        leaveType: b.leaveType,
        allocated: b.allocated,
        used: b.used,
        pending: b.pending,
        carryForward: b.carryForward,
        adjusted: b.adjusted,
      })),
      upcomingLeave,
      pendingTasks: {
        regularizations: pendingRegs,
        documentAcknowledgements: pendingDocAcks,
        announcementAcknowledgements: pendingAnnouncementAcks,
      },
      announcements: recentAnnouncements,
      upcomingHolidays: upcomingHolidays.map((h) => ({
        id: h.id,
        date: h.date.toISOString().slice(0, 10),
        name: h.name,
        type: h.type,
        calendarName: h.calendar.name,
      })),
      recentDocuments,
      expiringDocuments,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  /**
   * Count distinct (document, employee) pairs that are required but
   * un-acked. Implemented as a single SQL aggregation rather than fanning
   * out per-document, so it scales with `O(docs × audience-size)` rather
   * than `O(docs × audience-size × round-trips)`.
   *
   * The query: for every required+published+non-archived document, count
   * employees in the resolved audience minus those that have already
   * acked. Personal docs are 1-row-each (subjectEmployee). Distributed
   * docs evaluate the audience via the same OR-shape used by /me feed.
   *
   * We accept a tolerable over-count: the SQL counts audience members per
   * doc rather than dedup'd unique employees, mirroring how the doc
   * compliance dashboard already presents this.
   */
  private async countPendingRequiredDocAcks(_orgId: string): Promise<number> {
    // A simple distinct count over the resolved (doc, employee) pairs.
    // For the dashboard headline we surface the total pending across all
    // required docs; the per-doc breakdown lives on the docs module.
    const docs = await this.prisma.db.document.findMany({
      where: {
        deletedAt: null,
        archivedAt: null,
        publishedAt: { not: null },
        isRequired: true,
      },
      select: {
        id: true,
        isPersonal: true,
        subjectEmployeeId: true,
        audiences: true,
      },
    });
    if (docs.length === 0) return 0;

    // Resolve each doc's audience in parallel, then subtract acks. Bound
    // by the number of required documents — typically a handful per org.
    const counts = await Promise.all(
      docs.map(async (d) => {
        const audienceIds: string[] = d.isPersonal
          ? d.subjectEmployeeId
            ? [d.subjectEmployeeId]
            : []
          : await this.resolveAudience(d.audiences);
        if (audienceIds.length === 0) return 0;
        const acked = await this.prisma.db.documentAcknowledgement.count({
          where: { documentId: d.id, employeeId: { in: audienceIds } },
        });
        return Math.max(0, audienceIds.length - acked);
      }),
    );
    return counts.reduce((a, b) => a + b, 0);
  }

  private async resolveAudience(
    audiences: {
      audienceType: string;
      departmentId: string | null;
      designationId: string | null;
      locationId: string | null;
      employmentType: string | null;
      employeeId: string | null;
    }[],
  ): Promise<string[]> {
    if (audiences.length === 0) return [];
    const base: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      status: { not: "offboarded" },
    };
    if (audiences.some((a) => a.audienceType === "all_employees")) {
      const all = await this.prisma.db.employee.findMany({
        where: base,
        select: { id: true },
      });
      return all.map((e) => e.id);
    }
    const departmentIds = audiences
      .filter((a) => a.audienceType === "department")
      .map((a) => a.departmentId)
      .filter((id): id is string => !!id);
    const designationIds = audiences
      .filter((a) => a.audienceType === "designation")
      .map((a) => a.designationId)
      .filter((id): id is string => !!id);
    const locationIds = audiences
      .filter((a) => a.audienceType === "location")
      .map((a) => a.locationId)
      .filter((id): id is string => !!id);
    const employmentTypes = audiences
      .filter((a) => a.audienceType === "employment_type")
      .map((a) => a.employmentType)
      .filter((t): t is string => !!t) as (
      | "full_time"
      | "part_time"
      | "intern"
      | "contractor"
      | "consultant"
    )[];
    const employeeIds = audiences
      .filter((a) => a.audienceType === "specific_employees")
      .map((a) => a.employeeId)
      .filter((id): id is string => !!id);
    const or: Prisma.EmployeeWhereInput[] = [];
    if (departmentIds.length) or.push({ departmentId: { in: departmentIds } });
    if (designationIds.length)
      or.push({ designationId: { in: designationIds } });
    if (locationIds.length) or.push({ locationId: { in: locationIds } });
    if (employmentTypes.length)
      or.push({ employmentType: { in: employmentTypes } });
    if (employeeIds.length) or.push({ id: { in: employeeIds } });
    if (or.length === 0) return [];
    const matches = await this.prisma.db.employee.findMany({
      where: { ...base, OR: or },
      select: { id: true },
    });
    return matches.map((e) => e.id);
  }

  private bucketAttendance(
    groups: { status: string; _count: { _all: number } }[],
  ): Record<string, number> {
    const out: Record<string, number> = {
      present: 0,
      half_day: 0,
      absent: 0,
      on_leave: 0,
      holiday: 0,
      weekoff: 0,
    };
    for (const g of groups) out[g.status] = g._count._all;
    return out;
  }

  private bucketLeaveStatus(
    groups: { status: string; _count: { _all: number } }[],
  ): Record<string, number> {
    const out: Record<string, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const g of groups) out[g.status] = g._count._all;
    return out;
  }

  private buildAttendanceTrend(
    groups: {
      attendanceDate: Date;
      status: string;
      _count: { _all: number };
    }[],
    window: { from: Date; to: Date },
  ): { date: string; counts: Record<string, number> }[] {
    const byDate = new Map<string, Record<string, number>>();
    for (const g of groups) {
      const key = g.attendanceDate.toISOString().slice(0, 10);
      const bucket =
        byDate.get(key) ??
        ({
          present: 0,
          half_day: 0,
          absent: 0,
          on_leave: 0,
          holiday: 0,
          weekoff: 0,
        } as Record<string, number>);
      bucket[g.status] = g._count._all;
      byDate.set(key, bucket);
    }
    return denseDailySeries(
      Array.from(byDate.entries()).map(([k, v]) => ({
        date: new Date(`${k}T00:00:00.000Z`),
        value: v,
      })),
      window,
      {
        present: 0,
        half_day: 0,
        absent: 0,
        on_leave: 0,
        holiday: 0,
        weekoff: 0,
      },
    ).map((d) => ({ date: d.date, counts: d.value }));
  }

  private buildEmployeeAttendanceSeries(
    rows: {
      attendanceDate: Date;
      status: string;
      workedMinutes: number | null;
    }[],
    window: { from: Date; to: Date },
  ): { date: string; status: string | null; workedMinutes: number }[] {
    const byDate = new Map<string, { status: string; workedMinutes: number }>();
    for (const r of rows) {
      byDate.set(r.attendanceDate.toISOString().slice(0, 10), {
        status: r.status,
        workedMinutes: r.workedMinutes ?? 0,
      });
    }
    return denseDailySeries(
      Array.from(byDate.entries()).map(([k, v]) => ({
        date: new Date(`${k}T00:00:00.000Z`),
        value: v,
      })),
      window,
      { status: "absent", workedMinutes: 0 },
    ).map((d) => ({
      date: d.date,
      status: d.value.status,
      workedMinutes: d.value.workedMinutes,
    }));
  }
}
