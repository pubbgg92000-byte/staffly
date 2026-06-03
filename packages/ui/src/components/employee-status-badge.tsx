import type { ReactNode } from "react";
import { StatusBadge, type StatusTone } from "./status-badge";

type EmployeeStatus =
  | "invited"
  | "active"
  | "on_leave"
  | "suspended"
  | "offboarded";

const TONE: Record<EmployeeStatus, StatusTone> = {
  invited: "muted",
  active: "success",
  on_leave: "info",
  suspended: "warning",
  offboarded: "destructive",
};

const LABEL: Record<EmployeeStatus, string> = {
  invited: "Invited",
  active: "Active",
  on_leave: "On Leave",
  suspended: "Suspended",
  offboarded: "Offboarded",
};

export function EmployeeStatusBadge({ status }: { status: string }): ReactNode {
  const tone = TONE[status as EmployeeStatus] ?? "muted";
  const label = LABEL[status as EmployeeStatus] ?? status;
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
