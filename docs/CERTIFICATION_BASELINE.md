# Phase 0 — Certification Baseline (Staffly v1.0 Master Certification Program)

Captured: **2026-06-10T11:49:28Z** (17:19 IST) · Auditor: certification program, Phase 0 of 17
Scope: baseline discovery only — no code changes. Evidence hierarchy: DB → API → UI → logs → source.

## Verdict: PASS (baseline established; 5 findings, none blocking)

| # | Baseline item | Result | Evidence |
| --- | --- | --- | --- |
| 0.1 | Current branch | **PASS** — `feat/v0.23.2-prod-readiness` | `git branch --show-current` |
| 0.2 | Current commit | **PASS** — `1d29173` fix(mailer): boot-time provider validation; fatal in production (2026-06-10 16:43 IST), working tree clean (0 modified) | `git log -1`, `git status --porcelain` |
| 0.3 | Running services | **PASS** — all 7 up (see §1) | docker compose ps, HTTP probes |
| 0.4 | Demo tenant dataset | **PASS with deviation** — matches expected counts except announcements 6 < expected 7+ (F-0.3) | SQL snapshot §2 |
| 0.5 | Demo accounts | **PASS** — 4 program accounts present + `new.hire@acme.demo` (employee, seeded recent-hire) | SQL §3 |
| 0.6 | Migrations | **PASS** — 8 applied, latest `20260602141351_holidays`, no pending | `_prisma_migrations`, `prisma migrate deploy` |
| 0.7 | Commits after `c22b53a` | **PASS** — 6 commits inventoried (§4); none documented with a `Gates:` body line (F-0.4) | `git log c22b53a..HEAD` |
| 0.8 | Existing open issues | **PASS** — 15 open items extracted into the register (§5) | docs cited per item |
| 0.9 | Existing docs | **PASS with findings** — 20 docs inventoried; 2 HEAD commits undocumented (F-0.1), 4 docs stale (F-0.2) | §6 |
| 0.10 | Production-readiness work to date | **PASS** — documented score 93/100 (`DEPLOYMENT_READINESS.md:119`, `PROD_SIGNOFF.md:34`); trajectory 84→90→93; an earlier conversational audit scored 72/100 (uncommitted — reconciled in final report) | §7 |
| 0.11 | Quality gates at HEAD | **PASS after in-phase fix** — format gate was RED at HEAD (F-0.5, fixed); verified counts re-baselined in §8a | gate runs 2026-06-10 |

## 1. Running services

| Service | Where | Status | Evidence |
| --- | --- | --- | --- |
| API (NestJS) | :4000 | UP | `/healthz` 200; `/readyz` 200 `{"database":"ok","storage":"ok"}` |
| Admin portal (Next 15.5.18) | :3000 | UP | HTTP 307 (auth redirect) |
| Employee portal (Next 15.5.18) | :3001 | UP | HTTP 307 (auth redirect) |
| Postgres | :5433 | UP (healthy) | `postgres:18-alpine`, compose ps |
| Redis | :6379 | UP (healthy) | `redis:7-alpine` — provisioned, unused by app (OI-09) |
| Mailhog | :1025/:8025 | UP | HTTP 200 on :8025 |
| MinIO | :9000/:9001 | UP (healthy) | `/minio/health/live` 200 |

Runtime: Node v22.22.2, pnpm 11.5.0, Docker via Colima. PM2 / Caddy / Cloudflare Tunnel: **not running locally** (production-host artifacts; static config audit scheduled for Phase 1).

## 2. Demo tenant dataset snapshot (`staffly-demo` / Acme Corporation)

Pinned org ID `019e0000-0000-7000-8000-000000000001`, timezone `America/New_York`. Second org `staffly-dev` (4 employees) exists for dev logins and serves as the cross-tenant probe in Phase 11.

| Entity | Expected (program) | Actual | Match |
| --- | --- | --- | --- |
| Employees | 40 | 40 | YES |
| Attendance records | ~2377+ | 2377 | YES |
| Leave requests | ~60 | 60 | YES |
| Leave balances | 160 | 161 | YES (~) |
| Departments | 8 | 8 | YES |
| Designations | 13 | 13 | YES |
| Locations | 6 | 6 | YES |
| Announcements | 7+ | **6** | **NO — F-0.3** |
| Notifications | 24+ | 24 | YES |
| Documents | — | 16 | n/a |
| Holidays | — | 12 | n/a |
| Regularizations | — | 6 | n/a |

## 3. Demo accounts (DB-verified)

| Email | Role | Password source |
| --- | --- | --- |
| superadmin@acme.demo | super_admin | `DEMO_SUPERADMIN_PASSWORD` |
| hr@acme.demo | hr_admin | `DEMO_HR_PASSWORD` |
| manager@acme.demo | manager | `DEMO_MANAGER_PASSWORD` |
| employee@acme.demo | employee | `DEMO_EMPLOYEE_PASSWORD` (default `Employee@123`) |
| new.hire@acme.demo | employee | seeded recent-hire (not a program account) |

Source: `users ⋈ user_roles ⋈ roles` for `%acme.demo`; seed mapping at `apps/api/prisma/seed-demo.ts:556-589`.

## 4. Commits after `c22b53a` (oldest first)

| Sha | Subject | Claims | Documented in certification docs? |
| --- | --- | --- | --- |
| `c5f851a` | chore(prod-safety): gitignore deploy runtime artefacts | ignore `.backups/`, `.pm2/`, tunnel creds | Yes (TEST_EVIDENCE.md:4) |
| `a0754c6` | feat(email): provider-agnostic mail delivery + wire core flows | 4 adapters, wires invite/reset/welcome/leave, Mailhog-verified, 14 files +619/−137 | Yes |
| `19034e1` | feat(rbac): managers can reject team leave (team-scoped) | `leave.reject` @ team scope + integration test | Yes |
| `0c5690f` | docs(prod-readiness): deploy checklist + certification suite | docs only, score 90→93 | Yes (is the doc commit) |
| `4b0d989` | fix(dashboard): anchor day boundaries on tenant-local dates, not UTC | org-tz/employee-tz day anchoring, frozen-clock + integration tests, 4 files +218/−18 | **NO — F-0.1** |
| `1d29173` | fix(mailer): boot-time provider validation; fatal in production | prod boot refusal on unset EMAIL_PROVIDER; 5 flows Mailhog-verified | **NO — F-0.1** |

None of the six carries a `Gates:` line in its body (F-0.4); gate counts live in `docs/TEST_EVIDENCE.md` instead, captured **before** `4b0d989`/`1d29173`.

## 5. Open-issues register (from committed docs — input to Defect Reconciliation)

| ID | Sev (as stated) | Issue | Source |
| --- | --- | --- | --- |
| OI-01 | High | Production-domain cookie/CORS unverified live (localhost-only validation) | DEPLOYMENT_READINESS.md:79-81; PROD_SIGNOFF.md:46 |
| OI-02 | High | Live email-provider send unverified (Mailhog only; Resend/Mailgun never live-sent) | DEPLOYMENT_READINESS.md:82-83; PROD_SIGNOFF.md:47 |
| OI-03 | High | R2 bucket + Cloudflare Tunnel not provisioned (placeholders) | DEPLOYMENT_READINESS.md:83; PROD_SIGNOFF.md:48 |
| OI-04 | Blocker (deploy-time) | Restore-test not run against production host (local drill passed) | PROD_SIGNOFF.md:49 |
| OI-05 | Medium | UI visual / mobile / accessibility unverified (no browser automation to date) | DEPLOYMENT_READINESS.md:87-88 |
| OI-06 | Medium | Non-demo orgs need `(manager, leave.reject, team)` permission backfill | DEPLOYMENT_READINESS.md:89-90 |
| OI-07 | — | Demo org lacks manager leave-reject until `reset-demo.sh` re-run | RELEASE_NOTES.md:59 |
| OI-08 | Low | `/readyz` 503 body wraps breakdown in generic error envelope | DEPLOYMENT_READINESS.md:94-95 |
| OI-09 | Low | Redis provisioned but unused | DEPLOYMENT_READINESS.md:96 |
| OI-10 | Low | `newJoinsThisMonth` / today's-attendance counters depend on reseed timing | DEPLOYMENT_READINESS.md:97-98 |
| OI-11 | Low | Logout CSRF-exempt (`@Public`) — forced-logout nuisance, flagged for security review | DEPLOYMENT_READINESS.md:99-101 |
| OI-12 | — | Announcement `bodyHtml` stored/rendered as raw HTML (privileged authors only) | DEPLOYMENT_READINESS.md:52-53; CHANGELOG.md:98-99 |
| OI-13 | — | Portal middleware gates on cookie presence, not validity | DEPLOYMENT_READINESS.md:53-54 |
| OI-14 | — | Deleted-user session within token TTL surfaces as 403, not force-redirect | CHANGELOG.md:100-102 |
| OI-15 | — | PROD_SIGNOFF sign-off checkboxes unsigned (nothing pushed/deployed) | PROD_SIGNOFF.md:62-64 |

## 6. Expected defects (from pre-certification source exploration — to re-verify with evidence in the named phases)

| ID | Expected defect | Surfaces in |
| --- | --- | --- |
| ED-01 | Demo seed check-ins at 09:00 **UTC** for all locations (`atHour()`, `seed-demo.ts:104`) — SF staff "check in" ~01:00 local | Phase 5 |
| ED-02 | Seed generates leave and attendance independently → present-during-approved-leave contradictions (`seed-demo.ts:800-857` vs `900-949`) | Phases 5, 6 |
| ED-03 | Seeded documents have no binaries in MinIO (storageKey written, nothing uploaded; `seed-demo.ts:1103-1195`) | Phase 7 |
| ED-04 | Seed `TODAY` anchored to UTC date vs dashboard anchored to org tz — evening-run divergence | Phases 5, 10 |
| ED-05 | `/auth/refresh` CSRF guard likely no-op (`@Public()` short-circuits `CsrfGuard`) | Phases 2, 11 |
| ED-06 | No production boot guard for `COOKIE_DOMAIN` (default `localhost`), `APP_BASE_URL`, `EMAIL_FROM` (`env.ts`; mailer pattern exists) | Phases 1, 11, 13 |
| ED-07 | `/readyz` lacks Redis/mailer visibility | Phase 1 |
| ED-08 | Document create trusts client `mimeType`; no HEAD-object existence check | Phases 7, 11 |

## 7. Documentation inventory

20 docs found. Certification-relevant state:

- **Current**: DEMO_GUIDE.md, DEPLOY_CHECKLIST.md, DEPLOYMENT.md, RUNBOOK.md (1 stale line), 9 numbered design docs (00–08; `00` still titled "PeopleFlow"), docs/releases/v0.23.2.md (frozen at tag — fine as history).
- **Current with caveats**: DEPLOYMENT_READINESS.md, PROD_SIGNOFF.md, TEST_EVIDENCE.md, RELEASE_NOTES.md — all predate `4b0d989`/`1d29173`; gate counts (unit 56/56, integration 242/242) captured before those commits; RELEASE_NOTES.md:22-24 still claims mailer "falls back to log so the app always boots", contradicted in production by `1d29173` (F-0.1).
- **Stale**: PROJECT_STATE.md (v0.23.1 snapshot; says email "not wired"), TESTING.md (quotes 49 unit / 241 integration; "email not wired" in Not-covered) (F-0.2).
- **Program outputs**: none exist yet (`docs/certification/`, CERTIFICATION_BASELINE.md, DEMO_SCRIPT.md, CERTIFICATION_REPORT.md, RELEASE_READINESS.md, SECURITY_REPORT.md, PERFORMANCE_REPORT.md, PRODUCTION_SIGNOFF.md). Note the near-name collisions with existing PROD_SIGNOFF.md / DEPLOYMENT_READINESS.md / DEMO_GUIDE.md — program docs will cross-link rather than duplicate.

Environment contract: 32 vars in the zod schema (`apps/api/src/infra/config/env.ts`) — 2 required (`DATABASE_URL`, `JWT_SECRET`), the rest defaulted/optional; `EMAIL_PROVIDER` deliberately has **no** default since `1d29173` (fatal in production when unset). Names-only inventory verified against `.env.example`; no secrets recorded here.

## 8. Phase 0 findings

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| F-0.1 | P2 | Certification docs do not cover HEAD: `4b0d989` (dashboard tz anchor) and `1d29173` (mailer prod-fatal) absent from TEST_EVIDENCE/RELEASE_NOTES/PROD_SIGNOFF; RELEASE_NOTES contradicts `1d29173` | Fix in Phase 15 (documentation certification); gate counts re-baselined in §8a |
| F-0.2 | P3 | PROJECT_STATE.md and TESTING.md stale (old counts; "email not wired"); RUNBOOK.md one stale Mailhog line | Fix in Phase 15 |
| F-0.3 | P3 | Demo announcements = 6, program expects 7+ | Re-check in Phase 8; reconcile expected-dataset table or seed |
| F-0.4 | P3 | No `Gates:` line in any commit after `c22b53a` (convention drift) | Program commits resume the convention from this phase onward |
| F-0.5 | P2 | Format gate RED at HEAD: `4b0d989` committed two test files unformatted (`apps/api/test/dashboard/dashboard.integration.spec.ts`, `local-day-anchor.spec.ts`) — that commit skipped at least the format gate | **FIXED in Phase 0** (prettier-only re-wrap, no semantic change; separate `style(test)` commit) |

## 8a. Verified gate baseline (this phase, full suite at HEAD + format fix)

| Gate | Documented (0c5690f) | Verified 2026-06-10 |
| --- | --- | --- |
| typecheck | 7/7 | **7/7 PASS** |
| lint | 0 errors | **0 errors PASS** (114 pre-existing warnings, all `consistent-type-imports`/unused-var class) |
| format | clean | **clean PASS** (after F-0.5 fix; was RED at HEAD) |
| unit | 56/56 | **73/73 PASS** (6 files; +14 local-day-anchor from `4b0d989`, +3 mailer from `1d29173`) |
| integration | 242/242 | **243/243 PASS** (13 files, Testcontainers PG18; +1 from `4b0d989`) |
| build | success | **7/7 PASS** |

## 9. Baseline limitations

- PM2, Caddy, Cloudflare Tunnel, R2, Resend/Mailgun: **NOT VERIFIABLE LOCALLY** — static config audits planned (Phases 1, 13); live items remain deploy-time blockers (OI-01..04).
- The 72/100 pre-sprint score exists only in conversational history, not in any committed artifact; the committed trajectory is 84 → 90 → 93. Final report reconciles both against this program's own rubric.
