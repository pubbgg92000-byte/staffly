# Phase 4 — Employee Lifecycle Certification

Captured: 2026-06-10 (~13:15Z) · Program phase 4 of 17 · Baseline: `docs/CERTIFICATION_BASELINE.md`
Method: full lifecycle driven live via the API as hr_admin against the demo org; cross-checked against DB rows, dashboard metrics, and the audit log. All test entities removed afterwards.

## Verdict: PASS (lifecycle correct end-to-end; F-2.2 reclassified — see §3)

| Operation | Result | Evidence |
| --- | --- | --- |
| Create | **PASS** — `POST /employees` → status `invited`, server-assigned uuidv7 id | §1 |
| Read (by id) | **PASS** — 200 (now team-scoped after Phase 3) | §1 |
| Update | **PASS** — `PATCH` firstName persisted | §1 |
| Search | **PASS** — `?search=` matches displayName/code/workEmail | §1 |
| Filters | **PASS** — `?status=active` → 38; `?includeArchived=` toggles soft-deleted visibility | §1, §2 |
| Pagination | **PASS** — `meta{page,pageSize,total}` accurate; page 2 / size 10 returned 10 of 41 | §2 |
| Deactivate (soft delete) | **PASS** — `DELETE` → 204; excluded from default list, visible with `includeArchived=true` | §1 |
| Restore | **PASS** — `POST /:id/restore` → 200; reappears in active list | §1 |
| Audit logging | **PASS** — create/update/delete/restore each emit an `audit_logs` row with actor + timestamp | §2 |
| Dashboard propagation | **PASS** — create with `joinedOn` this month bumped `newJoinsThisMonth`; `activeEmployees` reflected soft-delete | §2 |
| Notifications | **N/A for CRUD** — employee CRUD does not fan out notifications (only announcements/leave/docs do; verified Phase 8) | — |

## 1. Lifecycle trace (one employee, end-to-end)

```
POST /employees {employeeCode:CERT-001, firstName:Cert, lastName:Lifecycle, workEmail:…, employmentType:full_time, joinedOn:2026-06-01}
  → 201, id=019eb1ac-…, status=invited
GET /employees/019eb1ac-…            → 200
PATCH /employees/019eb1ac-… {firstName:Certified}  → firstName=Certified
GET /employees?search=Certified      → meta.total=1
DELETE /employees/019eb1ac-…         → 204
GET /employees?search=Certified                    → 0   (excluded by default)
GET /employees?search=Certified&includeArchived=true → 1 (archived visible)
POST /employees/019eb1ac-…/restore   → 200
GET /employees?search=Certified      → 1   (back in active list)
```

Validation enforced: `employeeCode` is required (422 without it); `workEmail` must be a valid email. `status` defaults to `invited` on create (no user account/login until invited+accepted).

## 2. DB / dashboard / audit cross-checks

- **Pagination**: `?page=2&pageSize=10` → `meta{page:2,pageSize:10,total:41}`, 10 items (41 = 40 demo + the test employee mid-run).
- **Status filter**: `?status=active` → 38 (40 minus 2 seeded non-active: invited/offboarded states in the demo set).
- **Dashboard**: after create, `GET /dashboard/admin` → `newJoinsThisMonth: 4` (the seed's 3 recent hires + the test create with `joinedOn` in June); `activeEmployees: 38` consistent with the status filter. Confirms create/delete propagate to the admin dashboard aggregates immediately.
- **Audit log** (`GET /audit-logs` as super_admin) showed, newest first: `employee.restore`, `employee.delete`, `employee.update`, `employee.create` — each `resource_type=employee` with `actor_user_id`, `actor_ip`, `created_at`. The Phase 3 `attendance.policy.create` (hr_admin fix) also appears, confirming that change works.

## 3. Findings

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| F-2.2 → **F-4.1** | **P3 (reclassified down from P2)** | Phase 2's "orphan user" observation: `POST /auth/accept-invite` creates an auth **user** with no **employee** profile row. On closer inspection this is the **invite→user** model: an invite provisions a login (user + role); an employee *profile* is a separate record created via `POST /employees`. The two are intentionally decoupled (a user can exist for portal access without an HR employee record, e.g. the org-bootstrap owner). Not a security defect; but the **employee dashboard** for such a user has no employee subject (`leave.no_employee_for_user` paths), which is a UX rough edge | **Documented**; revisit in Phase 14 (UX) — a user-without-employee should get a clearer empty/onboarding state than a 404-ish dashboard |
| F-4.2 | P3 | `update`/`remove`/`restore` on `employees.service` take only `id` (no caller scope) — acceptable because only hr_admin/super_admin hold `employee.update`/`delete` at **global** scope (managers lack these permissions entirely, confirmed Phase 3), so there is no team-scope bypass. If `employee.update`/`delete` were ever granted at team scope, these would need the same `canActOnEmployee` guard added to the reads in Phase 3 | **Note** — pre-emptive; no fix needed today |

## 4. Cleanup

The lifecycle test created `cert.lifecycle@acme.demo` (employee `CERT-001`). Removed the employee row and its 4 audit-log entries post-test. Demo org verified back to **40 employees / 4 login users / 24 notifications**. (Phase 5 re-seeds the org regardless, clearing any residue.)

No code changes this phase — lifecycle behaved correctly; the only finding (F-4.1) is a documented UX rough edge for Phase 14, and F-4.2 is a pre-emptive note.
