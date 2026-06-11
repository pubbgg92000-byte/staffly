# RC-1 Inspection — Phase 5: Attendance Certification

Captured: 2026-06-11 · Org `staffly-demo` (US profile seeded). Policy on
record: **Standard 9-6** — day 09:00–18:00, grace 15 min, half-day threshold
4 h, expected 8 h/day, work days Mon–Fri (`attendance_policies`).

## 1. Core mechanics

| Check | Result | Evidence |
| --- | --- | --- |
| Check-in (live) | double check-in correctly rejected — 400 `attendance.already_checked_in` | Phase 3 probe (`DEMO_JOURNEY_CERTIFICATION.md` §1) |
| Check-out (live) | 201, row updated; restored after probe | Phase 3 probe |
| Worked hours | **0 / 2,260** closed rows where `worked_minutes` ≠ `check_out − check_in` (±1 min); none negative | psql invariant sweep |
| Half day | 138 rows; **0** with `worked_minutes ≥ 240` (threshold 4 h) | psql |
| Present | 2,122 rows; **0** closed rows under 240 min | psql |
| Absent / on-leave | 93 absent · 24 on_leave; status distribution coherent | psql |
| Late | 335 rows flagged; live computation correct per policy (`attendance.service.ts:117-119` — `dayStartTime + graceMinutesLate`) | source + sweep (see RC-04) |

## 2. Visibility & counters (cross-referenced)

| Check | Result | Evidence |
| --- | --- | --- |
| Manager visibility | exactly subtree + self (20 rows, 10 employees; recursive-CTE match) | Phase 3 §2 |
| Admin/HR visibility | org-wide scope, counts = DB | Phase 3 §3–4 |
| Dashboard counters | `attendanceToday` + 7d/30d trends byte-exact vs DB | Phase 4 (`RC_DASHBOARD_CERTIFICATION.md`) |

## 3. Timezone re-tests (previously reported issues)

| ID | Original defect | Re-test result | Classification |
| --- | --- | --- | --- |
| ED-01 | seed check-ins at 09:00 **UTC** for all locations (SF staff "checked in" ~01:00 local) | ALL 2,260 check-ins fall in **[07:30, 11:00) local** per employee tz (psql band query) + `verify-demo` check #3: 0/2260 outside window | **FIXED** (holds) |
| ED-02 | seed leave/attendance contradictions | 0 present/half_day rows on approved-leave days; 0 orphan on_leave rows (`verify-demo` #1/#2 + independent psql) | **FIXED** (holds) |
| ED-04 | seed `TODAY` UTC vs dashboard org-tz divergence | 35 records on 2026-06-11 (org-tz date, `verify-demo` #4); dashboard `attendanceToday` matches DB exactly (Phase 4) | **FIXED** (holds) |
| RC-02 | check-out accepted before check-in (found in Phase 3) | seed writes today's check-in at local 09:00 regardless of wall-clock (`seed-demo.ts:771-778`); API has no negative-duration guard | **OPEN** (P3, demo-cosmetic) |

Employee-tz handling confirmed end-to-end: `/attendance/me` reports the
employee's own tz (`America/Los_Angeles` for Alex Doe via
location/override chain), and check-in instants render to sane local
mornings in every tz present (NY, LA, Chicago, London).

`verify-demo` full run: **6/6 checks passed** (includes balances
reconciliation and document binaries — feeds Phases 6–7).

### Finding RC-04 — seed half-day branch never sets `is_late` (P4, NEW)

32 / 2,260 seeded rows (1.4%) have check-in 09:16–09:20 local (past the
15-min grace) but `is_late=false` — all of them `half_day`. Cause: the
seed's half-day branch jitters check-in by 0–20 min but omits the
lateness computation (`seed-demo.ts:790-793`: `late` stays `false`),
while the `present` branch computes it. The **live service is correct**;
this is seed-data cosmetics in historical rows only. Fix is one line in
the seed.

## 4. Verdict

**PASS.** Attendance mechanics, scoping, counters, and all three
previously-reported timezone defects verified FIXED on live data. Two
open items carried to `docs/OPEN_BLOCKERS.md`: RC-02 (P3, pre-existing
from Phase 3) and RC-04 (P4, new, seed-only).
