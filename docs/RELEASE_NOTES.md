# Staffly Release Notes — v0.23.2 Production-Readiness Sprint

**Branch:** `feat/v0.23.2-prod-readiness` · **Base:** `main` @ `c22b53a` · **Last update:** 2026-06-11
**Theme:** Demo-Ready → Public-Beta-Ready. Production hardening + v1.0 master certification —
no new product modules.

This sprint closes the email-delivery and permission gaps from the v0.23.2 readiness review,
adds the deploy-safety material needed for a public beta, and was followed by a full 17-phase
certification pass (reports under [`docs/certification/`](certification/); go/no-go in
[`PRODUCTION_SIGNOFF.md`](PRODUCTION_SIGNOFF.md)). No org-switching, multi-country, payroll,
or AI work (explicitly out of scope).

## Commits (in order)
| Hash | Summary |
| --- | --- |
| `c5f851a` | chore(prod-safety): gitignore deploy runtime artefacts |
| `a0754c6` | feat(email): provider-agnostic mail delivery + wire core flows |
| `19034e1` | feat(rbac): managers can reject team leave (team-scoped) |
| `4b0d989` | fix(dashboard): anchor "today" in org timezone end-to-end |
| `1d29173` | fix(mailer): prod-fatal validation when chosen provider's creds are missing |
| `0bbc97d` | fix(auth): enforce CSRF on `/auth/refresh` (was a no-op on the `@Public` route) |
| `3297aec` | fix(rbac): enforce manager team scope on by-id reads (BAC) + hr `attendance.policy.write` |
| `e9a557c` | fix(seed): timezone-realistic check-ins + leave/attendance reconciliation |
| `8707dc8` | fix(seed): upload real PDF binaries for seeded documents |
| `2883817` | fix(security): XSS sanitizer + regularization scope + storage-key guard + deactivation revoke |
| `3602723` | feat(config): production boot guards (`COOKIE_DOMAIN`/`APP_BASE_URL`/`EMAIL_FROM`) |
| _(docs)_ | certification suite — DEPLOY_CHECKLIST, PRODUCTION_SIGNOFF, PERFORMANCE_REPORT, SECURITY_REPORT, TEST_EVIDENCE, per-phase reports |

## Features
- **Email delivery (provider-agnostic).** New `MailerModule`: a single `MailerClient.send()`
  contract with four adapters selected by `EMAIL_PROVIDER` — `log` (default; sends nothing),
  `smtp` (nodemailer; Mailhog in dev), `resend`, `mailgun`. A missing credential for the chosen
  provider falls back to `log` so the app always boots. `MailerService.send` is fire-and-forget
  (never throws — a mail outage can't break the triggering request). Wired into: **user invite**
  (create + resend), **password reset**, **welcome** (on invite accept), and **leave
  approve/reject** notifications. Templates are centralized, HTML-escaped, with a plain-text
  fallback. Verified live against Mailhog (see `TEST_EVIDENCE.md`).
- **Managers can reject team leave.** `leave.reject` granted to the manager role at **team
  scope**, enforced row-level by `CallerScopeService` — a manager rejects only their direct/
  indirect reports' requests (403 for outsiders), symmetric with approve.

## Production safety
- **`.gitignore`** now excludes `.backups/` (DB dumps), `.pm2/` (logs), and the real
  `infra/cloudflared/config.yml` (tunnel credentials). `config.example.yml` stays tracked.

## Documentation
- **`DEPLOY_CHECKLIST.md`** — runnable pre-flight (DNS, Tunnel, R2, PM2, Caddy, health, rollback).
- **`PROD_SIGNOFF.md`** — go/no-go certification + readiness score.
- **`TEST_EVIDENCE.md`** — gate output, Mailhog receipts, backup/restore drill, domain-validation transcripts.

## Verification (summary)
Typecheck 7/7 · lint 0 errors · format clean · unit 101/101 · integration 248/248 · API build ✓.
Email: 2/2 Mailhog receipts. Backup→restore: row counts + schema identical (37/37 tables).
Domain: CORS, CSRF (incl. `/auth/refresh`), refresh-rotation+reuse-detection, logout all
pass on localhost. Security: 0×P0/P1, 0×P2 (sanitizer landed), 2×P3 documented. Performance:
PASS at 5 000-employee scale (p95 ≤ 51 ms across five endpoints). Prod boot guards
live-verified (refuse + clean boot).

## Demo accounts (org **Acme Corporation**, `staffly-demo`)
| Role | Email | Password |
| --- | --- | --- |
| Super Admin | superadmin@acme.demo | `DEMO_SUPERADMIN_PASSWORD` (env) |
| HR Admin | hr@acme.demo | `DEMO_HR_PASSWORD` (env) |
| Manager | manager@acme.demo | `DEMO_MANAGER_PASSWORD` (env) |
| Employee | employee@acme.demo | `Employee@123` (published) |

## Known limitations
- **No UI screenshots / visual review** in this environment (no browser automation).
- **Cross-subdomain auth not live-verified** — config-validated only; needs real DNS at deploy.
- **Live provider sends** (Resend/Mailgun) verified by unit tests + Mailhog; not live-sent (no creds).
- **Existing non-demo orgs** would need a one-row backfill `(manager, leave.reject, scope=team)`;
  the demo org gets it via `reset-demo.sh`.

## Upgrade notes
- New env: `EMAIL_PROVIDER` (+ `EMAIL_FROM`, `SMTP_*` / `RESEND_API_KEY` / `MAILGUN_*`). Default
  `log` — no action needed to keep current behavior. See `apps/api/.env.example`.
- Re-seed the demo (`deploy/reset-demo.sh`) to grant managers `leave.reject` and refresh data.
- Nothing is pushed or deployed by this sprint — see `PROD_SIGNOFF.md` for the go/no-go.
