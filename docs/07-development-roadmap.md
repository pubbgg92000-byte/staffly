# 07 — Development Roadmap

> **Status:** Phase 5. Sprint plan, dependencies, Definition of Done, testing strategy, risk register, and future expansion sequencing. Sprint cadence assumes **2-week sprints**, a team of **2 FE + 2 BE + 1 design + 1 QA**. Adjust pace proportionally if team shape differs.

---

## 1. Operating Model

- **Sprint length:** 2 weeks.
- **Cadence:** Mon = planning, Mon–Fri = execution, Fri (end of week 2) = demo + retro.
- **Branching:** trunk-based; short-lived feature branches; squash-merge to `main`.
- **Deploy cadence:** staging continuously on `main`; production on green tag every Tuesday + on demand for critical fixes.
- **Definition of Ready (story):** has acceptance criteria, references screen IDs / API paths / entities, design approved, no open blocking question.
- **Definition of Done (story):** code + unit tests + integration tests where touching DB/IO + storybook story for new components + a11y check passes (axe) + e2e test where flow-critical + documentation cross-references updated + reviewed by ≥ 1 engineer + deployed to staging + smoke-tested by QA.
- **Definition of Done (sprint):** all completed stories meet story DoD + no regressions in a designated smoke suite + demo recorded.
- **Definition of Done (release / Phase 1):** every screen in `01 § 9` is implemented and matches the spec in `05`/`06` + all permissions in `01 § 10.3` enforced + multi-tenant isolation tests pass + p95 API latency < 300 ms under 200 vCU + 80% line coverage on critical modules (auth, RBAC, leave, attendance) + backups tested with one successful restore.

---

## 2. Sprint Plan (Phase 1)

Total: **11 sprints (Sprint 0 + 10 feature/polish sprints) ≈ 22 weeks ≈ 5.5 months**.

> Each sprint lists its theme, stories (with primary file references), and the cross-cutting tasks. Story IDs use prefix `S{sprint}-{counter}`.

### Sprint 0 — Foundation (2 weeks)

**Goal:** monorepo scaffolding, CI, base auth skeleton, design system seed, both portals booting.

| ID | Story | References |
|---|---|---|
| S0-01 | Monorepo bootstrap (pnpm + Turborepo) with `apps/admin`, `apps/employee`, `apps/api`, `packages/{ui,types,config,i18n}` | `08` |
| S0-02 | Postgres + Redis + Mailhog (dev) via Docker Compose | `08` |
| S0-03 | Prisma schema for tenancy + RBAC tables (orgs, users, roles, permissions, role_permissions, user_roles, refresh_tokens, audit_logs) | `02 § 2.1` |
| S0-04 | NestJS bootstrap with `AppModule`, `HealthModule`, global filters/pipes/interceptors stubbed | `03 § 17`, `08 § Backend` |
| S0-05 | Tenant resolver + Prisma tenant extension (with tests) | `02 § 1.5`, `08 § Database` |
| S0-06 | Auth: sign-up, sign-in, refresh, logout, me; JWT cookies + CSRF | `03 § 2` |
| S0-07 | Next.js shells for both apps with `AppShell`, `Sidebar`, `Topbar`, `AuthLayout`; Auth pages (sign-in / forgot / reset) | `04`, `05 A-AUTH-*`, `06 E-AUTH-*` |
| S0-08 | Design tokens, Tailwind config, shadcn install, `packages/ui` with `Button/Input/Card/Badge/Dialog/Sheet/Skeleton` | `04` |
| S0-09 | CI pipeline (lint, typecheck, unit, e2e smoke, build) | `08 § CI/CD` |
| S0-10 | Storybook setup + axe addon | `04 § 15` |

**Demo:** sign up a new org → land on empty dashboard shell in both portals.

---

### Sprint 1 — RBAC, Org Settings, Org Structure

**Goal:** authorization end-to-end; admins can configure the basics.

| ID | Story | References |
|---|---|---|
| S1-01 | Permission catalog seed + role seeding on org create | `01 § 10`, `02 § 7.1` |
| S1-02 | `PermissionsGuard` + scope resolver (global/self) | `01 § 10.4`, `08 § Backend` |
| S1-03 | RBAC APIs (roles, permissions, role-permissions, user-roles) | `03 § 4` |
| S1-04 | Admin Settings → Roles & Permissions screens (`A-SET-030`, `A-SET-031`) | `05` |
| S1-05 | Organization profile API + screen (`A-SET-001`) | `03 § 3`, `05` |
| S1-06 | Branding API + screen (`A-SET-002`) | `05` |
| S1-07 | Departments / Designations / Locations APIs + screens (`A-SET-010`-`012`) | `03 § 6`, `05` |
| S1-08 | Org settings key/value store + APIs (`A-SET-001` extras) | `02 § 2.1.2`, `03 § 3` |
| S1-09 | Audit log infra + interceptor + reader API + screen (`A-SET-050`) | `02 § 2.1.9`, `03 § 15` |
| S1-10 | Multi-tenant isolation e2e suite (assertions in `02 § 8`) | `02 § 8` |

**Demo:** create a non-default role; flip a permission; see the affected screen appear/disappear.

---

### Sprint 2 — Employee Management (single + bulk)

**Goal:** invite, manage, and import employees end-to-end.

| ID | Story | References |
|---|---|---|
| S2-01 | Employees CRUD + invite flow + accept-invite | `02 § 2.2.1`, `03 § 5`, `05 A-EMP-002` / `06 E-AUTH-005` |
| S2-02 | Employees list (admin) (`A-EMP-001`) with filters and DataTable | `05` |
| S2-03 | Employee detail tabs: Overview, Personal (admin) — `A-EMP-010`, `A-EMP-011` | `05` |
| S2-04 | Employments history + sub-resource APIs (`A-EMP-012`) | `03 § 5.8-5.9` |
| S2-05 | Emergency contacts + addresses (admin + self) | `03 § 5.10-5.11`, `05 A-EMP-011`, `06 E-PRO-003` |
| S2-06 | Employee bulk import wizard (`A-EMP-003`) — presign upload → validate → preview → commit | `03 § 5.12` |
| S2-07 | Deactivate / reactivate + cascade rules (cancel pending leaves) | `03 § 5.5-5.6` |
| S2-08 | Employee profile (self) — `E-PRO-001`/`002`/`004`/`005` + `PATCH /employees/:meId` self-editable fields | `06` |
| S2-09 | Profile-photo upload via presign | `03 § 14`, `04 UploadDropzone` |
| S2-10 | Trigram search index + global search endpoint v0 | `03 § 16`, `02 § 5` |

**Demo:** invite an employee → they accept → both portals show full profile data; bulk-import 100 employees.

---

### Sprint 3 — Attendance

**Goal:** check-in/out, history, regularization end-to-end.

| ID | Story | References |
|---|---|---|
| S3-01 | Attendance policy CRUD + default selection | `02 § 2.4.1`, `03 § 3.6-3.9`, `05 A-SET-021` |
| S3-02 | Check-in / Check-out endpoints with idempotency + "already checked in" handling | `03 § 7.2-7.3` |
| S3-03 | Attendance records list (self + admin) | `03 § 7.4-7.5`, `06 E-ATT-002`, `05 A-ATT-002` |
| S3-04 | Today view (admin) (`A-ATT-001`) with 60s poll | `03 § 7.6`, `05` |
| S3-05 | Attendance summary endpoint + admin reports (`A-ATT-004`) | `03 § 7.7`, `05` |
| S3-06 | Regularization submit (employee) — `E-ATT-003`, `E-ATT-004` | `03 § 7.9`, `06` |
| S3-07 | Regularization inbox (admin) — `A-ATT-003` + approve/reject | `03 § 7.9`, `05` |
| S3-08 | Auto-close incomplete-day cron + worked-minutes computation | `02 § 6`, `08 § Backend` |
| S3-09 | Employee attendance tab (admin) — `A-EMP-015` | `05` |
| S3-10 | Dashboard widgets: `TodayStatusWidget`, `PresentTodayWidget` | `05`, `06` |

**Demo:** employees check in/out; admin approves a regularization; today view updates live.

---

### Sprint 4 — Leave Types, Policies, Balances

**Goal:** the leave engine — policy CRUD, balance ledger, accrual job.

| ID | Story | References |
|---|---|---|
| S4-01 | Leave types CRUD + UI (`A-LV-005/006/007`) | `02 § 2.5.1`, `03 § 8.1`, `05` |
| S4-02 | Leave ledger schema + recompute function | `02 § 2.5.3-2.5.4`, `02 § 6` |
| S4-03 | Accrual cron (monthly / quarterly / annual) | `08 § Jobs` |
| S4-04 | Balance views: self (`E-LV-001`) + admin per-employee (`A-EMP-014`) | `03 § 8.2`, `05`, `06` |
| S4-05 | Manual balance adjustment (admin) | `03 § 8.2.4`, `05 A-EMP-014` |
| S4-06 | Leave settings org-level (year start, defaults) — `A-SET-020` | `05` |
| S4-07 | Leave balances pivot screen (admin) — `A-LV-004` | `05` |
| S4-08 | Property-based tests for accrual/carry-forward/cap | `08 § Tests` |

**Demo:** create a leave type; manually adjust a balance; trigger an accrual; ledger reflects every change with audit trail.

---

### Sprint 5 — Leave Requests & Approvals

**Goal:** end-to-end leave request lifecycle.

| ID | Story | References |
|---|---|---|
| S5-01 | Leave request submit with policy validation (notice, attachment, blackout, balance reservation) | `03 § 8.3.1`, `01 § 11.3` |
| S5-02 | Apply for leave UI (`E-LV-002`) with balance preview + calendar overlap | `06` |
| S5-03 | Leave history (self) `E-LV-003` + detail `E-LV-004` (cancel/withdraw) | `06`, `03 § 8.3.5-8.3.6` |
| S5-04 | Approval inbox (admin) `A-LV-001` + detail `A-LV-002` (approve/reject) | `05`, `03 § 8.3.7-8.3.9` |
| S5-05 | Leave calendar (admin) `A-LV-003` + self `E-LV-005` | `03 § 8.4`, `05`, `06` |
| S5-06 | Approval history timeline component + audit + notifications | `01 § 14`, `02 § 2.5.6` |
| S5-07 | Email templates + Postmark integration + BullMQ email worker | `08 § Email/Notifications` |
| S5-08 | In-app notifications (DB-backed, polling) + topbar bell | `02 § 2.1.10`, `03 § 13`, `05`, `06` |

**Demo:** employee applies → admin approves → both sides receive in-app + email; cancel/withdraw flows work.

---

### Sprint 6 — Documents & Compliance

**Goal:** distribute and track documents end-to-end.

| ID | Story | References |
|---|---|---|
| S6-01 | Categories CRUD + UI (`A-DOC-004`) | `03 § 9.1`, `05` |
| S6-02 | Documents CRUD + audience targeting + publish + archive | `02 § 2.6`, `03 § 9.2` |
| S6-03 | Documents list (admin) `A-DOC-001` + detail `A-DOC-003` | `05` |
| S6-04 | Upload + presign flow + file size/mime gating | `03 § 14`, `04 UploadDropzone` |
| S6-05 | Employee documents inbox `E-DOC-001` + detail `E-DOC-002` + acknowledge | `06`, `03 § 9.2.7-9.2.8` |
| S6-06 | Personal documents self-upload `E-DOC-003` + admin per-employee `A-EMP-013` | `03 § 9.3`, `05`, `06` |
| S6-07 | Ack tracking + remind endpoint + reminder digest cron | `01 § 14`, `03 § 9.2.9` |
| S6-08 | Acknowledgment widget on admin dashboard | `05` |
| S6-09 | Document signed-download endpoint with permission check | `03 § 14.3` |

**Demo:** publish a required doc to all engineers → see acknowledgment % rise as employees ack.

---

### Sprint 7 — Announcements & Holidays

**Goal:** company-wide communications + holiday model.

| ID | Story | References |
|---|---|---|
| S7-01 | Announcements CRUD + audience + schedule + publish | `02 § 2.7`, `03 § 10` |
| S7-02 | Composer `A-ANN-002` with Tiptap editor + auto-save drafts | `04 § 6.17`, `05` |
| S7-03 | Announcements list `A-ANN-001` + detail `A-ANN-003` + edit `A-ANN-004` | `05` |
| S7-04 | Employee feed `E-ANN-001` + detail `E-ANN-002` + acknowledge | `06` |
| S7-05 | Audience preview endpoint + UI rail | `03 § 10.9` |
| S7-06 | Scheduled publish cron | `08 § Jobs` |
| S7-07 | Holiday calendars + holidays CRUD + assignments | `02 § 2.8`, `03 § 11` |
| S7-08 | Calendar list (admin) `A-HOL-001`, detail `A-HOL-003`, new `A-HOL-002`, bulk import `A-HOL-004` | `05` |
| S7-09 | Employee holidays view `E-HOL-001` | `06` |
| S7-10 | Resolved my-holidays endpoint + holiday seeds (India + US sample) | `03 § 11.10`, `02 § 7.5` |

**Demo:** schedule an announcement; import a US holidays CSV; employees see only the holidays applicable to their location.

---

### Sprint 8 — Dashboards

**Goal:** make the home screens earn their keep.

| ID | Story | References |
|---|---|---|
| S8-01 | Admin dashboard endpoint bundle | `03 § 12.1` |
| S8-02 | Employee dashboard endpoint bundle | `03 § 12.2` |
| S8-03 | All admin widgets (`A-DASH-001`) | `05` |
| S8-04 | All employee widgets (`E-DASH-001`) | `06` |
| S8-05 | Getting-Started checklist data + UI | `05` |
| S8-06 | Birthdays/anniversaries computation + privacy-aware rendering | `06`, `05` |
| S8-07 | Onboarding wizard `A-ONB-001` (idempotent steps + skip) | `05` |
| S8-08 | First-run polish for empty-state tenants | `04 § 9`, `00 § Risks` |

**Demo:** brand-new tenant gets the wizard → completes setup → both dashboards light up with realistic content.

---

### Sprint 9 — Cmd-K, Search, Notification Preferences, Profile

**Goal:** rough edges off; satisfaction features.

| ID | Story | References |
|---|---|---|
| S9-01 | Global search endpoint + Cmd-K palette | `03 § 16`, `04 § 6.18`, `05 A-SRC-001` |
| S9-02 | Notification preferences (user-level) | `03 § 13.4`, `06 E-PRO-006`, `05 A-SET-040` |
| S9-03 | Help screen `E-HLP-001` | `06` |
| S9-04 | Audit log filtering UX polish | `05 A-SET-050` |
| S9-05 | Per-user theme persistence + dark mode parity audit | `04 § 12` |
| S9-06 | Mobile responsive sweep for employee portal (bottom nav, table → cards) | `04 § 11`, `06` |
| S9-07 | Security: 2FA enroll/disable + recovery codes | `03 § 2.11-2.13`, `06 E-PRO-006` |

**Demo:** full Cmd-K navigation; toggle dark mode; opt out of an email channel.

---

### Sprint 10 — Hardening, Performance, A11y, QA, Launch

**Goal:** ship.

| ID | Story | References |
|---|---|---|
| S10-01 | Load test (k6) — 200 vCU, 10k employees, p95 < 300 ms | `00 § Success` |
| S10-02 | Index audit; N+1 hunt; query budgets per page | `02 § 5`, `08 § Performance` |
| S10-03 | Backup verified by successful staging restore | `00 § Success`, `08 § DB Backups` |
| S10-04 | Accessibility audit (axe + manual VoiceOver/NVDA passes) | `04 § 10` |
| S10-05 | Penetration test scope + critical-finding fixes (OWASP top 10) | `08 § Security` |
| S10-06 | Error-tracking dashboards (Sentry); alerts wired | `08 § Observability` |
| S10-07 | Help docs + tooltips polish | `04`, `06 E-HLP-001` |
| S10-08 | Final cross-tenant isolation re-test | `02 § 8` |
| S10-09 | Launch checklist (legal, ToS, privacy, support email, support runbook) | `00`, `08` |
| S10-10 | Production deploy + smoke + handover | `08 § CI/CD` |

**Demo:** the product. Hand off to first design-partner tenant.

---

## 3. Cross-Sprint Workstreams

These run alongside features.

| Workstream | Owner | Notes |
|---|---|---|
| Design system maintenance | Design + 1 FE | Every new screen lands as Storybook stories first. |
| QA test plan upkeep | QA | Maintains the e2e suite and per-sprint smoke list. |
| Observability hygiene | 1 BE | Pino logs, request-id, Sentry releases per deploy. |
| Tech-debt budget | Whole team | 10% of each sprint, tracked. |

---

## 4. Module Dependency Graph

```
Tenancy + Auth + RBAC + AuditLog ─┬─> Org Settings + Org Structure
                                  ├─> Employees ──┬─> Documents
                                  │               ├─> Attendance ─> Regularization
                                  │               ├─> Leave Types ─> Leave Balances ─> Leave Requests
                                  │               ├─> Announcements (audience uses employees + structure)
                                  │               └─> Holidays (assignments use employees + locations)
                                  └─> Dashboards (consumes nearly everything)
```

The implication: **Tenancy + Auth + RBAC + Employees** is the critical path. Until those are stable, no other workstream produces shippable value. Sprints 0–2 deliver this critical path; Sprints 3+ parallelize meaningfully.

---

## 5. Testing Strategy

### 5.1 Unit (`vitest`)

- Pure utilities, policy engines (leave accrual, attendance worked-minutes), validators, mappers.
- Required coverage thresholds (CI-enforced):
  - `apps/api/src/modules/auth`: 90% lines.
  - `apps/api/src/modules/leave`: 90% lines.
  - `apps/api/src/modules/attendance`: 85% lines.
  - `apps/api/src/modules/rbac`: 90% lines.
  - Rest: 70% lines.
- Property-based tests for accrual math + worked-minutes computation.

### 5.2 Integration (`vitest` + `testcontainers` Postgres + Redis)

- Per-module integration tests booting a real Postgres container.
- All Prisma queries exercised at least once.
- Tenant guard test suite (`02 § 8`) lives here.

### 5.3 End-to-End (Playwright)

- Two browsers (Chromium + WebKit) on every PR; Firefox on nightly.
- Critical flows (must stay green to merge):
  1. Sign up new org → invite employee → employee accepts.
  2. Apply for leave → approve → balance reflects.
  3. Submit regularization → approve → attendance record updates.
  4. Publish required document → employee acknowledges → admin sees compliance update.
  5. Schedule announcement → publish job fires → audience receives in-app.
- Tests run against an ephemeral docker-compose stack per CI job.

### 5.4 Accessibility

- Axe in Storybook (every component) + Playwright (every page).
- Manual VoiceOver pass on a designated screen set every sprint (rotating).

### 5.5 Performance / load

- k6 scenarios for: list-employees-paginated, dashboard-admin, leave-submit, attendance-today.
- Target p95 < 300 ms at 200 vCU, 10k employees in single tenant.

### 5.6 Security

- Snyk on dependencies (CI).
- `npm audit` gating on `--audit-level=high`.
- Static analysis: `eslint-plugin-security`.
- Sentry release tracking.
- Annual external penetration test (post-launch).

---

## 6. Risk Register

| # | Risk | Likelihood | Impact | Owner | Mitigation |
|---|---|---|---|---|---|
| R1 | Scope creep into Phase-2 modules (Payroll, Reviews) | High | High | PM | Hard non-goal in `00`. Weekly scope review. Anything outside the list goes to backlog. |
| R2 | Cross-tenant data leak via missed `organization_id` filter | Medium | Catastrophic | Tech lead | Prisma extension auto-injects; tenant guard tests in CI; quarterly red-team. |
| R3 | Leave-balance arithmetic bugs | High | Medium | Leave squad | Pure functions + property-based tests + visible ledger UI. |
| R4 | Audit log volume explosion | Medium | Medium | Platform | Partitioning + retention policy; sample low-value events. |
| R5 | S3 cost overrun (uncontrolled uploads) | Medium | Low | Platform | Max-size gating; per-tenant storage quota in `org_settings`; orphan-cleanup cron. |
| R6 | Onboarding too long (>1 hr) | Medium | High | Design + PM | Optional steps; pre-seeded leave types; design-partner usability tests. |
| R7 | Notifications cause noise → unsubscribe | Medium | Medium | Notifications squad | Per-user preferences from day one; digest, not per-event for low-priority. |
| R8 | Email deliverability | Medium | Medium | Platform | Postmark + SPF/DKIM/DMARC; bounce/complaint webhooks → suspend on hard bounce. |
| R9 | Postgres write hot-spot on `attendance_records` | Medium | Medium | Platform | Partition by month; client-side rate limiting on check-in spam. |
| R10 | Designer/engineer drift on screen specs | Medium | Low | Design lead | Specs in `05`/`06` are the source of truth; Storybook before code. |
| R11 | First production migration goes wrong | Low | High | Platform | Expand/contract pattern; staging dry-run; rollback note in every PR. |
| R12 | Single super-admin loses access | Low | High | Support | Recovery codes for 2FA; documented support-side reset runbook. |

---

## 7. Team Composition

| Role | Headcount | Allocation |
|---|---|---|
| Eng Manager / Tech Lead | 0.5 | Architecture decisions, code review focus on auth + tenancy + leave. |
| Backend Engineers | 2 | Split: Auth/RBAC/Org + Employees/Attendance/Leave (mostly). |
| Frontend Engineers | 2 | Split: Admin portal + Employee portal; share `packages/ui`. |
| Designer | 1 | Drives `04`/`05`/`06`; runs design partner usability sessions every two sprints. |
| QA Engineer | 1 | Owns Playwright suite, manual exploratory passes, accessibility manual passes. |
| (Part-time) DevOps | 0.25 | Initial infra setup, CI, observability. |

Scaling note: when staff grows, split squads as **Identity & Access** (auth + RBAC + org) and **People Ops** (everything else); the boundary is the `audit_logs`/`notifications` envelope.

---

## 8. Versioning & Breaking-Change Policy

- API base path is `/api/v1`. Breaking changes → `/api/v2` only.
- New fields are additive; clients ignore unknown fields.
- Removing a field requires a 90-day deprecation window with a `Sunset` header.
- DB migrations follow expand → backfill → switch → drop; never destructive in a single PR on a multi-tenant table.

---

## 9. Phase 2+ Roadmap (Future Expansion)

The IA, DB, and API are designed to accept the modules below without restructuring. Sequence recommended:

### 9.1 Manager role with team scope (highest leverage; smallest scope)

- Wire the existing `manager` role with `scope = team`.
- Add team-scope filters to leave + attendance approval endpoints.
- Add `EmployeeDirectReport` sub-resource: `GET /me/direct-reports`.
- Add `Team Calendar` for managers.
- No schema changes needed beyond using existing `employees.manager_id`.

### 9.2 Payroll module

- New entities: `pay_components`, `pay_runs`, `pay_run_items`, `payslips`, `salary_history`.
- New permissions: `payroll.*`.
- New top-level sidebar group "Pay" with `/payroll/runs`, `/payroll/components`, `/payroll/payslips`.
- Employee portal adds `/me/payslips`.
- Integrations are country-specific; start with one country, plug-in architecture for tax computation.

### 9.3 Performance management

- Entities: `review_cycles`, `goals`, `goal_check_ins`, `reviews`, `feedback`, `one_on_ones`.
- Permissions: `performance.*`.
- Sidebar: "Performance".

### 9.4 Recruitment (ATS)

- New portal `careers.peopleflow.app` for public job posts.
- Admin portal gains `/recruit/{jobs,candidates,pipelines,interviews,offers}`.
- Conversion path: hire → create employee → invite.

### 9.5 Expense management

- Entities: `expense_categories`, `expense_reports`, `expenses`, `receipts`.
- Workflow mirrors leave (request → approve → reimburse).

### 9.6 Asset management

- Entities: `assets`, `asset_assignments`, `asset_returns`.

### 9.7 Mobile apps (iOS + Android via React Native)

- Reuse `packages/types` + the existing API.
- Share design tokens.
- Push notifications via FCM/APNs replace polling.

### 9.8 Other infrastructure improvements

- WebSocket push notifications.
- Meilisearch for global search (replacing pg trigram).
- Outbox pattern → outbound webhooks → Zapier-style integrations.
- Region pinning per tenant (multi-region).
- SSO (SAML / OIDC) for Enterprise tier.
- Dedicated-database tenancy tier (per `00 § 8.2` future config).

---

## 10. Post-Launch Operations

- **On-call rotation:** weekly, 1 BE.
- **Incident severity:** SEV1 (data loss / outage) → page; SEV2 (degradation) → next business day; SEV3 → backlog.
- **Customer support runbook:** documented in `apps/api/docs/runbook.md` (out of scope here).
- **Quarterly review:** revisit risk register; update.
- **Annual:** external pen test; SOC 2 audit (if pursued).

---

## 11. Cross-reference

- Sprint stories reference screen IDs (`A-EMP-001` …) declared in `01` and detailed in `05`/`06`.
- Permission checks across stories trace to `01 § 10.3`.
- Sprint DoD coverage thresholds tie to `08 § Performance` and `08 § Security`.
