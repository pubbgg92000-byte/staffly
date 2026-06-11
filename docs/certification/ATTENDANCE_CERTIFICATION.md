# Phase 5 — Attendance Certification (highest-priority module)

Captured: 2026-06-10 (~13:30Z) · Program phase 5 of 17 · Baseline: `docs/CERTIFICATION_BASELINE.md`
Method: live check-in/out flows via the API; DB↔API↔dashboard consistency; demo-seed data-quality fixes (timezone realism, leave reconciliation, org-tz anchoring) implemented, re-seeded, and verified by a new `db:verify:demo` script + frozen-clock unit tests across IST/PST/EST/London.

## Verdict: PASS after gate fixes (3 demo-data defects ED-01/02/04 fixed & verified; ED-03 documents → Phase 7)

| Capability | Result | Evidence |
| --- | --- | --- |
| Check-in | **PASS** — `present`, stores actual instant, `isLate` computed vs policy | §1 |
| Check-out | **PASS** — computes `workedMinutes`; `< halfDayThreshold` → `half_day` | §1 |
| Duplicate check-in | **PASS** — second call → 400 `already_checked_in` | §1 |
| Duplicate / no-checkin check-out | **PASS** — → 400 | §1 |
| Worked hours / half-day | **PASS** — `workedMinutes = round((out-in)/60k)`; threshold-driven status | §1 |
| Late detection | **PASS** — `isLate` from `localMinutesInTimezone` vs `dayStart+grace` | §1 |
| Timezone correctness (live) | **PASS** — employee in LA: check-in dated on LA-local day, instant reads 06:27 LA / 09:27 NY | §1 |
| DB ↔ API ↔ dashboard | **PASS** — `attendanceToday` API `{present:34,half_day:1,on_leave:1}` == DB exactly; `onLeaveToday:1` matches approved leave spanning today | §2 |
| **Seed: local check-in times** (ED-01) | **FIXED** — all 5 zones now 09:00–09:52 **local** (was LA 02:00, Kolkata 14:30) | §3 |
| **Seed: leave/attendance contradictions** (ED-02) | **FIXED** — 0 present-during-approved-leave (was 39); 0 orphan on_leave (was 119) | §3 |
| **Seed: org-tz TODAY anchoring** (ED-04) | **FIXED** — `TODAY` now org-local date; today populated (35 records) | §3 |
| Seed: document binaries (ED-03) | **DEFERRED → Phase 7** — verify script flags 20/20 storageKeys missing in MinIO | §3 |

## 1. Live attendance flow (employee = Alex Doe, location San Francisco / America/Los_Angeles)

```
POST /attendance/check-in   → status=present, checkInAt=2026-06-10T13:27:55Z, isLate=false, date=2026-06-10
POST /attendance/check-in   → 400  (already_checked_in)
POST /attendance/check-out  → status=half_day, workedMinutes=0   (instant out → below 4h half-day threshold)
POST /attendance/check-out  → 400  (no open record)
```
Stored check-in instant in local time: **06:27 LA / 09:27 NY** — the real wall-clock moment, dated on the employee's LA-local calendar day (confirms the `4b0d989` employee-tz day-boundary anchoring). Overtime/absent/weekoff statuses exist in the enum and are produced by the seed; the live API only sets present/half_day on the self path (by design). Punching another employee requires `attendance.approve` (resolveTargetEmployee).

## 2. DB ↔ API ↔ dashboard consistency

`GET /dashboard/admin` `attendanceToday` = `{present:34, half_day:1, absent:0, on_leave:1, holiday:0, weekoff:0}`; independent DB aggregation over `attendance_date = org-local today` returns the identical `present 34 / half_day 1 / on_leave 1`. `onLeaveToday = 1` equals the count of approved leave requests spanning today — and the single `on_leave` attendance row belongs to that same employee, demonstrating the leave↔attendance reconciliation end-to-end. Manager scope on attendance reads was certified in Phase 3 (team list + by-id 404).

## 3. Demo-data quality fixes (the "Phase 3 demo data quality" work lands here)

Root cause of all three: the seed generated times in **UTC** and generated attendance & leave independently.

**Fix — new pure helper** `localWallTimeToUtc(tz, dateOnly, hh, mm)` in `apps/api/src/attendance/local-date.ts` (plus `tzOffsetMinutes`): the inverse of `localDateInTimezone`/`localMinutesInTimezone`, computing the UTC instant for a wall-clock time in any IANA zone via a two-pass offset correction (DST-safe). Unit-tested with **14 frozen-clock cases** across Asia/Kolkata, America/Los_Angeles, America/New_York, Europe/London including DST spring-forward and absolute-instant assertions (`test/attendance/local-wall-time.spec.ts`).

**Seed changes** (`apps/api/prisma/seed-demo.ts`):
1. **ED-01 local check-in times**: each employee carries their location `tz`; check-in is `localWallTimeToUtc(emp.tz, day, 9, lateJitter)` (~09:00 local) instead of `atHour(day, 9)` (09:00 UTC). The dead `atHour` helper removed.
2. **ED-02 leave/attendance reconciliation**: leave requests are now generated **before** attendance, kept **non-overlapping** per employee (respecting the real API's overlap rule — leave count 60→59), and the set of **approved-leave dates** per employee drives attendance: a day on approved leave is always recorded `on_leave`, never present/half_day; conversely `on_leave` rows are only produced from approved leave. (Random standalone `on_leave`/`absent` rolls removed; weekday non-leave days roll present/half_day/absent.)
3. **ED-04 org-tz TODAY**: `TODAY` is anchored to `localDateInTimezone(now, ORG_TZ)` (America/New_York) instead of `dateOnly(new Date())` (UTC), so the seeded "today" matches the org-tz-anchored admin dashboard even for evening reseeds.

**New verification script** `apps/api/prisma/verify-demo.ts` (`pnpm --filter @staffly/api db:verify:demo`) — read-only assertions, exits non-zero on failure so it can gate `reset-demo.sh`. Post-reseed result:

```
✓ no present/half_day during approved leave — 0 contradictions   (was 39)
✓ no on_leave attendance without approved request — 0 orphan rows (was 119)
✓ check-in local times in [07:30,11:00] — 0/2257 outside window  (was: LA 02:00, Kolkata 14:30)
✓ today's attendance populated (org-tz) — 35 records on 2026-06-10
✓ leave balances reconcile with requests — 0 mismatched rows
✗ document binaries present in storage — 20/20 storageKeys missing  → Phase 7 (ED-03)
```

Check-in local-time spread per zone after the fix: Chicago 09:00–09:23 · LA 09:00–09:07 · NY 09:00–09:22 · Kolkata 09:00 · London 09:00–09:52.

## 4. Findings

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| ED-01 | P2 (demo quality) | Seed check-ins at 09:00 **UTC** for all locations → wrong local times | **FIXED** — per-tz `localWallTimeToUtc`; verified 0/2257 outside 07:30–11:00 |
| ED-02 | P2 (demo quality) | Attendance & leave generated independently → 39 present-during-leave, 119 orphan on_leave | **FIXED** — approved-leave-first, non-overlapping, attendance derived from leave |
| ED-04 | P3 (demo quality) | Seed `TODAY` UTC-anchored vs org-tz dashboard | **FIXED** — org-tz anchored |
| ED-03 | P2 (demo quality) | Seeded documents have no MinIO binaries (verify: 20/20 missing) | **Phase 7** (next) |
| F-5.1 | P3 | Live check-out has no max-hours cap — `workedMinutes` is raw `(out-in)` (baseline note); not exploitable, but an unrealistic 18h day is possible | Note for Phase 11/seed realism; seed caps durations at 7.5–9h |

## 5. Gates & cleanup

Gates: typecheck 7/7 · lint 0 errors · format clean · **unit 97/97** (+14 tz) · integration 248/248 · build 7/7. Demo org re-seeded deterministically (same pinned id, 40 employees, 2377 attendance, 59 leave, 160 balances). Live check-in/out test record restored to the seed's in-progress state. Manager `leave.reject` (team) and hr `attendance.policy.write` re-applied by the reseed from `role-permissions.json`.
