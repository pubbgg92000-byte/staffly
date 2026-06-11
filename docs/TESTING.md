# Staffly — Testing Guide

How Staffly is tested, and how to verify a build before release.

## Test strategy

| Layer | Tooling | Scope |
| --- | --- | --- |
| Unit | Vitest (`pnpm test`) | Pure logic — date/timezone math, dashboard windowing, pagination, redaction, HTML sanitizer, env boot guards. 101 tests. |
| Integration | Vitest + Testcontainers (`pnpm --filter @staffly/api test:integration`) | Full NestJS app against an ephemeral PostgreSQL 18 container; auth, RBAC, tenant isolation, manager team-scoping, session-expiry, every module's CRUD + workflows. 248 tests across 13 specs. |
| Static | `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | Types (7 packages), ESLint, Prettier. |
| Build | `pnpm build` | Turborepo build of API + both Next apps. |
| Manual / live | curl + psql + docker (this doc) | End-to-end role flows, data consistency, security, performance, failure modes. |

### Running the gates

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test
# Integration needs a Docker runtime. With Colima:
DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" \
  TESTCONTAINERS_RYUK_DISABLED=true \
  TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE="$HOME/.colima/default/docker.sock" \
  pnpm --filter @staffly/api test:integration
pnpm build
```

> **Colima note:** Testcontainers does not read the Docker CLI context. If
> `/var/run/docker.sock` is a stale symlink, set `DOCKER_HOST` to the Colima
> socket as above. See `docs/RUNBOOK.md`.

## Manual testing checklist

Run the dev stack and seed (`docs/RUNBOOK.md`), then per role:

- [ ] **Super Admin** — dashboard renders metrics; create/edit/disable/restore
      employee; CRUD departments/designations/locations; approve/reject leave;
      review attendance + regularizations; create/publish announcement; upload
      document; organization + branding settings; audit log; invites.
- [ ] **HR Admin** — same as super admin minus audit log (super-only).
- [ ] **Manager** — sees Dashboard / Employees / Attendance / Leave /
      Announcements / Holidays only; approves leave; **403** on
      org-structure / organization / documents / audit.
- [ ] **Employee** — dashboard; check-in / check-out; apply / cancel leave;
      acknowledge document + announcement; profile; **403** on all admin.
- [ ] After each mutation the relevant list/dashboard updates without a manual
      refresh (re-login if the session has expired — 15-min access TTL).

## RBAC verification matrix (verified live, v0.23.2)

HTTP status by role:

| Endpoint | super | hr | manager | employee |
| --- | --- | --- | --- | --- |
| `/dashboard/admin` | 200 | 200 | 200 | 403 |
| `/dashboard/employee` | 200 | 200 | 200 | 200 |
| `/employees` | 200 | 200 | 200 | 403 |
| `/attendance` | 200 | 200 | 200 | 403 |
| `/leave/requests` | 200 | 200 | 200 | 403 |
| `/departments` `/designations` `/locations` | 200 | 200 | 403 | 403 |
| `/organization` `/organization/settings` | 200 | 200 | 403 | 403 |
| `/audit-logs` | 200 | 403 | 403 | 403 |
| `/holiday-calendars` `/announcements` | 200 | 200 | 200 | 200 |
| `/documents` | 200 | 200 | 403 | 403 |

## Security verification matrix (verified live, v0.23.2)

| Check | Method | Expected | Result |
| --- | --- | --- | --- |
| Invalid password | `POST /auth/signin` wrong pw | 401 | PASS |
| Missing cookie | `GET /auth/me` no cookie | 401 | PASS |
| Tampered JWT | forged `sf_access` | 401 | PASS |
| Privilege escalation | employee → admin endpoints | 403 | PASS |
| CSRF | mutation without `X-CSRF-Token` | 403 | PASS |
| SQL injection | `?search=' OR 1=1;--` | 200, 0 rows, table intact | PASS |
| Rate limiting | 12× `POST /auth/signin` | 429 after budget | PASS |

## Performance verification (verified live, 40-employee dataset)

API latency (localhost, warm; excludes browser render):

| Endpoint | Time |
| --- | --- |
| `/dashboard/admin` | ~17 ms |
| `/employees?pageSize=20` | ~9 ms |
| `/employees?pageSize=100` | ~7 ms |
| `/attendance?pageSize=20` | ~5 ms |
| `/leave/requests?pageSize=20` | ~5 ms |
| `/dashboard/employee` | ~15 ms |

## Failure-mode verification (verified live)

| Failure | Behavior | Result |
| --- | --- | --- |
| Storage (MinIO/R2) down | `/readyz` → 503 `storage:fail`; `/healthz` 200; DB endpoints keep serving | PASS |
| Storage restored | `/readyz` recovers to `storage:ok` | PASS |
| Redis down | No effect (API does not depend on Redis) | PASS |

## Not covered by automation (require human verification)

- Visual UI/UX, responsive layout at specific viewports, real mobile devices.
- Browser-side React Query cache behavior end-to-end (verified at the
  hook/HTTP level, not via a driven browser).
- Cross-subdomain cookie behavior on real production domains (localhost only).
- Live email provider send (Resend/Mailgun): the provider abstraction is
  unit-tested and SMTP delivery is verified live via Mailhog (Phase 9);
  real provider sends are a deploy-time smoke test.

## Certification reports

The full pre-v1.0 audit lives under [`docs/certification/`](certification/) —
one report per phase (auth, RBAC, employee lifecycle, attendance, leave,
documents, notifications, email, dashboards, security, performance, UX). The
production go/no-go is [`docs/PRODUCTION_SIGNOFF.md`](PRODUCTION_SIGNOFF.md).
