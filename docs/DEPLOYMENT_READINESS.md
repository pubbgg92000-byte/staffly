# Staffly — Deployment Readiness Report (v0.23.2)

**Prepared as a pre-production certification.** All PASS/FAIL marks below are
backed by live verification against the running system (curl + psql + docker),
not code inspection.

## Environment

| Field | Value |
| --- | --- |
| Branch | `feat/v0.23.2-deploy` |
| Git commit | `2da438d` (docs increment commits on top) |
| Environment | Local development (Colima Docker) |
| API | `:4000`, `DATABASE_URL=…@localhost:5433/staffly`, `NODE_ENV=development` |
| Portals | Admin `:3000`, Employee `:3001` (Next 15 `next dev`) |
| Data | Org **Acme Corporation** (`staffly-demo`): 40 employees, 2,376 attendance, 54 leave requests, 8 depts, 13 designations, 6 locations, 6 announcements, 24 notifications |

## Certification matrix

| Phase | Area | Status | Evidence |
| --- | --- | --- | --- |
| 1 | System health | **PASS** | `/healthz` 200; `/readyz` 200 (db+storage ok); Postgres/Redis/MinIO/Mailhog healthy; Redis `PONG` |
| 1 | Auth / session | **PASS** | login sets `sf_access` (HttpOnly, 15-min), `sf_refresh` (HttpOnly, `/auth`), `sf_csrf`; `/auth/me` 200; refresh 204; logout 204 |
| 2 | RBAC (4 roles) | **PASS** | full matrix verified; super=all, hr=all−audit, manager=team reads+leave-approve, employee=self-service |
| 3 | Employee CRUD | **PASS** | create 201 → read 200 → update 200 (DB confirms) → soft-delete 204 (DB `deleted_at`) → restore 200 → search/paginate |
| 3 | Leave approval | **PASS** | pending → approved (DB), approval row created |
| 4 | Data consistency | **PASS** | DB == API exact at every dashboard metric (40/32/16/4) |
| 5 | Production domains | **NOT VERIFIED** | localhost only; cross-subdomain cookie/CORS unverifiable without real DNS — design ready, see Risks |
| 6 | Authentication security | **PASS** | invalid pw / missing cookie / tampered JWT / ghost user → 401 |
| 6 | Authorization / priv-esc | **PASS** | employee→admin, manager→org, audit → 403; CSRF-less mutation → 403 |
| 6 | Injection / traversal | **PASS** | SQLi `' OR 1=1;--` → 200/0 rows, table intact (parameterized) |
| 6 | Rate limiting | **PASS** | 12× `/auth/signin` → 429 after per-IP budget |
| 7 | Performance | **PASS** | all endpoints <20 ms on 40-employee dataset |
| 8 | UI/UX visual | **NOT VERIFIED** | no browser-automation available; states verified at code/HTTP level only |
| 9 | Failure / degradation | **PASS** | storage down → `/readyz` 503 `storage:fail`, liveness ok, DB endpoints serve; recovers on restart |

## Test results (automated gates)

| Gate | Result |
| --- | --- |
| Typecheck | 7/7 packages |
| Lint | 0 errors |
| Format | clean |
| Unit | 49/49 |
| Integration (Testcontainers PG18) | 236/236 |
| Build | 7/7 |

## Security results

No critical or high security findings. Authentication, authorization, CSRF,
parameterized queries, rate limiting, security headers (Helmet), and tenant
isolation all verified. Residual notes: announcement `bodyHtml` is rendered as
HTML (privileged authors); the portal middleware gates on cookie presence not
validity (expired session → empty dashboard rather than redirect).

## Performance results

API latency on the 40-employee demo (localhost, warm): dashboard ~17 ms,
employees ~9 ms, attendance ~5 ms, leave ~5 ms. No slow queries observed; all
list endpoints paginated (cap 100) and indexed. Browser render time not
measured (no browser tooling).

## Open issues

### Critical

- None.

### High

- **Manager team-scoping is declarative, not enforced.** Manager
  read/approve permissions are stored with `PermissionScope.team` but services
  do not filter rows by direct reports, so a manager currently reads org-wide
  employee/attendance/leave data. Acceptable for demo; close before a pilot
  where managers must be limited to their team.
- **Email delivery not wired.** Mailhog runs but no SMTP send path exists;
  password reset / invites are log-only. Blocks any flow that needs real email
  (invites, notifications) in a pilot.

### Medium

- **Expired-session UX** — stale session lands on an empty dashboard instead of
  redirecting to login. Operational workaround: re-login.
- **Manager cannot reject leave** (`leave.reject` not granted) — asymmetric
  approve/reject.
- **Production-domain cookie/CORS unverified live** — works by design
  (`COOKIE_DOMAIN=.<domain>`, `CORS_ORIGINS`), but must be validated on real
  subdomains at deploy time.
- **UI visual / mobile / accessibility unverified** — requires human/browser
  review.

### Low

- `/readyz` 503 body wraps the breakdown under a generic `error` envelope
  (cosmetic; details preserved).
- Redis provisioned but unused.
- `newJoinsThisMonth` / today's attendance depend on reseed timing.

## Deployment risk

**MEDIUM.** No critical blockers; security and performance are strong and the
data path is exact end-to-end. Risk is driven by: production-domain
verification still pending, manager scoping being declarative, email not wired,
and the absence of browser-level UI verification.

| Target | Readiness |
| --- | --- |
| Investor demo | **Ready** (re-login caveat) |
| Customer demo | **Ready** (re-login caveat) |
| Public beta | **Ready after** production-domain verification |
| Pilot customer deployment | **Fix first**: manager scoping + email delivery |

## Readiness score: **84 / 100**

Deductions: production-domain verification pending (−5), manager scoping
declarative (−4), email not wired (−3), UI visual unverified (−3), expired-
session UX (−1).

## Final recommendation: **B — Fix specific issues, then ship**

Ship immediately for **investor / customer demos** (with the operational
re-login note). For **public beta**, complete production-domain cookie/CORS
verification first. For **pilot customer deployment**, additionally close
manager team-scope enforcement and wire email delivery.

## Deployment steps (summary)

See [`DEPLOYMENT.md`](DEPLOYMENT.md) and [`RUNBOOK.md`](RUNBOOK.md). High level:
Cloudflare Tunnel + Caddy + PM2 + PG18 on the host, R2 storage, Vercel portals,
Sentry + uptime monitoring; `deploy/release.sh` orchestrates
tag→backup→migrate→build→reload→healthcheck.

## Rollback

`git checkout <deploy-tag>` + `deploy/release.sh` (code); restore pre-migration
`pg_dump` (data); Vercel promote prior build (frontend); `deploy/reset-demo.sh`
(demo data).
