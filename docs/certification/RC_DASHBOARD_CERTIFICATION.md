# RC-1 Inspection — Phase 4: Dashboard Certification

Captured: 2026-06-11 · Org `staffly-demo`. Method: fetch `GET /dashboard/admin`
(as hr@acme.demo) and `GET /dashboard/employee` (as employee@acme.demo), then
recompute **every counter** independently in psql. Rule: any mismatch = FAIL.

> Filename note: the inspection directive names this output
> `DASHBOARD_CERTIFICATION.md`, but that path is the committed v1.0 Phase 10
> report (`54b2ab2`); this RC report uses the `RC_` prefix instead of
> overwriting program history.

## 1. Admin dashboard (`GET /dashboard/admin` → 200)

| Metric | API | DB recompute | Verdict |
| --- | --- | --- | --- |
| totalEmployees | 40 | 40 (`deleted_at IS NULL`) | ✅ |
| activeEmployees | 37 | 37 (`status='active'`; other 3 are `on_leave`) | ✅ |
| onLeaveToday | 1 | 1 (approved leave covering 2026-06-11) | ✅ |
| newJoinsThisMonth | 3 | 3 (`joined_on` in June 2026) | ✅ |
| attendanceToday | present 34 · half_day 0 · absent 0 · on_leave 1 | identical group-by | ✅ |
| pendingApprovals.leave | 17 | 17 | ✅ |
| pendingApprovals.regularization | 6 | 6 | ✅ |
| pendingApprovals.documentAcknowledgements | 120 | 3 required published docs × 40 employees − 0 ack rows = 120 | ✅ |
| publishedAnnouncements | 6 | 6 (8 total: 6 published, 1 scheduled, 1 draft) | ✅ |
| upcomingHolidays[0] | Juneteenth 2026-06-19 | next `holidays` row ≥ today | ✅ |

### Analytics

| Series | API vs DB | Verdict |
| --- | --- | --- |
| attendanceTrend7d | 06-09: 35/2/2/1 · 06-10: 36/1/2/1 (present/half/absent/on_leave) — DB identical | ✅ |
| headcountByDepartment | Engineering 7 · Finance 7 · HR 6 · Design 5 — DB identical | ✅ |
| employeeStatusDistribution | active 37 · on_leave 3 — DB identical | ✅ |
| leaveTrend7d | pending 17 · approved 27 · rejected 9 · cancelled 6 = 59 = DB total (all 59 requests created at today's reseed, so the 7-day window covers the full set) | ✅ |
| recentActivity | 5 entries (query `take: 5`) | ✅ |

## 2. Employee dashboard (`GET /dashboard/employee` → 200, Alex Doe)

| Widget | API | DB recompute | Verdict |
| --- | --- | --- | --- |
| todayStatus | today's record `707b6c08`, check-in 16:00 UTC (09:00 PT) | identical row | ✅ |
| attendanceLast7Days | 7 entries, e.g. 06-05 present 476 min | matches `attendance_records` | ✅ |
| leaveBalances | Sick 10/0/1 · Earned 18/0/0 · WFH 24/0/0 · Unpaid 0 · Casual 12/0/0 | `leave_balances` identical; the pending 1.00 = seeded pending request | ✅ |
| pendingTasks | regularizations 0 · documentAcknowledgements 3 · announcementAcks 0 | 3 required docs, none acked by this employee — consistent with admin-side 120 (= 3 × 40) | ✅ |
| recentDocuments | 5 | widget cap `take: 5` (`dashboard.service.ts:500`) | ✅ |
| announcements | 3 | widget cap `take: 3` (`dashboard.service.ts:467`); all 6 published target `all_employees` — the 3 shown are the most recent; scoping neither over- nor under-includes | ✅ |
| upcomingHolidays | Juneteenth 06-19 | same as admin | ✅ |
| upcomingLeave | null | no approved future leave for this employee | ✅ |

## 3. Observations (non-blocking)

- **OBS-1 — `absent: 0` semantics.** `attendanceToday` mirrors existing
  rows; 5 active employees with no row yet today appear in no bucket
  rather than as "absent". Defensible mid-day behavior (a no-show is only
  "absent" after the day closes); noted so demo presenters aren't
  surprised that buckets don't sum to 40.
- **OBS-2 — weekends render as "absent".** `attendanceLast7Days` shows
  Sat/Sun (06-06, 06-07) as `absent`/0 min because the seed writes no
  weekend rows and the series fills gaps as absent, despite a `weekoff`
  status existing in the enum. Cosmetic; could mislabel in a demo
  ("why was Alex absent Saturday?").

## 4. Verdict

**PASS — zero counter mismatches.** All admin metrics, all analytics
series, and all employee widgets reconcile exactly against independent
psql recomputation. Two cosmetic observations carried to
`docs/OPEN_BLOCKERS.md` (P4/cosmetic, demo-narration only).
