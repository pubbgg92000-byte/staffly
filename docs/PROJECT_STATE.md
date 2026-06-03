# Staffly — Project State

Snapshot generated at the end of **Sprint UI-1.3 (v0.12-ui-dashboard)**.
The doc supersedes any earlier handoff notes; read it top-down on session
resume.

---

## 1. Tags shipped

| Tag                          | Theme                                                         |
| ---------------------------- | ------------------------------------------------------------- |
| `v0.0-planning`              | Architecture + docs/                                          |
| `v0.1-infrastructure`        | Monorepo, CI, Docker compose                                  |
| `v0.2-auth`                  | Auth + RBAC + tenancy (org-bootstrap, JWT, refresh chain)     |
| `v0.3-employee-management`   | Employees + org structure                                     |
| `v0.4-attendance`            | Attendance policies + check-in/out + regularization           |
| `v0.5-leave-management`      | Leave types, balances, requests, approvals                    |
| `v0.6-holidays`              | Holiday calendars + location assignment                       |
| `v0.7-announcements`         | Announcement composer + scheduling + ack tracking             |
| `v0.8-documents-compliance`  | Documents + versioning + MinIO + ack tracking                 |
| `v0.9-dashboards`            | `GET /dashboard/{admin,employee}` aggregations                |
| `v0.10-ui-foundation`        | Shared UI + auth/dashboard route scaffolds (placeholder forms) |
| `v0.11-ui-auth`              | End-to-end authentication for both portals                    |
| **`v0.12-ui-dashboard`**     | **Live dashboard widgets wired to API (this sprint)**         |

## 2. Stack

- Monorepo: pnpm workspaces + Turborepo.
- API: NestJS 10, Prisma 6, PostgreSQL 18 (native `uuidv7()`), argon2id passwords, JWT (HS256) + opaque-refresh chain.
- Frontend: Next.js 15 (App Router), React 19, Tailwind, shadcn-style primitives, TanStack Query 5, react-hook-form + Zod.
- Storage: MinIO (S3 compatible) for documents/files.

## 3. UI-1.3 scope (this sprint)

### Frontend additions

- **`packages/ui/src/api/dashboard.ts`** — NEW. Four hooks:
  - `useAdminDashboard()` — `GET /dashboard/admin`, 30s stale / 60s poll / no background poll.
  - `useEmployeeDashboard()` — `GET /dashboard/employee`, same timing.
  - `useCheckIn()` — `POST /attendance/check-in`; invalidates employee dashboard on success.
  - `useCheckOut()` — `POST /attendance/check-out`; invalidates employee dashboard on success.
- **`packages/ui/src/index.ts`** — exports the four new hooks + `dashboardKeys`.
- **`apps/admin/app/(app)/dashboard/page.tsx`** — `"use client"`. Four live `StatCard`s (total employees, present today, pending approvals, published announcements) + three `WidgetCard`s (upcoming holidays, recent announcements, new hires). Loading skeletons via `WidgetCard loading={}`. Sonner error toast with retry action. First-time empty-tenant copy in the new-hires card.
- **`apps/employee/app/(app)/dashboard/page.tsx`** — `"use client"`. Today status card (shows checked-in time / worked duration + context-sensitive Check in / Check out button wired to mutations). Two `StatCard`s (pending tasks, leave available). Two `WidgetCard`s (announcements with pinned indicator + priority badge, upcoming holidays). Conditional upcoming-leave card.

### No backend changes this sprint.

## 4. Quality gates (verified on this commit)

| Gate                  | Result                                                  |
| --------------------- | ------------------------------------------------------- |
| `pnpm lint`           | 0 errors, 0 warnings in new/changed files               |
| `pnpm typecheck`      | 7/7 packages clean                                      |
| `pnpm test`           | 49 unit tests pass (unchanged)                          |
| `pnpm test:integration` (API) | 168 tests pass (unchanged)                    |

## 5. Files touched this sprint

```
packages/ui/src/api/dashboard.ts                             # NEW — query hooks + check-in/out mutations
packages/ui/src/index.ts                                     # + dashboard hook exports
apps/admin/app/(app)/dashboard/page.tsx                      # live widgets
apps/employee/app/(app)/dashboard/page.tsx                   # live widgets + check-in/out CTA
docs/PROJECT_STATE.md                                        # this file
```

## 6. Database changes

_None this sprint. No schema or migration changes._

Previously (v0.11):
- `password_reset_tokens`, `invites`, `two_factor_challenges` + enums `invite_status`, `two_factor_challenge_kind`.

## 7. Known issues / scope notes

- **bcrypt vs argon2id**: spec asked for bcrypt; we kept argon2id (already in place since v0.2). Documented; not flipped.
- **Email delivery**: still not wired. Forgot-password URL and 2FA OTP are printed to API logs only.
- **Admin invite-create endpoint**: acceptance side live; HR-facing UI for issuing invites deferred to Employees CRUD UI sprint.
- **TOTP enrollment**: schema-ready, dev OTP path is the verify mechanism for now.
- **Logout-everywhere**: implemented as a side-effect of `reset-password`. Standalone UX deferred.

## 8. Local run

```bash
# 1. Bring up infra
docker compose -f infra/docker-compose.dev.yml up -d

# 2. Apply migrations + seed catalog + seed dev users
pnpm --filter @staffly/api prisma:migrate:deploy
pnpm --filter @staffly/api db:seed
pnpm --filter @staffly/api db:seed:dev

# 3. Dev servers
pnpm dev                                                     # all three via Turbo
# or per-app:
pnpm --filter @staffly/api dev                               # http://localhost:4000
pnpm --filter @staffly/admin dev                             # http://localhost:3000
pnpm --filter @staffly/employee dev                          # http://localhost:3001
```

Dev seed users:

| Role          | Email                       | Password       |
| ------------- | --------------------------- | -------------- |
| `super_admin` | `superadmin@staffly.local`  | `Admin@123`    |
| `hr_admin`    | `hr@staffly.local`          | `HR@123`       |
| `manager`     | `manager@staffly.local`     | `Manager@123`  |
| `employee`    | `employee@staffly.local`    | `Employee@123` |

Admin portal accepts super_admin/hr_admin/manager; employee portal accepts employee.

## 9. Next sprint — recommended: UI-2.1 Employees CRUD

Build the Employees list + detail/edit pages in the admin portal:

- `GET /employees` paginated list with search + filter (status, department, designation, location).
- `GET /employees/:id` detail with tabs: Profile, Attendance, Leave, Documents.
- `POST /employees` create + invite flow (wire `AuthService.createInvite()`).
- `PATCH /employees/:id` edit profile fields.
- `POST /employees/:id/offboard` offboarding action.
- Shared `EmployeeAvatar`, `EmployeeStatusBadge` composites in `@staffly/ui`.
- Admin portal nav gains an "Employees" entry.
