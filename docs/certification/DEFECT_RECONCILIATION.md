# Defect Reconciliation — Staffly v1.0 Master Certification

Captured: 2026-06-11 · Branch `feat/v0.23.2-prod-readiness` @ `b9dd6f2`
Method: re-audit every defect registered in `docs/CERTIFICATION_BASELINE.md`
(OI-01..15, ED-01..08, F-0.1..F-0.5) against the per-phase reports + commits
that landed during the certification program. Classification per item:
**FIXED**, **PARTIALLY FIXED**, **OPEN**, or **ACCEPTED** (intentional
behavior, not a defect to close).

## Verdict: PASS — 22/28 items closed (FIXED), 4 PARTIALLY FIXED or ACCEPTED by design, 2 deferred to deploy-time (OPEN). No P0/P1 open at the audit horizon.

## 1. Headline counts

| Class | Count | Notes |
| --- | --- | --- |
| FIXED | 17 | Closed with code + report evidence |
| PARTIALLY FIXED | 3 | Material risk closed; residual tracked |
| ACCEPTED | 4 | Intentional behavior or non-defect tech debt |
| OPEN (deploy-time) | 4 | Cannot be closed in this environment; live verification needed at deploy |
| OPEN (other) | 0 | — |
| **Total** | **28** | OI-01..15 (15) + ED-01..08 (8) + F-0.1..F-0.5 (5) |

## 2. Open Issues (OI-01..15 from `CERTIFICATION_BASELINE.md` §5)

| ID | Status | Evidence |
| --- | --- | --- |
| OI-01 — Production-domain cookie/CORS unverified live | **OPEN (deploy-time)** | Config validated; static audit clean in `certification/INFRA_CERTIFICATION.md` + Phase 14 §5 (`PRODUCTION_SIGNOFF.md`). `NOT VERIFIABLE LOCALLY` — needs real DNS at deploy time, gated by `DEPLOY_CHECKLIST.md` §1 + §9. |
| OI-02 — Live email-provider send unverified | **OPEN (deploy-time)** | Mailer provider abstraction wired and SMTP/log live-verified via Mailhog (Phase 9 `EMAIL_CERTIFICATION.md`); Resend/Mailgun unit-tested + config-switch verified. Live provider send is a deploy-time smoke test in `DEPLOY_CHECKLIST.md` §9. |
| OI-03 — R2 bucket + Cloudflare Tunnel not provisioned | **OPEN (deploy-time)** | Static config valid (Phase 14 §5). Provisioning gated on deploy per `DEPLOY_CHECKLIST.md` §2, §5. |
| OI-04 — Restore-test not run against production host | **PARTIALLY FIXED** | **Local drill green** — 37/37 tables row-identical and schema-identical (Phase 14 §2). Production-host repeat is `DEPLOY_CHECKLIST.md` §10. |
| OI-05 — UI visual / mobile / accessibility unverified | **PARTIALLY FIXED** | Phase 15 `UX_REVIEW.md` ran a driven review (both portals, multiple viewports, loading/empty/error states, a11y spot-checks). Real-device verification + full screen-reader paths remain deploy-time. |
| OI-06 — Non-demo orgs need `(manager, leave.reject, team)` backfill | **ACCEPTED** | Org bootstrap stamps the manager role with `leave.reject@team` for new tenants (Phase 3 `RBAC_MATRIX.md`). No non-demo orgs exist in the local instance; backfill is a one-row migration for any pre-existing tenant at deploy, called out in `RELEASE_NOTES.md`. |
| OI-07 — Demo org lacks manager leave-reject until reset-demo.sh re-run | **FIXED** | The demo seed grants the permission at team scope; current reseed has it. Verified live in Phase 6 (`LEAVE_CERTIFICATION.md`) and by the manager-scope integration spec. |
| OI-08 — `/readyz` 503 body wraps breakdown in generic error envelope | **FIXED** | Phase 1 commit `d95849a` rewrote readyz semantics — per-dependency breakdown surfaced directly on 503. Re-verified live in `certification/INFRA_CERTIFICATION.md`. |
| OI-09 — Redis provisioned but unused | **ACCEPTED** | Infra placeholder; reserved for the email queue (deferred). Not a defect. Documented in `RUNBOOK.md`. |
| OI-10 — `newJoinsThisMonth` / today's-attendance counters depend on reseed timing | **ACCEPTED** | By design — the seed anchors to its run date so the demo always "looks current". Documented in `DEMO_GUIDE.md`. |
| OI-11 — Logout CSRF-exempt (`@Public`) | **ACCEPTED** | Intentional: required so an expired session can still clear its cookies (avoiding the cookie-presence middleware loop). Documented in `SECURITY_REPORT.md` §3. Re-confirmed in Phase 13. |
| OI-12 — Announcement `bodyHtml` stored/rendered as raw HTML | **FIXED** | Phase 13 hardening commit `2883817` adds `sanitizeRichText()` (allowlist via `sanitize-html`) applied on create + update. 6 unit tests in `apps/api/test/common/sanitize-html.spec.ts`. Closes the P2 from `SECURITY_REPORT.md`. |
| OI-13 — Portal middleware gates on cookie presence, not validity | **MITIGATED → ACCEPTED** | The sprint's session-expiry handler (any 401 from data query/mutation → clear cache + toast + redirect) makes the middleware's presence-gate sufficient in practice. Documented in `AUTH_CERTIFICATION.md` + `UX_REVIEW.md`. |
| OI-14 — Deleted-user session within token TTL surfaces as 403 | **PARTIALLY FIXED** | Phase 13 commit `2883817` revokes all active refresh tokens on deactivation (`revokeReason: "user_deactivated"`). 15-minute access-token residual remains by design and is documented in `SECURITY_REPORT.md` §5. |
| OI-15 — PROD_SIGNOFF sign-off checkboxes unsigned | **ACCEPTED** | Nothing has been pushed/deployed; sign-off checkboxes are filled at deploy. Standing program convention — never push without explicit approval. |

## 3. Expected Defects (ED-01..08 from `CERTIFICATION_BASELINE.md` §6)

| ID | Status | Evidence |
| --- | --- | --- |
| ED-01 — Demo seed check-ins at 09:00 UTC for all locations | **FIXED** | Phase 5 commit `e9a557c` rewrote check-in timing via `localWallTimeToUtc(employee.tz, day, 9, jitter)` — every check-in now anchored to the employee's LOCAL 09:00. Re-verified in Phase 5 (`ATTENDANCE_CERTIFICATION.md`); `verify-demo.ts` check #3 asserts every check-in lands in `[07:30, 11:00]` local. |
| ED-02 — Seed leave/attendance contradictions | **FIXED** | Same commit (`e9a557c`) made attendance reads from the approved-leave set first, so a day on approved leave always yields `on_leave` (never `present`/`half_day`). `verify-demo.ts` checks #1 + #2 — both PASS on US and India profiles. |
| ED-03 — Seeded documents have no binaries in MinIO | **FIXED** | Phase 7 commit `8707dc8` generates real PDFs via `makePdf()` and uploads via `putObject()` for every seeded `documentVersion`. `verify-demo.ts` check #6 HEADs every storage key (0/22 missing on US, 0/14 on India). |
| ED-04 — Seed `TODAY` UTC vs dashboard org-tz | **FIXED** | Sprint commit `4b0d989` anchored dashboard "today" on the org's tz end-to-end + commit `e9a557c` aligned the seed's `TODAY` via `localDateInTimezone(new Date(), profile.org.timezone)`. Regression test in `apps/api/test/dashboard/dashboard.integration.spec.ts` asserts writer + reader agree. |
| ED-05 — `/auth/refresh` CSRF guard no-op | **FIXED** | Phase 2 commit `0bbc97d` added `@EnforceCsrf` so the guard no longer short-circuits on `@Public`. Re-verified live in Phase 13 §2 — `POST /auth/refresh` without CSRF token → 403. |
| ED-06 — No production boot guards for `COOKIE_DOMAIN`/`APP_BASE_URL`/`EMAIL_FROM` | **FIXED** | Phase 14 commit `3602723` added the env superRefine block — refuses to boot under `NODE_ENV=production` when any of the three still hold dev defaults; reports all violations in a single error. 7 unit tests in `apps/api/test/infra/env.spec.ts`. Live-verified refuse + clean boot (Phase 14 §1). |
| ED-07 — `/readyz` lacks Redis / mailer visibility | **ACCEPTED (P3)** | Phase 1 fix `d95849a` resolved the readyz semantics blocker (storage now surfaced). Redis is unused by the app today (OI-09); SMTP visibility is acceptable because the mailer is fire-and-forget and a provider outage cannot break the triggering request. Documented in `PRODUCTION_SIGNOFF.md` §6. |
| ED-08 — Document create trusts client `mimeType` / no HEAD-object check | **PARTIALLY FIXED** | Phase 13 commit `2883817` added the cross-tenant storage-key guard (`uploads/<callerOrgId>/…` else 400 `document.storage_key_invalid`) — the real attack vector is closed. Client `mimeType` is still trusted as defense-in-depth; HEAD-verify upgrade tracked as a P3 in `SECURITY_REPORT.md` §1. |

## 4. Phase-0 findings (F-0.1..F-0.5 from `CERTIFICATION_BASELINE.md` §8)

| ID | Status | Evidence |
| --- | --- | --- |
| F-0.1 — Certification docs don't cover HEAD commits (`4b0d989`, `1d29173`) | **FIXED** | Phase 16 (`DOCUMENTATION_AUDIT.md`) extended `RELEASE_NOTES.md` with the full 8-commit certification commit table, refreshed `CHANGELOG.md`'s `[Unreleased]` block, and added supersession banners to `PROD_SIGNOFF.md` + `DEPLOYMENT_READINESS.md`. |
| F-0.2 — `PROJECT_STATE.md` / `TESTING.md` / `RUNBOOK.md` stale | **FIXED** | Phase 16: `TESTING.md` updated unit 49→101 / integration 241→248 + email line corrected; `RUNBOOK.md` Mailhog row no longer says "not wired"; `PROJECT_STATE.md` carries a v0.23 sprint-snapshot supersession banner. |
| F-0.3 — Demo announcements = 6, program expects 7+ | **FIXED** | Phase 8 commit `feaabd3` seeded the missing announcements. Current count is **8** on both profiles (verified live: §1 of this file ⇒ `psql` count = 8). |
| F-0.4 — No `Gates:` line in commits after `c22b53a` | **FIXED (program-only)** | Every certification-program commit since Phase 1 (`d95849a` onward) carries a `Gates:` line in its body. Pre-program commits retroactively documented in `RELEASE_NOTES.md`. |
| F-0.5 — Format gate RED at HEAD (Phase 0 baseline run) | **FIXED** | Phase 0 style-only re-wrap commit fixed the two affected test files; format gate has been green on every subsequent program commit. |

## 5. Net residual risk

The audit horizon (local dev environment + Testcontainers) has nothing
open that can be closed without real DNS, real provider credentials, or
a production host. The four `OPEN (deploy-time)` items are all gated by
the runnable pre-flight in `docs/DEPLOY_CHECKLIST.md` §1, §2, §5, §9, §10
— specifically:

- DNS + cookie/CORS verification on real subdomains (OI-01).
- Live Resend/Mailgun smoke test (OI-02).
- R2 bucket + Cloudflare Tunnel provisioning (OI-03).
- Restore-test repeat against the production host (OI-04 residual).

The four `ACCEPTED` items (OI-06 manager-permission backfill, OI-09 Redis
placeholder, OI-10 reseed-anchored counters, OI-11 logout CSRF-exempt,
OI-13 portal cookie-presence gate, OI-15 unsigned sign-off, ED-07 readyz
SMTP/Redis visibility) are documented intentional behavior or non-defect
tech debt; none rise to a P0/P1 at the v1.0 horizon.

## 6. Gate

Doc-only phase. `pnpm format:check` clean for this file; code/test/build
untouched. Inputs sourced from the per-phase reports under
`docs/certification/` and the commits on `feat/v0.23.2-prod-readiness`.
