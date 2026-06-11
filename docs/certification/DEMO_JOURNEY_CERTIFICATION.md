# RC-1 Inspection — Phase 3: Demo Journey Certification

Captured: 2026-06-11 · Org `staffly-demo` (Acme Corporation, pinned id
`019e0000-0000-7000-8000-000000000001`). All probes are REAL HTTP requests
against `http://localhost:4000` using only the four demo accounts. Probes ran
earlier today; the session was interrupted (usage limit) after probe cleanup
but before this report — ambiguous results were re-probed at resume and are
marked accordingly. No tenants/users/datasets beyond temporary probe rows
were created, and all probe rows were deleted (§6).

## 1. Employee journey (`employee@acme.demo`)

| Step | Result | Evidence |
| --- | --- | --- |
| Sign-in | 200 | `POST /auth/signin` |
| Check-in | 400 `attendance.already_checked_in` ✅ correct guard — seed had already written today's check-in (09:00 PT) | API response + `attendance_records` row `707b6c08` |
| Dashboard | 200 — full widget set: `me, todayStatus, attendanceLast7Days, leaveBalances, pendingTasks, upcomingLeave, upcomingHolidays, announcements, recentDocuments, expiringDocuments, generatedAt` | `GET /dashboard/employee` |
| Attendance (today) | 200 — today-status object with employee, date, timezone `America/Los_Angeles` (tz-realistic seed), today's record | `GET /attendance/me` (re-probed at resume) |
| Attendance (history) | 200 — `attendanceLast7Days` 7 entries with real statuses/worked minutes | `GET /dashboard/employee`; portal reads this field (`apps/employee/app/(app)/attendance/page.tsx:101`) |
| Leave types + balances | 200 — 5 types (Sick/Earned/WFH/Unpaid/Casual) with balances | `GET` leave types/balances + `leave_balances` DB |
| Apply leave | 201 — probe requests created (e.g. `019eb62b-36a3…`, `019eb62f-ed10…`); balance `pending` moved (2.00 during probe) | API + `leave_requests`/`leave_balances` DB |
| Notifications | 200 — list returns, unread count 5 | `GET` notifications |
| Documents | 200 — 2 personal documents, download URL issued, binary fetched | `GET` documents + download probe |
| Check-out | 201 — row updated | API + DB row `707b6c08` |
| Logout/session | certified in Phase 2 (all four accounts) | `DEMO_ACCOUNT_CERTIFICATION.md` |

**Note (resolved probe artifact):** the first probe run logged
"`attendance/me` count: 0". Re-probe at resume shows `/attendance/me` is a
**today-status endpoint** returning an object (not a list); the 0 was the
script counting `.items` on an object. Not a defect.

### Finding RC-02 — check-out accepted before check-in (P3, OPEN)

The probe check-out at 10:07 UTC landed **before** the seeded check-in
(16:00 UTC = 09:00 PT "today" written by the seed ahead of wall-clock time).
The API accepted it (201) and computed `worked_minutes=0`,
`status=half_day`. Two component causes: (a) the demo seed writes today's
check-in at a fixed local time that can be in the future relative to "now";
(b) the API has no negative-duration guard on check-out. Impossible for
real users (check-in is always ≤ now), so demo-cosmetic only: a demo run
early in the US morning can show a 0-minute half-day. Row restored to
pre-probe state after the probe (§6).

## 2. Manager journey (`manager@acme.demo`, Marcus Lee, employee `7000331e`)

| Step | Result | Evidence |
| --- | --- | --- |
| Sign-in | 200 | `POST /auth/signin` |
| Team visibility | PASS — direct+indirect subtree = 9 reports; attendance view returns exactly subtree + self (20 rows, 10 unique employees; the single "outside-team" id is the manager himself — correct, not leakage) | recursive-CTE DB comparison vs `GET /attendance` response ids |
| Team attendance | 200 — 20 rows for 2026-06-10, matches DB count for subtree | API + DB |
| Pending leave queue | 200 — 7 requests visible (team scope) | `GET /leave/requests?status=pending` |
| Approve leave | 200 → `status=approved`; `approved=t` in DB; balance `pending` decremented; audit `leave.request.approve` logged | API + `leave_requests`/`leave_balances`/`audit_logs` |
| Reject leave | 200 → `status=rejected` (second probe request `019eb62b…`) | API + DB |

### Finding RC-03 — leave decisions produce no in-app notification (P3, OPEN)

After approve and reject, **zero rows** were created in `notifications` for
the employee (probe-window query returned 0 rows). Decision **emails are
sent** (Mailhog: "Your leave request was approved" 10:10 UTC, "…rejected"
10:12 UTC, both to employee@acme.demo). Impact: the portal notification
bell does not reflect leave decisions — email-only. Demo-cosmetic; flag in
demo script so the presenter opens Mailhog or mail client instead of the
bell.

## 3. HR journey (`hr@acme.demo`)

| Step | Result | Evidence |
| --- | --- | --- |
| Sign-in | 200 | `POST /auth/signin` |
| Employee list | 200 — paginated, 20/page | `GET /employees` |
| Employee create (bad payload) | 400 validation ✅ rejects malformed input | API |
| Employee create (valid) | 201 — id `019eb62e-b0d1…`, code `RC-PROBE-1`, status `invited` | API + `employees` DB row |
| Employee edit | 200 — `middleName` updated, verified in DB | API + DB |
| Audit trail | `employee.create` + `employee.update`, actor = HR user, 10:16 UTC | `audit_logs` by `resource_id` |
| Org attendance view | 200 — 20 rows (2026-06-10, org scope) | `GET /attendance` |
| Org leave approvals | 200 — 17 pending visible (org scope, wider than manager's 7 ✅); HR approve of probe request 3 → 200 `approved` | API |
| Announcements | 200 — 8 announcements | `GET /announcements` |

## 4. Super Admin journey (`superadmin@acme.demo`)

All org-visibility endpoints green; the lone 404 was a guessed path —
the real holiday routes live under `holiday-calendars`
(`apps/api/src/holidays` controller: `@Get("holiday-calendars")`,
`…/:id/holidays`, `holidays/me`). Not a defect.

| Endpoint | Status (count) |
| --- | --- |
| `GET /organization` · `/organization/settings` | 200 (obj) |
| `GET /employees?limit=5` | 200 (20) |
| `GET /audit-logs?limit=5` | 200 (9 — includes probe actions `employee.create/update`, `leave.request.create/approve`) ✅ audit access works |
| `GET /dashboard/admin` | 200 (obj) |
| `GET /leave/requests?status=pending` | 200 (17) |
| `GET /attendance?from=2026-06-10&to=2026-06-10` | 200 (20) |
| `GET /documents` | 200 (20) |
| `GET /announcements` | 200 (8) |
| `GET /departments` · `/designations` · `/locations` | 200 (8 · 13 · 6) |
| `GET /holiday-calendars` · `…/:id/holidays` | 200 (1) · 200 (12) |

## 5. DB → API → UI consistency

- **DB → API:** every count above was cross-checked against psql (team
  subtree CTE, attendance row counts, leave/balance moves, audit rows).
  No mismatches beyond findings RC-02/RC-03.
- **API → UI:** verified at source level — the portal pages consume
  exactly the endpoints probed (e.g. employee attendance page renders
  `dashboard.attendanceLast7Days`, `apps/employee/app/(app)/attendance/page.tsx:101`).
  Browser-level UI walkthrough was certified in the v1.0 program (Phase 15
  UX, commit `d912745`); not repeated here.

## 6. Probe cleanup (tenant discipline)

All probe rows removed; verified again at resume:

| Item | Action | Post-state |
| --- | --- | --- |
| 3 probe leave requests (+ day rows) | DELETE | `leave_requests` total back to **59** (baseline) |
| Probe employee `RC-PROBE-1` | DELETE | **40** active employees (baseline); 0 rows matching probe patterns in `employees`/`users` |
| Employee leave balance | UPDATE | Casual 12.00/0/0 restored; remaining `pending=1.00` on Sick Leave belongs to the **seeded** pending request (Apr 20, "Family vacation") — not residue |
| Today's attendance row `707b6c08` | UPDATE | `check_out_at=NULL`, `status=present` (pre-probe state) |
| Notification read state | UPDATE | restored |

## 7. Verdict

**PASS.** All four role journeys complete end-to-end with correct scoping
(employee self-scope, manager subtree+self, HR org scope, superadmin org +
audit). Validation, audit logging, balance accounting, and decision emails
all behave. Two demo-cosmetic findings remain open: **RC-02** (no
negative-duration guard on check-out + seed writes future check-in) and
**RC-03** (leave decisions are email-only, no in-app notification) — both
P3, carried to `docs/OPEN_BLOCKERS.md`.
