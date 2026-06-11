# Changelog

All notable changes to Staffly. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are the repo's
`vX.Y.Z` sprint tags.

## [Unreleased] — v0.23.2 production-readiness sprint

Branch `feat/v0.23.2-prod-readiness` (local). Demo → Public-Beta hardening; no new modules.
A full v1.0 certification pass landed on this same branch on 2026-06-10/11 — every
phase report under [`docs/certification/`](docs/certification/) with the go/no-go in
[`docs/PRODUCTION_SIGNOFF.md`](docs/PRODUCTION_SIGNOFF.md).

### Features

- **Email delivery (provider-agnostic).** `MailerModule` with `log`/`smtp`/`resend`/`mailgun`
  adapters selected by `EMAIL_PROVIDER` (missing creds → log fallback; fire-and-forget, never
  throws). Wired into invite create/resend, password reset, welcome-on-accept, and leave
  approve/reject notifications. Centralized HTML+text templates. Verified live on Mailhog.
- **Managers can reject team leave.** `leave.reject` granted to the manager role at **team**
  scope (enforced row-level by `CallerScopeService`) — symmetric with approve.

### Security hardening (certification phase 13)

- **Stored-XSS sanitizer on announcement `bodyHtml`.** New `sanitizeRichText()` (allowlist
  via `sanitize-html`) applied on create + update. Closes the only P2 from the security audit.
- **CSRF actually enforced on `/auth/refresh`.** The `@Public` decorator previously caused
  `CsrfGuard` to short-circuit; refresh now requires `X-CSRF-Token` (`@EnforceCsrf`).
- **Manager team-scope on regularization decisions.** `RegularizationsService.decide`
  now calls `CallerScopeService.canActOnEmployee()` → 403 outside team (mirrors leave decide).
- **Cross-tenant storage-key guard on document create.** Rejects keys that don't start with
  `uploads/<callerOrgId>/` (400 `document.storage_key_invalid`).
- **Refresh-token revocation on user deactivation.** `users.deactivate` revokes all live
  refresh tokens (`revokeReason: "user_deactivated"`); 15-min access-token residual documented.
- **Manager team-scope BAC on by-id reads** (`employees`, `leave/balances`) — manager
  cannot see employees outside their reporting tree.

### Production safety (certification phase 14)

- **Prod boot guards for `COOKIE_DOMAIN`, `APP_BASE_URL`, `EMAIL_FROM`.** Refuse to boot
  under `NODE_ENV=production` when any of these still hold dev-flavored defaults
  (`localhost`/`@staffly.local`). All violations reported in a single error.
- **`MailerModule` config validation is now prod-fatal.** Boot fails if the chosen provider's
  credentials are missing in production (mirrors the env superRefine pattern).
- `.gitignore` excludes `.backups/`, `.pm2/`, and the real `infra/cloudflared/config.yml`
  (tunnel credentials); `config.example.yml` stays tracked.
- **`/readyz` semantics fix:** liveness vs readiness now distinguished; storage-down
  returns 503 with a per-dependency breakdown.

### Data quality / demo seed

- **Timezone-realistic check-ins.** Seed now writes attendance in each employee's local
  timezone (was UTC across all six seeded locations); leave/attendance contradictions
  reconciled.
- **Real PDF binaries** uploaded for seeded documents (was: `storageKey` row but no MinIO
  object).
- **Dashboard org-tz anchoring** (`v0.23.1` follow-up): "today" computed in the org's tz
  end-to-end.

### Documentation

- New `docs/DEPLOY_CHECKLIST.md`, `docs/RELEASE_NOTES.md`, `docs/TEST_EVIDENCE.md`,
  `docs/PERFORMANCE_REPORT.md`, `docs/PRODUCTION_SIGNOFF.md`, `docs/SECURITY_REPORT.md`,
  plus the per-phase reports under `docs/certification/`. The earlier `docs/PROD_SIGNOFF.md`
  and `docs/DEPLOYMENT_READINESS.md` are kept for history; current sign-off is
  `docs/PRODUCTION_SIGNOFF.md` (Phase 14).

### Known Issues (carried)

- Cross-subdomain auth config-validated only (needs real DNS); live email-provider send
  (Resend/Mailgun) and R2 bucket not yet provisioned.

## [v0.23.2] — 2026-06-09

Public-beta candidate: deployment hardening, demo readiness, and a
pre-production certification pass.

### Features

- **Comprehensive demo seed** (`db:seed:demo`) — deterministic, idempotent
  "Acme Corporation" tenant: 6 locations, 8 departments, 13 designations,
  40 employees with a manager hierarchy, 90 days of attendance (incl.
  in-progress today), 5 leave types, 160 balances, 54 leave requests across
  all states, 6 announcements, 24 documents, 24 notifications.
- **Manager team-scoping (row-level)** — managers (`employee.read`/
  `attendance.read`/`leave.read`/`leave.approve` held at `PermissionScope.team`)
  now see and act on **only their direct + indirect reports**. Enforced via a
  `CallerScopeService` that filters list queries and guards the leave
  approve/cancel paths; org bootstrap stamps the manager's team permissions so
  real signups match the demo org. hr_admin/super_admin keep org-wide access.
- **Session-expiry handling** — any 401 from a data query/mutation clears the
  React Query cache, shows a "Session expired" toast, and hard-redirects to
  sign-in; `logout`/`signout` are now `@Public` so the cookie clear works with
  an expired/invalid token (escaping the cookie-presence middleware loop).
- **Error boundaries** (`error.tsx` + `global-error.tsx`) in both portals with
  a branded fallback + retry.
- **Forbidden state** — admin list pages render a dedicated "Forbidden"
  empty-state on a 403 instead of a generic error.

### Security Enhancements

- **Helmet** security headers on the API.
- **Rate limiting** (`@nestjs/throttler`): global 120/min/IP, auth endpoints
  10/min/IP, keyed on the real client IP (`CF-Connecting-IP`) for use behind
  Cloudflare Tunnel.
- **Real `/readyz`** — probes PostgreSQL + object storage, returns 503 with a
  per-dependency breakdown.

### Infrastructure Changes

- **Cloudflare R2** storage client (AWS SDK v3) replacing the MinIO SDK; same
  `StorageClient` interface and presigned upload/download architecture.
- **Sentry** wired into the API and both portals (no-op without a DSN).
- **CI hardening** — added unit + Testcontainers integration jobs and a
  deployable-artifact job.
- **Deployment assets** — `infra/docker-compose.prod.yml` (PG18), PM2
  `ecosystem.config.cjs`, `infra/Caddyfile`, Cloudflare Tunnel config,
  `deploy/{release,backup,reset-demo}.sh`, `docs/DEPLOYMENT.md`.

### Bug Fixes

- Dashboard now refreshes immediately after employee mutations
  (create/update/delete/restore) and attendance check-in/out — those hooks
  invalidate `dashboardKeys.admin`.
- Demo seed includes **today's** attendance so the admin "Today's attendance"
  widget and live trend point are populated.
- Seed includes recent hires so "New joins this month" is non-zero.

### Known Issues

- **Manager can approve but not reject leave** (`leave.reject` not granted to
  the manager role).
- **Email delivery is not wired** — Mailhog runs in dev but no SMTP send path
  exists; reset/invite links are logged. (A provider abstraction is in
  progress on a side branch, not part of this release.)
- **Announcement `bodyHtml`** is stored and rendered as HTML (privileged
  authors only); sanitize before broadening author scope.
- **Deleted-user session within token TTL** surfaces as a 403 on permissioned
  routes and is intentionally not force-redirected (resolves on token expiry);
  tampered/expired tokens correctly 401 and redirect.

### Upgrade Notes

- Run migrations (`prisma migrate deploy`) and reseed (`db:seed` +
  `db:seed:demo`). The demo seed deletes and recreates **only** the
  `staffly-demo` org; other tenants are untouched. Reseeding rotates demo user
  IDs — existing browser sessions must re-login.
- New env vars: `SENTRY_DSN` (optional). For production set `COOKIE_DOMAIN`,
  `CORS_ORIGINS`, R2 `S3_*`. See `apps/api/.env.example`.

## [v0.23.1] — 2026-06-08

- Fix: employee dashboard and demo seed now use the employee-local calendar
  date for attendance (was UTC), resolving a check-in/dashboard mismatch.

## [v0.23] — 2026-06

- Organization profile + branding + settings UI (`org.settings.*`).

## [v0.22] — 2026-06

- In-app notifications: topbar bell, inbox, unread count.

_Earlier history: see the milestone table in [README.md](README.md)._
