# Staffly Release Notes — v0.23.2 Production-Readiness Sprint

**Branch:** `feat/v0.23.2-prod-readiness` · **Base:** `main` @ `c22b53a` · **Date:** 2026-06-10
**Theme:** Demo-Ready → Public-Beta-Ready. Production hardening only — no new product modules.

This sprint closes the email-delivery and permission gaps from the v0.23.2 readiness review and
adds the deploy-safety + certification material needed for a public beta. No org-switching,
multi-country, payroll, or AI work (explicitly out of scope).

## Commits
| Hash | Summary |
| --- | --- |
| `c5f851a` | chore(prod-safety): gitignore deploy runtime artefacts |
| `a0754c6` | feat(email): provider-agnostic mail delivery + wire core flows |
| `19034e1` | feat(rbac): managers can reject team leave (team-scoped) |
| _(docs)_ | certification suite (this file, DEPLOY_CHECKLIST, PROD_SIGNOFF, TEST_EVIDENCE) + CHANGELOG/readiness updates |

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
Typecheck 7/7 · lint 0 errors · format clean · unit 56/56 · integration 242/242 · API build ✓.
Email: 2/2 Mailhog receipts. Backup→restore: row counts + schema identical. Domain: CORS, CSRF,
refresh-rotation+reuse-detection, logout all pass on localhost.

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
- **Email providers** (Resend/Mailgun) verified by unit tests + Mailhog; not live-sent (no creds).
- **Existing non-demo orgs** would need a one-row backfill `(manager, leave.reject, scope=team)`;
  the demo org gets it via `reset-demo.sh`.
- Manager leave-reject lands on the demo only after a re-seed (`reset-demo.sh`).

## Upgrade notes
- New env: `EMAIL_PROVIDER` (+ `EMAIL_FROM`, `SMTP_*` / `RESEND_API_KEY` / `MAILGUN_*`). Default
  `log` — no action needed to keep current behavior. See `apps/api/.env.example`.
- Re-seed the demo (`deploy/reset-demo.sh`) to grant managers `leave.reject` and refresh data.
- Nothing is pushed or deployed by this sprint — see `PROD_SIGNOFF.md` for the go/no-go.
