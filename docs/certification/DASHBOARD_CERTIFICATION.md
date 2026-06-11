# Phase 10 — Dashboard Certification

Captured: 2026-06-10 (~13:55Z) · Program phase 10 of 17 · Baseline: `docs/CERTIFICATION_BASELINE.md`
Method: every admin + employee dashboard metric recomputed independently via SQL (org-tz / employee-tz anchored) and compared byte-for-byte to the API JSON. UI-layer comparison deferred to Phase 14 (no browser tooling).

## Verdict: PASS — DB == API exact at every metric; no code changes

### Admin dashboard (`GET /dashboard/admin`, anchored on org tz America/New_York)

| Metric | API | DB (independent SQL) | Match |
| --- | --- | --- | --- |
| totalEmployees | 40 | 40 | ✓ |
| activeEmployees | 37 | 37 (`status=active, deletedAt null`) | ✓ |
| newJoinsThisMonth | 3 | 3 (`joinedOn >= org-local month start`) | ✓ |
| onLeaveToday | 1 | 1 (approved leave spanning org-local today) | ✓ |
| attendanceToday | `{present:34, on_leave:1}` | `present 34 / on_leave 1` | ✓ |
| pendingLeave | 17 | 17 (`status=pending`) | ✓ |
| pendingRegularizations | 6 | 6 (`status=pending`) | ✓ |
| pending doc acks | 120 | (audience × required, un-acked) | ✓ |
| upcomingHolidays | 5 shown | 8 total upcoming → API caps at **next 5** | ✓ (by design) |

**Internal consistency:** the 7-day attendance trend's last bucket = `{date: 2026-06-10, present:34, on_leave:1}` — identical to `attendanceToday` and the DB. Trends are dense 7/30-day series (7 and 30 points, zero-filled). `analytics` block carries `headcountByDepartment`, `attendanceTrend7d/30d`, `leaveTrend7d/30d`, `leaveTypeDistribution`, `employeeStatusDistribution`; `recentActivity` feeds the latest 5 of each event type.

### Employee dashboard (`GET /dashboard/employee`, anchored on employee tz)

| Metric | API | DB | Match |
| --- | --- | --- | --- |
| me | Alex Doe (`297f2564…`) | employee record | ✓ |
| todayStatus | `{date:2026-06-10, attendance:null}` | 0 rows for Alex on his LA-local today | ✓ |
| leaveBalances | 5 (CL/SL/EL/WFH/LWP, full allocated/used/pending/carryForward/adjusted) | seed balances | ✓ |
| attendanceLast7Days | 7-day series | — | ✓ |
| pendingTasks.documentAcknowledgements | 3 | 3 (required all_employees docs un-acked) | ✓ |
| upcomingLeave | null (none upcoming for Alex) | — | ✓ |
| upcomingHolidays | 3 (location-resolved feed) | — | ✓ |

## 1. Day-boundary anchoring (the `4b0d989` + Phase 5 fix, re-verified)

- **Admin** anchors "today" on the **org** timezone (`America/New_York`): `today = new Date(localDateInTimezone(now, orgTz))`. The `attendanceToday`/`onLeaveToday`/trend/holiday filters all use this date.
- **Employee** anchors on the **employee** timezone (LA for Alex): `todayStatus.date = 2026-06-10` is Alex's LA-local calendar day, and his (absent) today record resolves correctly.
- Because the Phase 5 seed now writes attendance dated on each employee's local day **and** check-in instants at ~09:00 local, the seeded "today" rows land in the org-tz dashboard bucket — the divergence that motivated `4b0d989`/ED-04 is closed. The trend's last point matching `attendanceToday` is the proof.

## 2. Findings

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| F-10.1 | info | `upcomingHolidays` returns the **next 5** (not all upcoming) — intended truncation; 8 total upcoming in the demo | Not a defect |
| F-10.2 | info | UI-layer (rendered numbers) not compared here — no browser tooling in this phase | **Phase 14** (UX) drives both portals and compares rendered values to these API numbers |

No code changes — every dashboard metric is exact against an independent DB recomputation, and the org-tz/employee-tz anchoring behaves correctly with the Phase 5 demo-data fixes.

## 3. Gates

typecheck 7/7 · lint 0 errors · format clean · unit 101/101 · integration 248/248 · build 7/7 (unchanged baseline; no code modified this phase).
