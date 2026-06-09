# Staffly — Project State

Snapshot generated at the end of **Sprint v0.23 (Organization & Branding)** with
the post-release v0.23.1 attendance-timezone hotfixes applied. The doc
supersedes any earlier handoff notes; read it top-down on session resume.

---

## 1. Tags shipped

| Tag                                       | Theme                                                                |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `v0.0-planning`                           | Architecture + docs/                                                 |
| `v0.1-infrastructure`                     | Monorepo, CI, Docker Compose                                         |
| `v0.2-auth`                               | Auth + RBAC + tenancy (org-bootstrap, JWT, refresh chain)            |
| `v0.3-employee-management`                | Employees + org structure                                            |
| `v0.4-attendance`                         | Attendance policies + check-in/out + regularization                  |
| `v0.5-leave-management`                   | Leave types, balances, requests, approvals                           |
| `v0.6-holidays`                           | Holiday calendars + location assignment                              |
| `v0.7-announcements`                      | Announcement composer + scheduling + ack tracking                    |
| `v0.8-documents-compliance`               | Documents + versioning + MinIO + ack tracking                        |
| `v0.9-dashboards`                         | `GET /dashboard/{admin,employee}` aggregations                       |
| `v0.10-ui-foundation`                     | Shared UI package + auth/dashboard route scaffolds                   |
| `v0.11-ui-auth`                           | End-to-end authentication for both portals                           |
| `v0.12-ui-dashboard`                      | Live dashboard widgets wired to API                                  |
| `v0.13-ui-employees`                      | Employees CRUD — list, create, detail, edit, offboard                |
| `v0.14-ui-attendance`                     | Attendance admin + employee self-service UI                          |
| `v0.15-ui-leave`                          | Leave request, approval, balance UI                                  |
| `v0.16-ui-holidays`                       | Holiday calendar admin + employee view                               |
| `v0.17-ui-announcements`                  | Announcement composer + employee feed UI                             |
| `v0.18-ui-documents`                      | Documents UI — categories, upload, versions, ack                     |
| `v0.18.2-announcements-documents-hardening` | Lifecycle fixes + employee download endpoint + Confirm dialogs    |
| `v0.19-ui-org-structure`                  | Admin org-structure pages + employee "My Org"                        |
| `v0.20-rbac-backend` / `v0.20-ui-rbac`    | Full RBAC + invite API; roles, users, invites admin pages            |
| `v0.20.2-archive-restore`                 | `POST /:resource/:id/restore` across 10 soft-deletable resources     |
| `v0.21-audit-viewer`                      | `GET /audit-logs` + Settings → Audit Log page                        |
| `v0.22-notifications`                     | In-app notifications — bell, inbox, unread count, mark-read          |
| **`v0.23-org-settings`**                  | **Organization profile + branding + settings UI (this sprint)**      |
| `v0.23.1-attendance-tz`                   | Dashboard + seed alignment with employee-local timezone (hotfix)     |

## 2. Stack

- Monorepo: pnpm workspaces + Turborepo.
- API: NestJS 10, Prisma 6, PostgreSQL 18 (native `uuidv7()`), argon2id passwords, JWT (HS256) + opaque-refresh chain.
- Frontend: Next.js 15 (App Router), React 19, Tailwind, shadcn-style primitives, TanStack Query 5, react-hook-form + Zod.
- Storage: MinIO (S3 compatible) for documents, logos, and files.
- Auth/RBAC: `PermissionGuard` reads `@RequirePermission` metadata; permissions sourced from `apps/api/src/seeds/role-permissions.json`.
- Tenant isolation: Prisma client extension at `apps/api/src/tenant/prisma-tenant.extension.ts` auto-scopes `organizationId` on all tenant-rooted models; `Organization` and `Permission` opt out as roots.

## 3. Recent-sprint scope

### v0.22 — Notifications (commit `f63fc06`)

Backend:

- `apps/api/src/notifications/` — service + controller + DTOs + module.
- Endpoints: `GET /me/notifications`, `GET /me/notifications/unread-count`, `POST /me/notifications/read-all`, `POST /me/notifications/:id/read`.
- Every Prisma query scopes by both `organizationId` (auto, via tenant extension) and `userId` (explicit). No `@RequirePermission` decorator — self-scoped to the calling user by design.
- Notification fan-out hooked into the announcement-publish path (`apps/api/src/announcements/`).

Frontend:

- `packages/ui/src/api/notifications.ts` — TanStack Query hooks.
- `packages/ui/src/components/notifications-inbox.tsx` + `packages/ui/src/layouts/notification-bell.tsx` — topbar bell with unread badge + inbox dropdown.
- `packages/ui/src/lib/notification-templates.ts` — channel/title/href renderer.
- `apps/admin/app/(app)/notifications/page.tsx` and `apps/employee/app/(app)/notifications/page.tsx` — full inbox pages.

### v0.23 — Organization & Branding (commits `e2ccc5e`, `b5d8b4f`, `daccc93`, `3b71fe3`, `9ecbffc`)

Backend:

- `apps/api/src/organization/` — service + controller + DTOs + module.
- Endpoints (all under `@RequirePermission('org.settings.read')` or `org.settings.write`):
  - `GET /organization` — profile
  - `PATCH /organization` — profile update
  - `POST /organization/logo/presign-upload` — presigned MinIO PUT
  - `POST /organization/logo` — confirm uploaded key, validates `uploads/<orgId>/logo/…` prefix
  - `GET /organization/settings`
  - `PATCH /organization/settings`
- New permission `org.settings.write` added in `apps/api/src/seeds/role-permissions.json`; granted to `hr_admin` (line 315) and implicitly to `super_admin`.
- `Organization` model opted out of the tenant extension (it IS the tenant root); all reads/writes manually scope via `requireOrg()`.
- `UpdateOrganizationBody` uses Zod `.strict()` — immutable fields (`id`, `slug`, `plan`, `status`, timestamps) cannot be set by clients.
- Audit logging emitted on `organization.update`, `organization.logo.update`, `organization.settings.update`. Presign endpoint does NOT currently audit (open concern).

Frontend:

- `packages/ui/src/api/organization.ts` — profile/settings/logo hooks.
- `packages/ui/src/components/brand.tsx` — extended to render org logo + primary color.
- `apps/admin/app/(app)/settings/organization/page.tsx` — profile form.
- `apps/admin/app/(app)/settings/branding/page.tsx` — logo + primary color editor.

### v0.23.1 — Attendance timezone hotfixes (commits `db06f48`, `fd8254c`)

Two-commit hotfix after a user reported clicking "Check In" produced 400
`attendance.already_checked_in` while the dashboard said "haven't checked in
yet". Root cause: the dashboard read `attendanceRecord` by `startOfDayUTC(now)`
while `AttendanceService.checkIn` writes by `localDateInTimezone(now, employeeTz)`.
For any non-UTC org the two date keys diverge across part of every day.

- `db06f48` — dashboard read switched to employee-local date via `resolveEmployeeTimezone()` + `localDateInTimezone()`. UTC trend windows kept unchanged.
- `fd8254c` — `apps/api/prisma/seed-dev.ts` had the same UTC-vs-local bug; aligned with production. Added regression test in `apps/api/test/dashboard/dashboard.integration.spec.ts` (org tz = `America/Los_Angeles`, asserts writer + reader agree on local date).

Severity: production-impacting for any tenant with a non-UTC timezone. The
dashboard query fix is the user-visible repair; the seed fix prevents the
issue from being reintroduced by dev data.

## 4. Quality gates (verified on `HEAD = fd8254c`)

| Gate                          | Result                                                  |
| ----------------------------- | ------------------------------------------------------- |
| `pnpm typecheck`              | 7/7 packages clean                                      |
| `pnpm lint`                   | 0 errors, 105 warnings (all pre-existing)               |
| `pnpm format:check`           | clean                                                   |
| `pnpm test`                   | 49 unit tests pass (API only — admin/employee are stubs)|
| `pnpm --filter @staffly/api test:integration` | 236 tests pass across 12 files          |

## 5. Files touched across v0.22 + v0.23 + v0.23.1

Net diff `f63fc06^..fd8254c`: **39 files, +3,471 / −42 LOC.**

```
apps/admin/app/(app)/layout.tsx                                      # topbar wires bell
apps/admin/app/(app)/notifications/page.tsx                          # NEW — admin inbox
apps/admin/app/(app)/settings/branding/page.tsx                      # NEW
apps/admin/app/(app)/settings/organization/page.tsx                  # NEW
apps/employee/app/(app)/notifications/page.tsx                       # NEW — employee inbox
apps/api/src/app.module.ts                                           # +NotificationsModule, +OrganizationModule
apps/api/src/auth/auth.module.ts                                     # session-include exports for branding bootstrap
apps/api/src/auth/auth.service.ts
apps/api/src/dashboard/dashboard.service.ts                          # v0.23.1 tz fix
apps/api/src/notifications/                                          # NEW module (controller/service/dto/module)
apps/api/src/organization/                                           # NEW module (controller/service/dto/module)
apps/api/src/seeds/role-permissions.json                             # +org.settings.write
apps/api/src/storage/storage.module.ts                               # presign helpers reused for logo
apps/api/src/tenant/prisma-tenant.extension.ts                       # Organization remains opt-out
apps/api/prisma/seed-dev.ts                                          # v0.23.1 tz fix
apps/api/test/dashboard/dashboard.integration.spec.ts                # +tz regression
apps/api/test/employees/employees.integration.spec.ts                # adapted for organization-settings rollout
apps/api/test/notifications/notifications.integration.spec.ts        # NEW — 16 tests
apps/api/test/organization/organization.integration.spec.ts          # NEW
apps/api/test/rbac/rbac.integration.spec.ts                          # adapted for new permission key
packages/types/src/api/auth.ts                                       # session shape extended with branding
packages/types/src/api/notifications.ts                              # NEW
packages/types/src/api/organization.ts                               # NEW
packages/types/src/index.ts                                          # exports
packages/ui/src/api/notifications.ts                                 # NEW
packages/ui/src/api/organization.ts                                  # NEW
packages/ui/src/api/session.ts                                       # NEW
packages/ui/src/components/brand.tsx                                 # logo + primary color rendering
packages/ui/src/components/notifications-inbox.tsx                   # NEW
packages/ui/src/index.ts                                             # barrel exports
packages/ui/src/layouts/notification-bell.tsx                        # NEW
packages/ui/src/layouts/topbar.tsx                                   # mounts the bell
packages/ui/src/lib/notification-templates.ts                        # NEW
```

## 6. Database changes

Sprint v0.22 added the `Notification` model and its indices (per-user feed,
unread filter). Sprint v0.23 added the `OrgSetting` key/value model and
extended `Organization` with profile + branding columns (`legalName`,
`domain`, `primaryColor`, `logoKey`, `timezone`, `locale`, `currency`,
`weekStart`, `billingEmail`). Both shipped via Prisma migrations under
`apps/api/prisma/migrations/`.

v0.23.1 made no schema changes.

## 7. Known issues / scope notes

Carried forward from previous snapshots (not addressed this sprint):

- **Email delivery still not wired.** Forgot-password URL, 2FA OTP, invite
  acceptance, and now notification deep-links all print to API logs only.
  Mailhog is running in dev but unused. Largest outstanding piece.
- **TOTP enrollment**: schema-ready, dev OTP path is the verify mechanism.
- **bcrypt vs argon2id**: spec asked for bcrypt; argon2id is in place since v0.2.

New / open from the v0.23 audit (none block the release):

- `organization.service.ts:112-119` (`presignLogoUpload`) does not emit an
  audit log entry. The other three org mutations do. Low severity.
- Missing integration coverage: cross-tenant PATCH denial on `/organization`,
  `manager` role 403 on org settings, cross-user `unread-count` isolation.
- 8 unused / single-consumer exports in `packages/ui/src/api/organization.ts`,
  `packages/ui/src/lib/notification-templates.ts`,
  `packages/types/src/api/organization.ts`, and
  `apps/api/src/notifications/notifications.service.ts` — either tighten the
  public surface or document the intent.
- 11 permission keys defined in `role-permissions.json` are not yet referenced
  by any `@RequirePermission` decorator (Phase 2 / future scope):
  `org.setup`, `attendance.write`, `attendance.export`,
  `leave.{create,update,cancel,export}`, `employee.{import,export}`,
  `employee.documents.{read,write}`.

## 8. Local run

See [`RUNNING.md`](../RUNNING.md) for the full prerequisites + first-time
setup + per-app commands + troubleshooting. Short form:

```bash
docker compose -f infra/docker-compose.dev.yml up -d
pnpm --filter @staffly/api prisma:migrate:deploy
pnpm --filter @staffly/api db:seed
pnpm --filter @staffly/api db:seed:dev
pnpm dev
```

Dev seed users:

| Role          | Email                      | Password       |
| ------------- | -------------------------- | -------------- |
| `super_admin` | `superadmin@staffly.local` | `Admin@123`    |
| `hr_admin`    | `hr@staffly.local`         | `HR@123`       |
| `manager`     | `manager@staffly.local`    | `Manager@123`  |
| `employee`    | `employee@staffly.local`   | `Employee@123` |

Admin portal accepts super_admin / hr_admin / manager. Employee portal accepts employee.

## 9. Roadmap status

The product roadmap (`docs/07-development-roadmap.md`) Phase 1 milestones
are now substantially complete: Auth, Employees, Org Structure, Attendance,
Leave, Holidays, Announcements, Documents, Dashboards, RBAC, Audit Log,
Notifications, and Organization Settings have shipped across both backend
and admin/employee UI. The remaining Phase 1 items are:

- **Email delivery** (cross-cutting; see Known issues).
- **Reporting / exports** for attendance, leave, employee directory — the
  unenforced `*.export` permissions are placeholders for this.
- **Bulk employee import** — the `employee.import` permission placeholder.
- **TOTP enrollment UX** — backend is schema-ready; admin/employee flow not built.

Phase 2 work (payroll, performance reviews, surveys, mobile) has not been
scoped beyond the original docs.

## 10. Next sprint — recommended: v0.24 Email delivery

Pick Email next because it is the longest-outstanding cross-cutting gap
(known since v0.12) and unblocks four user-visible flows that already exist
but only print to logs: forgot-password reset link, 2FA OTP, invite
acceptance, and notification deep-links.

Suggested scope:

- Provider integration (Resend or AWS SES — pick one; both fit the current
  abstraction). Mailhog stays as the dev sink via `SMTP_HOST/PORT` env vars.
- `apps/api/src/email/` module with a single `MailerService`: `send(template, to, vars)`.
- Templates as MJML or React Email components under `apps/api/src/email/templates/`.
- Outbound queue using BullMQ (Redis is already in the dev stack) so a slow
  provider does not block request paths.
- Wire the four existing emit sites: `AuthService.requestPasswordReset`,
  `AuthService.requestTwoFactor`, `AuthService.createInvite`,
  notification fan-out (opt-in per user via a new
  `Notification.emailDeliveredAt` flag).
- Audit-log entries for every queued send.
- Integration tests against Mailhog's HTTP API.

Alternative candidates if email is not the priority:

- **v0.24-reports** — first reporting/export endpoint, scoped to a single
  resource (attendance or leave) to validate the pattern.
- **v0.24-totp** — admin/employee enrollment UX on top of the existing
  schema.
- **v0.24-import** — bulk employee CSV import.
