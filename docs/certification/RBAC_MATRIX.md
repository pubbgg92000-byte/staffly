# Phase 3 — RBAC Certification

Captured: 2026-06-10 (~13:10Z) · Program phase 3 of 17 · Baseline: `docs/CERTIFICATION_BASELINE.md`
Method: full source map of the permission model (catalog, role grants, every controller route, scope enforcement) + live cross-role probe matrix against :4000 with cookie jars per role. Demo org `staffly-demo`.

## Verdict: PASS after gate fixes (3 × P1 broken-access-control + 1 × P3 fixed; 2 findings deferred to Phase 11)

The two-layer model is sound — `PermissionGuard` decides *whether* a caller holds a permission; `CallerScopeService` narrows *which rows*. Phase 3 found that scope narrowing was applied to **list** endpoints but missing on three **detail/filter** endpoints, letting a team-scoped manager reach any row by id. All three fixed and re-verified live + integration-tested.

## 1. Role → permission summary (source: `role-permissions.json`, `system-roles.ts`, `org-bootstrap.service.ts`)

| Role | Keys | Scope |
| --- | --- | --- |
| super_admin | all 48 (via `"*"`) | global; sole holder of `rbac.*`, `audit.read` |
| hr_admin | 43 → **44** (added `attendance.policy.write`, F-3.4) | global org-ops; no `rbac.*`/`audit.read` |
| manager | 9: `dashboard.view`, `announcement.read/acknowledge`, `holiday.read` (global) + **team-scoped** `employee.read`, `attendance.read`, `leave.read`, `leave.approve`, `leave.reject` | team = direct+indirect reports via `managerId` BFS (depth-capped 10) |
| employee | 8 self-service: `attendance.write`, `leave.create/update/cancel`, `document.acknowledge`, `announcement.read/acknowledge`, `holiday.read` | self (services bind to caller `userId`) |

Permission catalog: **48 keys** across 15 resource groups (served by `GET /permissions`).

## 2. Live cross-role GET matrix (representative; 200=allowed, 403=denied)

```
                          super  hr    mgr   emp
/dashboard/admin           200   200   200   403   (dashboard.view; employee lacks it)
/dashboard/employee        200   200   200   200   (authenticated-only, self)
/employees                 200   200   200*  403   (*mgr team-scoped: 10 of 40)
/roles /permissions /users 200   403   403   403   (rbac.read = super_admin only)
/audit-logs                200   403   403   403   (audit.read = super_admin only)
/leave/requests            200   200   200*  403   (*mgr team-scoped)
/attendance                200   200   200*  403   (*mgr team-scoped)
/documents                 200   200   403   403   (document.read; mgr lacks it)
/organization              200   200   403   403   (org.settings.read)
/departments /designations 200   200   403   403   (org.structure.read)
/leave/types               200   200   403   403   (leave.policy.read)
/attendance-policies       200   200   403   403   (attendance.policy.read)
/me/notifications          200   200   200   200   (self)
/holiday-calendars         200   200   200   200   (holiday.read — all roles)
```

Manager team-scoping verified by count: super_admin/hr see **40** employees, manager sees **10** (own + reports). Privilege-escalation probes: employee `POST /roles` → 403; manager `POST /roles` → 403 (only super_admin holds `rbac.write`).

## 3. Findings & fixes

| ID | Sev | Finding (live-confirmed) | Source | Disposition |
| --- | --- | --- | --- | --- |
| F-3.1 | **P1** | `GET /employees/:id` had **no** caller-scope check — a team manager read full PII (name, personal email, DOB, phone) of **any** employee by id, though the list view was scoped. Live: mgr→outside-team emp = 200 | `employees.service.ts:get` | **FIXED** — `canActOnEmployee("employee.read")`, out-of-team → 404. Live: now 404; in-team 200; super 200 |
| F-3.2 | **P1** | `GET /attendance/:id` had no caller-scope — manager read any single attendance record cross-team. Live: 200 | `attendance.service.ts:get` | **FIXED** — `canActOnEmployee("attendance.read")` → 404 out-of-team. Live: now 404 |
| F-3.3 | **P1** | `GET /leave/balances` (+`?employeeId=`) had no team scope — `LeaveBalancesService.list` took no caller; manager read **every** employee's balances. Live: targeting an outsider returned their 4 balance rows | `leave-balances.service.ts:list`, `leave.controller.ts` | **FIXED** — inject `CallerScopeService`, `teamFilterFor("leave.read")` with employeeId intersect. Live: now 0 rows for outsider |
| F-3.4 | P3 | hr_admin held `leave.policy.write`/`holiday.write`/`org.structure.write` but **not** `attendance.policy.write` — could not edit attendance policies (asymmetric oversight). Live: `POST /attendance-policies` → 403 | `role-permissions.json` (hr_admin) | **FIXED** — added grant; new orgs get it at bootstrap (global); demo org backfilled. Live: now 201 |
| F-3.5 | P2 | `announcement.read` is granted to **employee** but also guards admin endpoints `GET /announcements` (full list), `/:id`, `/:id/acknowledgements` — an ordinary employee can read the admin announcement list and other employees' acknowledgement rosters, not just their `/me` feed. Live: employee `GET /announcements` → 200 | `announcements.controller.ts:45,88,173` | **Phase 11** (security) — needs scope split or separate permission; product call on exposure |
| F-3.6 | P2 | Self-service mutating routes carry no `@RequirePermission` and rely solely on the service binding to the caller (`POST /attendance/check-in|check-out`, `/attendance/regularizations`, `POST /leave/requests`, `PATCH /leave/requests/:id/cancel`). Not an escalation today (services bind to the caller's own employee), but a role that lost `attendance.write`/`leave.create` could still self-act | `attendance.controller.ts:97,114`; `leave.controller.ts:93,124` | **Phase 11** — defense-in-depth; add explicit guards |
| F-3.7 | P3 | Attendance regularization decide path (`attendance.approve`) has no `canActOnEmployee` analog to leave's `decide()`. Safe today (only hr_admin holds it, global) but would over-expose if ever team-scoped | `regularizations.service.ts` | Phase 11 (note) |
| F-3.8 | P3 | All `:id` detail lookups rely on the Prisma client extension for tenant isolation rather than an explicit `organizationId` in the where clause — no defense-in-depth tenant filter. Sound only if the extension is always mounted | `employees.service.ts:86`, `attendance.service.ts:78` | Phase 11 (verify extension always active; tenant-isolation suite already covers cross-org) |

## 4. Gate fixes — implemented & verified

F-3.1/3.2/3.3 (P1 BAC) + F-3.4 (P3) fixed. Changes: `employees.service.ts`+controller, `attendance.service.ts`+controller, `leave-balances.service.ts`+`leave.controller.ts`, `role-permissions.json`. Pattern reused: existing `CallerScopeService.canActOnEmployee()` / `teamFilterFor()` (same helpers the leave approve/reject paths use). Out-of-team detail reads return **404** (don't leak existence), consistent with tenant-isolation behavior.

**Tests:** 3 new integration tests in `manager-scope.integration.spec.ts` (employee/:id 404+200+global, attendance/:id 404, leave/balances excludes outsiders incl. targeted) → spec 4→**7/7**.

**Live re-verification (manager, post-fix):** `/employees/<outside>` 404 · `/attendance/<outside-rec>` 404 · `/leave/balances?employeeId=<outside>` 0 rows · in-team `/employees/<in>` 200 · super_admin `/employees/<outside>` 200 (global unaffected) · hr `POST /attendance-policies` 201.

## 5. Notes

- The `manager_scope.integration.spec` already proved list scoping + leave approve/reject scoping; this phase closed the detail/by-id gap of the same class.
- Demo org `attendance.policy.write` backfilled directly (1 row) so the running system matches the seed change without a full re-seed; the Phase 5 re-seed will apply it from `role-permissions.json` cleanly.
- F-3.5/3.6 deferred to Phase 11 because they involve a product decision (how much should an employee see of announcements; whether to harden self-service routes with explicit guards) rather than an unambiguous bug.
