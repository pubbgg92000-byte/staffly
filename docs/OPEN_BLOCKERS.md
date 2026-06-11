# Open Blockers & Findings — RC-1 Inspection (2026-06-11)

Single authoritative list of everything still open after the RC-1
inspection (Phases 1–9, `docs/certification/RC_*.md` +
`DEMO_ACCOUNT_CERTIFICATION.md`, `DEMO_JOURNEY_CERTIFICATION.md`).
Baseline: v1.0 certification HEAD `1c63d62` (94/100, CONDITIONAL GO).

Severity scale: P0 blocker · P1 major · P2 should-fix-before-prod ·
P3 minor/cosmetic · P4 nit.

## 1. Code hardenings (fix before production deploy)

| ID | Sev | Finding | Impact | Fix & effort |
| --- | --- | --- | --- | --- |
| RC-05 | **P2** | Raw password-reset URL (live token) logged via `logger.warn` in ALL environments (`apps/api/src/auth/auth.service.ts:407-409`); response body is prod-stripped but the log line is not | prod log reader → account takeover within token TTL | gate the warn on `NODE_ENV !== "production"` — **~5 min** |
| RC-01-residual | **P2** | `seed-demo.ts` reads only `process.env` (no dotenv); reseed without `DEMO_*_PASSWORD` exported regenerates random admin passwords — **this bit us live**: 3 of 4 demo logins were dead until remediated (Phase 2, `DEMO_ACCOUNT_CERTIFICATION.md` §3) | next reseed can silently kill investor-demo logins again | (a) `deploy/reset-demo.sh` fail-fast when vars unset, or (b) seed loads `apps/api/.env` — **~15 min** |

## 2. Demo-cosmetic (fix or narrate around)

| ID | Sev | Finding | Impact | Fix & effort |
| --- | --- | --- | --- | --- |
| RC-02 | P3 | Check-out accepted before check-in (`worked_minutes=0`, `status=half_day`); enabled by seed writing today's check-in at local 09:00 ahead of wall-clock (`seed-demo.ts:771-778`); API lacks negative-duration guard | early-morning demo can show a 0-min half-day for today | reject `checkOutAt < checkInAt` in service + seed only past check-ins — **~30 min** |
| RC-03 | P3 | Leave approve/reject creates **no in-app notification** (0 rows; email-only — Mailhog verified) | notification bell doesn't react during the approval demo beat | demo script: show Mailhog/email instead; feature fix later — **script note now** |
| RC-04 | P4 | Seed half-day branch never computes `is_late` — 32/2,260 rows check in past grace but show on-time (`seed-demo.ts:790-793`); live service is correct | trivial data inconsistency if someone inspects half-day rows | one line in seed — **~5 min** |
| OBS-1 | P4 | `attendanceToday` buckets don't sum to headcount mid-day (not-yet-checked-in employees in no bucket) | presenter confusion only | narrate; or add a "not checked in" bucket later |
| OBS-2 | P4 | `attendanceLast7Days` renders weekends as `absent`/0 min (`weekoff` enum value exists but gap-fill says absent) | "why was Alex absent Saturday?" | gap-fill weekends as `weekoff` — **~20 min** |

## 3. Deploy-time gates (NOT VERIFIABLE LOCALLY — by nature)

Unchanged from v1.0 reconciliation; all four are checklist-gated, none
testable before a real deploy.

| ID | Gate | Checklist |
| --- | --- | --- |
| OI-01 | prod-domain cookie/CORS live verification | `DEPLOY_CHECKLIST.md` §1, §9 |
| OI-02 | live email-provider send (Resend/Mailgun) | §9 |
| OI-03 | R2 bucket + Cloudflare Tunnel provisioning | §2, §5 |
| OI-04 | restore drill against the production host (local drill re-run GREEN this inspection) | §10 |

## 4. Carried v1.0 P3s (documented, unchanged)

- Dashboard query fan-out under load (perf P3, `PERFORMANCE_REPORT.md` —
  PASS @5000 employees regardless).
- Two Phase-14 deploy P3s (see `PRODUCTION_SIGNOFF.md`).
- ED-07 readyz Redis/mailer visibility — ACCEPTED (P3).

## 5. Closed during this inspection

| ID | Was | Disposition |
| --- | --- | --- |
| RC-01 | P1 — 3 of 4 demo admin passwords drifted from `.env` (random seed passwords); demo dead on arrival | **REMEDIATED live** (hashes re-aligned with seed's argon2id params, `failed_login_count` reset, full auth matrix re-verified PASS); residual tracked above |

**Open totals: 0 × P0 · 0 × P1 · 2 × P2 · 2 × P3 · 3 × P4 · 4 × deploy-time gates.**
