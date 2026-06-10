# Changelog

All notable changes to Staffly. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are the repo's
`vX.Y.Z` sprint tags.

## [Unreleased] — v0.23.2 production-readiness sprint

Branch `feat/v0.23.2-prod-readiness` (local). Demo → Public-Beta hardening; no new modules.

### Features

- **Email delivery (provider-agnostic).** `MailerModule` with `log`/`smtp`/`resend`/`mailgun`
  adapters selected by `EMAIL_PROVIDER` (missing creds → log fallback; fire-and-forget, never
  throws). Wired into invite create/resend, password reset, welcome-on-accept, and leave
  approve/reject notifications. Centralized HTML+text templates. Verified live on Mailhog.
- **Managers can reject team leave.** `leave.reject` granted to the manager role at **team**
  scope (enforced row-level by `CallerScopeService`) — symmetric with approve.

### Production safety

- `.gitignore` excludes `.backups/`, `.pm2/`, and the real `infra/cloudflared/config.yml`
  (tunnel credentials); `config.example.yml` stays tracked.

### Documentation

- New `docs/DEPLOY_CHECKLIST.md`, `docs/RELEASE_NOTES.md`, `docs/PROD_SIGNOFF.md`,
  `docs/TEST_EVIDENCE.md`. Readiness 90 → 93.

### Known Issues (carried)

- Cross-subdomain auth config-validated only (needs real DNS); live email-provider send and R2
  bucket not yet provisioned. Existing non-demo orgs need a one-row `leave.reject` backfill.

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
