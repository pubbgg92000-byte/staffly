/**
 * Dashboard response shapes — mirror apps/api/src/dashboard/dashboard.service.ts.
 */

export interface AdminDashboardMetrics {
  totalEmployees: number;
  activeEmployees: number;
  onLeaveToday: number;
  newJoinsThisMonth: number;
  attendanceToday: {
    present: number;
    half_day: number;
    absent: number;
    on_leave: number;
    holiday: number;
    weekoff: number;
  };
  pendingApprovals: {
    leave: number;
    regularization: number;
    documentAcknowledgements: number;
  };
  publishedAnnouncements: number;
}

export interface UpcomingHoliday {
  id: string;
  date: string;
  name: string;
  type: "public" | "restricted" | "optional" | "company";
  calendarName: string;
}

export interface AdminDashboardResponse {
  generatedAt: string;
  metrics: AdminDashboardMetrics;
  upcomingHolidays: UpcomingHoliday[];
  analytics: {
    headcountByDepartment: {
      departmentId: string | null;
      departmentName: string;
      count: number;
    }[];
    attendanceTrend7d: {
      date: string;
      counts: Record<string, number>;
    }[];
    attendanceTrend30d: {
      date: string;
      counts: Record<string, number>;
    }[];
    leaveTrend7d: Record<string, number>;
    leaveTrend30d: Record<string, number>;
    leaveTypeDistribution: {
      leaveTypeId: string;
      code: string | null;
      name: string | null;
      color: string | null;
      count: number;
    }[];
    employeeStatusDistribution: { status: string; count: number }[];
  };
  recentActivity: {
    newEmployees: {
      id: string;
      displayName: string;
      employeeCode: string;
      joinedOn: string | null;
      createdAt: string;
    }[];
    leaveApprovals: unknown[];
    regularizations: unknown[];
    documentAcknowledgements: unknown[];
    announcementsPublished: {
      id: string;
      title: string;
      publishedAt: string | null;
      priority: "low" | "normal" | "high";
      requiresAcknowledgment: boolean;
    }[];
  };
}

export interface EmployeeDashboardResponse {
  generatedAt: string;
  me: {
    employeeId: string;
    displayName: string;
  };
  todayStatus: {
    date: string;
    attendance: {
      checkInAt: string | null;
      checkOutAt: string | null;
      status: string;
      workedMinutes: number | null;
    } | null;
  };
  attendanceLast7Days: {
    date: string;
    status: string;
    workedMinutes: number;
  }[];
  leaveBalances: {
    cycleYear: number;
    leaveType: {
      id: string;
      code: string;
      name: string;
      color: string | null;
    };
    allocated: string | number;
    used: string | number;
    pending: string | number;
    carryForward: string | number;
    adjusted: string | number;
  }[];
  upcomingLeave: {
    id: string;
    startDate: string;
    endDate: string;
    units: string | number;
    leaveType: { id: string; code: string; name: string };
  } | null;
  pendingTasks: {
    regularizations: number;
    documentAcknowledgements: number;
    announcementAcknowledgements: number;
  };
  announcements: {
    id: string;
    title: string;
    publishedAt: string | null;
    priority: "low" | "normal" | "high";
    requiresAcknowledgment: boolean;
    pinned: boolean;
  }[];
  upcomingHolidays: UpcomingHoliday[];
  recentDocuments: {
    id: string;
    title: string;
    publishedAt: string | null;
    isRequired: boolean;
    category: { id: string; name: string; color: string };
    acknowledgements: { acknowledgedAt: string }[];
  }[];
  expiringDocuments: {
    id: string;
    title: string;
    expiresAt: string | null;
    category: { id: string; name: string };
  }[];
}
