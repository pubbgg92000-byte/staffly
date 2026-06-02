/**
 * Default leave types materialized into every new organization at signup time.
 * Edited via `/leave/types` once an admin signs in.
 */
export type LeaveAccrualTypeT = "annual" | "monthly" | "quarterly" | "none";

export interface DefaultLeaveTypeSeed {
  name: string;
  code: string;
  color: string;
  accrualType: LeaveAccrualTypeT;
  accrualAmount: number;
  maxBalance: number | null;
  carryForwardMax: number | null;
  isPaid: boolean;
}

export const DEFAULT_LEAVE_TYPES: readonly DefaultLeaveTypeSeed[] =
  Object.freeze([
    {
      name: "Casual Leave",
      code: "CL",
      color: "#0EA5E9",
      accrualType: "annual",
      accrualAmount: 12,
      maxBalance: 24,
      carryForwardMax: 6,
      isPaid: true,
    },
    {
      name: "Sick Leave",
      code: "SL",
      color: "#EF4444",
      accrualType: "annual",
      accrualAmount: 10,
      maxBalance: 20,
      carryForwardMax: 0,
      isPaid: true,
    },
    {
      name: "Earned Leave",
      code: "EL",
      color: "#10B981",
      accrualType: "annual",
      accrualAmount: 18,
      maxBalance: 36,
      carryForwardMax: 12,
      isPaid: true,
    },
    {
      name: "Work From Home",
      code: "WFH",
      color: "#8B5CF6",
      accrualType: "annual",
      accrualAmount: 24,
      maxBalance: 48,
      carryForwardMax: 0,
      isPaid: true,
    },
    {
      name: "Loss Of Pay",
      code: "LOP",
      color: "#94A3B8",
      accrualType: "none",
      accrualAmount: 0,
      maxBalance: null,
      carryForwardMax: null,
      isPaid: false,
    },
  ] as const);
