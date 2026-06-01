# 00 — Product Overview: PeopleFlow

> **Status:** Phase 0 — Planning. This is the canonical product brief. All downstream documents (IA, DB, API, UI, Roadmap) must remain consistent with this file. If a downstream doc proposes scope changes, this file is the one to update.

---

## 1. Vision

**PeopleFlow** is a modern, opinionated Human Resource Management System (HRMS) built for small and mid-size businesses (10–500 employees). It replaces the patchwork of spreadsheets, email threads, and disjointed point-tools that SMBs typically use to manage their people, with a single, fast, well-designed product that any non-technical HR lead can operate from day one.

Phase 1 focuses on the operational core: **employees, attendance, leave, documents, announcements, and holidays** — delivered through two purpose-built portals (Admin and Employee Self-Service).

---

## 2. Problem Statement

SMBs in the 10–500 employee range share a common pain pattern:

1. HR data lives in 4–6 different places: Google Sheets, Drive folders, WhatsApp groups, email, a payroll vendor's clunky portal, and the founder's head.
2. Employees can't self-serve basic actions (apply for leave, view payslips, update an emergency contact) without pinging HR.
3. HR spends 30–50% of their time on repetitive admin: chasing documents, computing leave balances, fielding "is tomorrow a holiday?" questions.
4. Existing HRMS products are either (a) built for 1000+ employee enterprises (Workday-like — overkill, expensive, slow to configure), (b) built for one country/regulation only, or (c) feature-bloated SMB suites where the UI feels like it was designed in 2008.

**PeopleFlow's wedge:** an HRMS that feels like a modern SaaS product (Linear-grade UX), ships the 80% of features SMBs actually use, and can be set up by a non-technical HR lead in under an hour.

---

## 3. Target Users & Personas

### 3.1 Persona A — "Priya," the HR Lead

- **Company:** 80-person services company.
- **Role:** Sole HR + Ops generalist; reports to the Founder.
- **Goals:** Reduce time spent on repetitive employee questions; have one source of truth for who works here, who is on leave today, and who hasn't submitted their offer-letter ack.
- **Frustrations:** Toggling between 5 tools; manual leave balance math; no clean way to broadcast announcements.
- **Tech comfort:** Medium — uses Notion and Slack daily; will not write SQL.
- **Primary portal:** **Admin Portal**.

### 3.2 Persona B — "Arjun," the Company Admin / Founder

- **Company:** Same as Priya; he hired her.
- **Role:** Founder / CEO; owns final approval on policies, hiring, and terminations.
- **Goals:** A monthly glance at headcount, attrition, and pending approvals; not in the system daily.
- **Frustrations:** Doesn't want to learn another tool; wants Priya empowered.
- **Primary portal:** **Admin Portal**, infrequent — needs a dashboard that's legible in 30 seconds.

### 3.3 Persona C — "Maria," the Employee

- **Role:** Mid-level individual contributor.
- **Goals:** Check her leave balance, apply for leave, see today's announcements, find her offer letter.
- **Frustrations:** "I just want to know if my leave was approved without messaging Priya."
- **Tech comfort:** Varies — must work for both engineers and non-technical staff.
- **Primary portal:** **Employee Portal**.

### 3.4 Persona D — "Devon," the Department Manager *(Phase 2 — out of scope for Phase 1)*

- Approves leave for direct reports, sees team attendance.
- **Phase 1 stand-in:** all approvals flow to HR Admins.

---

## 4. Business Goals & Success Metrics

| Goal | Metric | Phase 1 Target |
|---|---|---|
| Operational lift for HR | Hours/week HR spends on repetitive admin | −40% within 60 days of adoption |
| Employee self-service adoption | % of leave requests submitted via portal (vs email/Slack) | ≥ 90% by week 4 |
| Time-to-onboard | Days from contract signed to fully onboarded in system | ≤ 1 day |
| Approval turnaround | Median time from leave submission → manager decision | ≤ 24 business hours |
| Document compliance | % of required documents acknowledged by employees | ≥ 95% within 30 days of issue |
| Setup time | Time for a non-technical HR lead to go from signup → first employee invited | ≤ 60 minutes |

---

## 5. Phase 1 Scope (Locked)

### 5.1 Admin Portal — In Scope

1. **Dashboard** — headcount, present today, on leave, pending approvals, upcoming holidays/birthdays, recent announcements, quick actions.
2. **Employee Management** — list, detail (tabs: Overview, Personal, Employment, Documents, Leave, Attendance), invite/onboard, edit, deactivate, bulk CSV import.
3. **Attendance Management** — today's view, historical view, regularization request approvals, monthly summary.
4. **Leave Management** — leave types & policies CRUD, leave requests inbox (approve/reject/comment), per-employee balances view, leave calendar.
5. **Documents** — categories CRUD, upload/distribute org-wide or targeted, mark as "acknowledgment required," track acknowledgments.
6. **Announcements** — compose (rich text), schedule, audience targeting (all/department/location), acknowledgment tracking.
7. **Holiday Management** — multiple holiday calendars (e.g., per location), bulk import, assign to employees.
8. **Settings** — organization profile, working hours/week, leave policies defaults, roles & permissions, branding (logo/color), notification preferences, audit log.

### 5.2 Employee Portal — In Scope

1. **Dashboard** — today's status (checked in?), my next leave, leaves balance summary, pending acknowledgments, announcements, upcoming holidays, team birthdays.
2. **Profile** — view/edit personal info, emergency contacts, addresses, bank info (read-only display in Phase 1), employment history (read-only), documents.
3. **Attendance** — check in/out, my history, request regularization.
4. **Leave Requests** — apply, my history, balances per leave type, my leave calendar.
5. **Documents** — view assigned documents, upload required ones, acknowledge documents.
6. **Announcements** — read, acknowledge.
7. **Holidays** — calendar view of holidays applicable to me.

### 5.3 Out of Scope for Phase 1 (planned for Phase 2+)

- **Payroll** (compensation, payslips, tax computations, statutory filings).
- **Performance management** (OKRs, reviews, 1:1s, feedback).
- **Recruitment / ATS** (jobs, candidates, interviews, offers).
- **Learning & Development** (courses, certifications).
- **Expense management & reimbursements.**
- **Asset management** (laptops, badges).
- **Native mobile apps** (Phase 1 is responsive web).
- **Department Manager role** with delegated approvals (Phase 1 routes all approvals to HR Admins).
- **Integrations** (Slack/Teams/Google Workspace SSO, Zapier, calendar sync).
- **Geofenced / biometric attendance.**
- **Multi-language UI** (English-only in Phase 1; i18n scaffolding present from day one).

See `07-development-roadmap.md` § Future Expansion for sequencing.

---

## 6. Applications

PeopleFlow ships as **one product, two portals, one API**:

| Portal | Purpose | Primary persona | Mount path |
|---|---|---|---|
| **Admin Portal** | Configure the company; manage employees; approve workflows; analyze data. | Priya, Arjun | `admin.peopleflow.app` (or `/admin` in dev) |
| **Employee Self-Service Portal** | Self-serve daily HR actions. | Maria | `app.peopleflow.app` (or `/app` in dev) |

Both portals consume the same REST API (`api.peopleflow.app` / `/api/v1`). They are deployed as **two separate Next.js apps in the monorepo** to allow independent iteration, separate bundle sizes, and clean route ownership. They share a `packages/ui` library for visual consistency.

---

## 7. Tech Stack (Locked)

| Layer | Technology | Why |
|---|---|---|
| Frontend framework | **Next.js 15** (App Router, React 19) | SSR/streaming, file-based routing, mature ecosystem. |
| Language | **TypeScript** (strict) | Type safety across the wire via shared `packages/types`. |
| Styling | **Tailwind CSS** | Velocity; consistent design tokens. |
| Component primitives | **shadcn/ui** (Radix under the hood) | Owned-in-repo, themeable, accessible. |
| Data fetching | **TanStack Query v5** | Caching, optimistic updates, devtools. |
| Forms | **react-hook-form + zod** | Performant, schema-validated, shared client/server schemas. |
| Backend framework | **NestJS 10** | Modular, opinionated, mirrors our domain structure. |
| ORM | **Prisma** | Type-safe queries, migration tooling. |
| Database | **PostgreSQL 16** | Relational integrity, JSONB for flexible fields, row-level security if needed. |
| Cache & queues | **Redis** + **BullMQ** | Email jobs, scheduled reminders, notification fan-out. |
| Object storage | **S3-compatible** (AWS S3 prod, Cloudflare R2 acceptable) | Presigned uploads; cheap and standard. |
| Email | **Postmark** (primary) or **SendGrid** | Transactional deliverability. |
| Auth | **JWT** (access 15 min + rotating refresh 7d, httpOnly cookies) + **RBAC** | Specified. |
| Monorepo | **pnpm workspaces + Turborepo** | Fast incremental builds; shared packages. |
| Infra (suggested) | Vercel (Next.js apps), Fly.io/Render (NestJS), Neon/RDS (Postgres), Upstash (Redis) | Low-ops defaults; swappable. |
| CI/CD | GitHub Actions | Standard. |
| Observability | Pino logs, Sentry errors, OpenTelemetry traces | Production hygiene. |

---

## 8. Constraints & Assumptions

These are explicit so downstream documents stay honest. Flag any deviation in a PR.

### 8.1 Constraints

- **Browser support:** evergreen Chrome, Edge, Firefox, Safari (last 2 versions). No IE11.
- **Performance budget:** First contentful paint ≤ 1.5s on 4G; admin list pages must render ≤ 200ms server-side at 10k employees.
- **Accessibility:** WCAG 2.1 **AA** baseline.
- **Compliance posture:** GDPR-aware data model (soft delete, export, audit log); SOC 2 readiness from day one (audit logs, RBAC, encryption at rest/in transit).
- **Data residency:** Phase 1 single region. Region pinning per tenant is Phase 3.

### 8.2 Assumptions (decisions made by the architect; contestable)

1. **Multi-tenant SaaS.** Single shared database; every domain table carries `organization_id`; tenant guard enforced at the API layer. Rationale: cheaper, faster to ship, sufficient isolation for SMB segment. Row-level security in Postgres deferred unless a customer demands it.
2. **English-only UI** in Phase 1, with i18n keys structured from day one (no hard-coded strings in JSX) so a translation pass is mechanical later.
3. **Timezone handling:** every timestamp stored in UTC; rendered in the user's tz; **organization default tz** set at signup; per-employee tz override allowed.
4. **Email-based identity.** No SSO in Phase 1. Username is always the email. Magic links not used — password + optional TOTP 2FA only.
5. **Auth tokens:** access JWT (15 min) in memory + httpOnly secure cookie; refresh token (7 days, rotating) in httpOnly cookie; CSRF defended via SameSite=Lax + double-submit token for state-changing requests.
6. **File uploads** go directly to S3 via presigned POST; the API only sees metadata. Max file size 25 MB Phase 1.
7. **Background work** (emails, recurring leave accruals, reminder digests) runs on BullMQ workers in the same Node runtime as the API, separate processes.
8. **Soft delete everywhere** (`deleted_at`). Hard delete only via an admin "purge" endpoint behind a 30-day grace period.
9. **No mobile native** in Phase 1; mobile-responsive web only. Architecture is mobile-friendly (REST API, shared types) for an RN client later.
10. **Notification delivery** Phase 1 = email + in-app (poll-based, 30s interval). WebSocket push deferred to Phase 2.

---

## 9. Non-Goals

To prevent scope creep, these are explicit **non-goals** for Phase 1:

- Payroll computation, statutory filings, or tax forms.
- Anything requiring per-country regulation logic beyond holidays and leave types.
- Performance reviews, OKRs, peer feedback.
- Recruiting / job posts / candidate management.
- Time tracking against projects/clients (timesheets).
- Native mobile apps.
- Custom report builder.
- Bring-your-own-database / self-hosted offering.

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scope creep into payroll | High | High | Hard non-goal stated above; weekly scope review. |
| Multi-tenancy data leak via missing `organization_id` filter | Medium | Catastrophic | Tenant guard at API + Prisma extension that injects `organization_id` on every query; e2e tests assert cross-tenant access returns 404. |
| Leave-balance arithmetic bugs (off-by-one, accrual edge cases) | High | Medium | Pure-function policy engine; property-based tests; visible "ledger" UI. |
| Document compliance feature underused | Medium | Medium | Acknowledgment-required flag + dashboard widget; reminder digest job. |
| Initial empty-state experience for new tenant feels barren | High | Low | Ship a "guided setup" checklist on Day-1 admin dashboard. |
| Notification spam erodes trust | Medium | Medium | Per-user notification preferences from v1; digest, not per-event for low-priority events. |

---

## 11. Success Definition for Phase 1 Launch

Phase 1 ships when **all** of the following are true:

1. A new tenant can sign up, configure org settings, invite 10 employees, and have those employees self-serve apply for leave — all without contacting support — in under one hour total elapsed setup time.
2. All Admin and Employee screens listed in §5 are implemented, tested at ≥ 80% line coverage on critical modules (auth, RBAC, leave, attendance), and accessible at WCAG AA.
3. Multi-tenant isolation is verified via dedicated e2e suite.
4. RBAC matrix in `01-information-architecture.md` § RBAC is enforced end-to-end and tested.
5. Backups are automated and tested (one successful restore in staging).
6. p95 API latency under load (200 concurrent users, 10k employees) ≤ 300 ms.

---

## 12. Glossary

| Term | Definition |
|---|---|
| **Organization (Org / Tenant)** | The customer company. Top-level isolation boundary. |
| **User** | An auth principal — has email/password. May or may not be linked to an Employee record. |
| **Employee** | A person who works at the organization. Has employment data. Has *exactly one* User account once invited. |
| **HR Admin** | Default admin role with full HR module access. |
| **Super Admin** | Org owner; can manage roles, billing, dangerous settings. |
| **Manager** | (Phase 2) — approves for direct reports. |
| **Leave Type** | A configurable category of leave (e.g., Casual, Sick, Earned). |
| **Leave Balance** | A ledger entry per (employee, leave type, period). |
| **Leave Request** | An application by an employee for time off. |
| **Attendance Record** | A single day's check-in/check-out + computed worked hours. |
| **Regularization** | An employee request to correct a missed/incorrect attendance record. |
| **Holiday Calendar** | A named set of holidays assignable to employees (typically by location). |
| **Announcement** | An org-published message; optionally acknowledgment-required. |
| **Acknowledgment** | A record that user X confirmed receipt of document/announcement Y at time T. |
| **RBAC** | Role-Based Access Control — roles → permissions → users. |

---

## 13. Document Map

| # | Document | Purpose |
|---|---|---|
| 00 | `00-product-overview.md` | This file — vision, scope, decisions. |
| 01 | `01-information-architecture.md` | Sitemap, routes, navigation, screens, user flows, RBAC matrix. |
| 02 | `02-database-design.md` | Entities, relationships, indexes, constraints, seeds. |
| 03 | `03-api-specification.md` | REST endpoints, request/response shapes, conventions. |
| 04 | `04-design-system.md` | Tokens, components, patterns, accessibility. |
| 05 | `05-admin-portal.md` | Admin screens in implementation detail. |
| 06 | `06-employee-portal.md` | Employee screens in implementation detail. |
| 07 | `07-development-roadmap.md` | Sprint plan, dependencies, future expansion. |
| 08 | `08-technical-architecture.md` | System architecture, deployment, security, observability. |
