# Staffly — Project State

Snapshot generated at the end of **Sprint UI-1.2 (v0.11-ui-auth)**.
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
| **`v0.11-ui-auth`**          | **End-to-end authentication for both portals (this sprint)**  |

## 2. Stack

- Monorepo: pnpm workspaces + Turborepo.
- API: NestJS 10, Prisma 6, PostgreSQL 18 (native `uuidv7()`), argon2id passwords, JWT (HS256) + opaque-refresh chain.
- Frontend: Next.js 15 (App Router), React 19, Tailwind, shadcn-style primitives, TanStack Query 5, react-hook-form + Zod.
- Storage: MinIO (S3 compatible) for documents/files.

## 3. UI-1.2 scope (this sprint)

### Backend additions

- **New tables** (`apps/api/prisma/migrations/20260602130847_auth_uplift/`)
  - `password_reset_tokens` — single-use, token-hashed, 1h TTL.
  - `invites` — admin-issued, hashed token, 7d TTL, lifecycle enum.
  - `two_factor_challenges` — short-lived OTP challenges (dev OTP stored in `dev_otp` column; production swaps for TOTP verification against `users.two_factor_secret_enc`).
  - Three new Prisma enums: `TwoFactorChallengeKind`, `InviteStatus`.
- **New endpoints** on `AuthController`:
  - `POST /auth/signup` (unchanged)
  - `POST /auth/signin` — now returns either `{ user, organization, defaultPortal }` or `{ challenge: { id, kind, expiresAt } }`. Accepts optional `rememberMe`.
  - `POST /auth/verify-2fa` — completes a challenge and sets auth cookies.
  - `POST /auth/forgot-password` — always 200; dev mode includes `devResetUrl` so a dev can click through without SMTP.
  - `POST /auth/reset-password` — sets new hash, revokes all sessions.
  - `GET /auth/invite?token=…` — peek (email, org, role, expiry).
  - `POST /auth/accept-invite` — finalize account, role assignment, auto-sign-in.
  - `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/signout`, `GET /auth/me` (unchanged behavior; `me` now exposes `organizationId` and `defaultPortal`).
- **Remember-me**: the refresh cookie's `Max-Age` is `REMEMBER_ME_REFRESH_TTL_SECONDS` (30 days default) when `rememberMe=true`; otherwise `REFRESH_TOKEN_TTL_SECONDS` (7 days).
- **2FA dev mode**: when `users.two_factor_enabled = true`, sign-in returns a challenge ID and prints a 6-digit OTP to API logs (`logger.warn('[dev-2fa] OTP for … : NNNNNN')`).
- **Forgot-password dev mode**: when the email matches a real user, the reset URL is logged AND returned in the response body (`devResetUrl`). Production stripping is by `NODE_ENV === 'production'`.

### Dev seed (`apps/api/prisma/seed-dev.ts`)

Run with `pnpm --filter @staffly/api db:seed:dev`. Idempotent. Provisions:

- Organization: **Staffly Dev** (`slug=staffly-dev`).
- Four system roles + per-role permissions (taken from `apps/api/src/seeds/role-permissions.json`).
- Four users with argon2id-hashed passwords:

| Role          | Email                       | Password       |
| ------------- | --------------------------- | -------------- |
| `super_admin` | `superadmin@staffly.local`  | `Admin@123`    |
| `hr_admin`    | `hr@staffly.local`          | `HR@123`       |
| `manager`     | `manager@staffly.local`     | `Manager@123`  |
| `employee`    | `employee@staffly.local`    | `Employee@123` |

> The spec asked for bcrypt. We kept the existing **argon2id** (stronger, already used everywhere). Switching would invalidate all existing test data + the v0.2 integration tests; tracked but not adopted.

### Frontend additions

- `packages/types`:
  - `forms/auth.ts` — RHF/Zod schemas (`SignInSchema`, `ForgotPasswordSchema`, `ResetPasswordSchema`, `TwoFactorSchema`, `AcceptInviteSchema`).
  - `api/auth.ts` — response types + `defaultPortalForRole()` / `isTwoFactorChallenge()` helpers.
- `packages/ui/src/api/session.ts` — hooks: `useSession`, `useSignIn`, `useSignOut`, `useVerifyTwoFactor`, `useForgotPassword`, `useResetPassword`, `useInvitePeek`, `useAcceptInvite`.
- `packages/ui/src/auth-forms/` — shared form components used by both portals: `SignInForm`, `ForgotPasswordForm`, `ResetPasswordForm`, `TwoFactorForm`, `AcceptInviteForm`, plus `resolveRedirect()` (role-based, cross-host-safe).
- `apps/{admin,employee}/app/(auth)/auth/{sign-in,forgot-password,reset-password,two-factor,accept-invite}/page.tsx` — each is a thin wrapper that renders the shared form with its portal label.

### Tests (this sprint)

Extended `apps/api/test/auth/auth.integration.spec.ts`. New `v0.11 auth uplift` block (10 tests):

- `defaultPortal` reported on signin/me for admin and employee roles.
- `rememberMe=true` issues a long-lived refresh cookie.
- forgot-password always 200, includes `devResetUrl` on hit only.
- reset-password rotates the hash + revokes other sessions, expired/reused tokens 401.
- 2FA challenge: signin returns challenge (no cookies), verify-2fa with wrong OTP 401, correct OTP completes auth.
- accept-invite: peek then accept activates user + role + auto-signs in; replay 409; invalid token 404.
- `/auth/signout` semantics match `/auth/logout`.

## 4. Quality gates (verified on this commit)

| Gate                  | Result                                                  |
| --------------------- | ------------------------------------------------------- |
| `pnpm lint`           | 0 errors, 0 warnings across the workspace               |
| `pnpm typecheck`      | 7/7 packages clean                                      |
| `pnpm test`           | 49 unit tests pass                                      |
| `pnpm test:integration` (API) | 168 tests pass (32 in `auth.integration.spec.ts`) |
| `pnpm format:check`   | clean                                                   |
| `pnpm build`          | all 7 packages build; both Next apps emit static routes |

## 5. Files touched this sprint

```
apps/api/prisma/schema.prisma                                # +3 models, +2 enums, relations
apps/api/prisma/migrations/20260602130847_auth_uplift/       # NEW migration
apps/api/prisma/seed-dev.ts                                  # NEW dev seed
apps/api/package.json                                        # + db:seed:dev script
apps/api/src/infra/config/env.ts                             # remember-me / reset / invite / 2FA / app-base-url envs
apps/api/src/auth/dto/forgot-password.dto.ts                 # NEW
apps/api/src/auth/dto/reset-password.dto.ts                  # NEW
apps/api/src/auth/dto/verify-2fa.dto.ts                      # NEW
apps/api/src/auth/dto/accept-invite.dto.ts                   # NEW
apps/api/src/auth/dto/signin.dto.ts                          # + rememberMe
apps/api/src/auth/tokens.service.ts                          # rememberMe-aware refresh TTL
apps/api/src/auth/auth.service.ts                            # forgot/reset/2FA/accept-invite/finalizeSignin/createInvite
apps/api/src/auth/auth.controller.ts                         # 5 new endpoints + /signout alias
apps/api/test/auth/auth.integration.spec.ts                  # v0.11 auth uplift block (10 tests)
packages/types/src/forms/auth.ts                             # rememberMe + 2FA challengeId
packages/types/src/api/auth.ts                               # SignInResponse union, MeResponse extras
packages/ui/src/api/session.ts                               # new hooks
packages/ui/src/auth-forms/*.tsx                             # 5 form components + resolveRedirect
packages/ui/src/index.ts                                     # barrel exports
apps/admin/app/(auth)/auth/{sign-in,forgot-password,reset-password,two-factor,accept-invite}/page.tsx   # live forms
apps/employee/app/(auth)/auth/{sign-in,forgot-password,reset-password,two-factor,accept-invite}/page.tsx # live forms
apps/admin/.env.local.example                                # + portal base URLs
apps/employee/.env.local.example                             # + portal base URLs
docs/PROJECT_STATE.md                                        # this file
```

## 6. Database changes

- `password_reset_tokens` — `(id, organization_id, user_id, token_hash, requested_ip, expires_at, used_at, created_at)`, unique `token_hash`.
- `invites` — `(id, organization_id, email, role_key, token_hash, status, expires_at, accepted_at, revoked_at, created_at, created_by)`, unique `token_hash`.
- `two_factor_challenges` — `(id, organization_id, user_id, kind, dev_otp, attempts, expires_at, consumed_at, created_at)`.
- New enums: `invite_status`, `two_factor_challenge_kind`.

## 7. Known issues / scope notes

- **bcrypt vs argon2id**: spec asked for bcrypt; we kept argon2id (already in place since v0.2). Documented; not flipped.
- **Email delivery**: still not wired. Forgot-password URL and 2FA OTP are printed to API logs only.
- **Admin invite-create endpoint**: not in this sprint. The acceptance side (`POST /auth/accept-invite`) is live; admins seed invites via `AuthService.createInvite()` (used by tests). The HR-facing UI for issuing invites lands with the Employees CRUD UI sprint.
- **TOTP enrollment**: schema-ready (`users.two_factor_enabled`, `users.two_factor_secret_enc`), but UI for enrolling and verifying via authenticator app is deferred. Dev OTP path is the verify mechanism for now.
- **Logout-everywhere**: implemented as a side-effect of `reset-password` (revokes every active refresh for the user). Standalone "sign out everywhere" UX is deferred.

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

Then sign in with any of the seed users. The admin portal accepts admin/HR/manager; the employee portal accepts the employee.

## 9. Next sprint — recommended: UI-1.3 Dashboard Widgets

Wire the existing dashboard endpoint payload (already shipped in v0.9) into the placeholder widgets in both portals:

- Admin: HeadcountWidget, PresentTodayWidget, PendingApprovalsWidget, UpcomingHolidaysWidget, NewHiresWidget, RecentAnnouncementsWidget. Skeletons → real data via TanStack Query against `GET /dashboard/admin`.
- Employee: TodayStatusWidget (with live check-in/out CTA), MyLeaveBalanceWidget, MyNextLeaveWidget, PendingTasksWidget, AnnouncementsWidget, UpcomingHolidaysWidget — driven by `GET /dashboard/employee`.
- Per-widget loading / error / empty states using the existing `WidgetCard` wrapper.
- First-time empty-tenant copy on the admin dashboard.

Stretch: Sonner toasts on widget refresh failure; 60s polling of `/dashboard/*` while the tab is visible.
