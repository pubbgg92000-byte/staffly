# Changelog

All notable changes to Staffly. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are the repo's
`vX.Y.Z` sprint tags.

## [v0.23.2] — 2026-06-09

Public-beta candidate: deployment hardening, demo readiness, and a
pre-production certification pass.

### Features

- **Comprehensive demo seed** (`db:seed:demo`) — deterministic, idempotent
  "Acme Corporation" tenant: 6 locations, 8 departments, 13 designations,
  40 employees with a manager hierarchy, 90 days of attendance (incl.
  in-progress today), 5 leave types, 160 balances, 54 leave requests across
  all states, 6 announcements, 24 documents, 24 notifications.
- **Manager role** now has team-scoped reads (`employee.read`,
  `attendance.read`, `leave.read`) and `leave.approve`. (Row-level team
  filtering is recorded via `PermissionScope.team`; enforcement ships in a
  later phase — see Known Issues.)
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

- **Manager team-scoping is declarative only.** The manager's read/approve
  permissions are stored with `PermissionScope.team`, but services do not yet
  filter rows by the manager's direct reports — so in this release a manager
  sees org-wide employee/attendance/leave data. True team-scope enforcement is
  planned for a later phase.
- **Manager can approve but not reject leave** (`leave.reject` not granted).
- **Expired/stale session UX**: the portal middleware gates on cookie
  _presence_, not validity. An expired session (access TTL 15 min) lands on a
  dashboard whose data queries 401 rather than redirecting to login. Fix:
  re-login. (Hardening candidate.)
- **Email delivery is not wired** — Mailhog runs in dev but no SMTP send path
  exists; reset/invite links are logged.
- **Announcement `bodyHtml`** is stored and rendered as HTML (privileged
  authors only); sanitize before broadening author scope.

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
