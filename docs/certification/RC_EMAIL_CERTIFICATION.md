# RC-1 Inspection — Phase 6: Email Certification

Captured: 2026-06-11 · Delivery target: Mailhog (`localhost:8025`), live SMTP
on `:1025`. Demo-account flows triggered for real where possible without
creating users; account-creation flows (invite/welcome) evidenced by today's
integration-suite deliveries through the same live SMTP path.

## 1. Active provider

| Item | Value | Evidence |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `smtp` | `apps/api/.env` |
| Target | `localhost:1025` (Mailhog), `SMTP_SECURE=false` | `.env` + live deliveries below |
| `EMAIL_FROM` | `Staffly <no-reply@staffly.local>` (dev value; prod boot guard requires a real value — ED-06 fix `3602723`) | `.env` + `env.ts` superRefine |
| Provider registry | `log` / `smtp` / `resend` / `mailgun` | `apps/api/src/infra/config/env.ts:96` |
| Silent-failure guard | **In production an unset/misconfigured provider refuses to boot** (`mailer.module.ts:153-158`, commit `1d29173`); outside prod it falls back to `log` with a warning | source |

## 2. Flow verification

| Flow | Trigger | Delivery evidence | Verdict |
| --- | --- | --- | --- |
| Leave approved | manager approved probe request (Phase 3, real API) | Mailhog 10:10:51Z → employee@acme.demo "Your leave request was approved" (+ HR org-scope approval at 10:17:34Z) | **PASS (live, demo account)** |
| Leave rejected | manager rejected probe request (Phase 3) | Mailhog 10:12:25Z → employee@acme.demo "Your leave request was rejected" | **PASS (live, demo account)** |
| Reset password | `POST /auth/forgot-password` for employee@acme.demo (this phase) | 200 + Mailhog 10:37:50Z "Reset your Staffly password"; probe token row deleted afterwards | **PASS (live, demo account)** |
| Invite | `POST /invites` (+ `/invites/:id/resend`) — RBAC module | Today's integration run, same SMTP path: multiple "You're invited to … on Staffly" deliveries (09:15Z) incl. resend duplicates | **PASS (integration evidence)** — account-creation flow; not triggered on the demo tenant per "do not create users" |
| Welcome | fires on `POST /auth/accept-invite` | "Welcome to … on Staffly" deliveries immediately after invite-accepts (09:15Z) | **PASS (integration evidence)** |

**Design note (not a failure):** HR "create employee" does **not** send an
invite — portal invitations are a separate explicit `POST /invites` action.
The Phase 3 probe employee (status `invited`, 10:16Z) therefore produced no
email, by design. Worth one line in the demo script so presenters use the
Invite action when showing onboarding.

## 3. Silent-failure audit

- Sends are fire-and-forget (`void this.mailer.send(...)`) — a provider
  outage cannot fail or block the triggering request; failures are logged.
  Accepted disposition from the v1.0 program (ED-07, P3).
- Prod misconfiguration is **boot-fatal**, so mail cannot silently
  disappear in production (`1d29173`).

### Finding RC-05 — raw reset URL logged in ALL environments (P2, NEW)

`auth.service.ts:407-409` writes
`[dev-password-reset] reset URL for <email>: <url-with-raw-token>` via
`logger.warn` **unconditionally** — the response-body `devResetUrl` is
correctly stripped in production (`NODE_ENV` check, line 417), but the log
line is not gated. In production, live single-use reset tokens would land
in server logs (log reader → account takeover within token TTL). Not
caught in the v1.0 security phase (`docs/SECURITY_REPORT.md` has no
mention). Fix: gate the `logger.warn` on `NODE_ENV !== "production"`
(~5 min). Carried to `docs/OPEN_BLOCKERS.md`.

## 4. Verdict

**PASS** — all five flows deliver through the live SMTP path, provider
chain is explicit with a prod boot guard, and no silent-failure path
exists. One new P2 hardening item (RC-05, reset-token logging) recorded
for pre-production fix.
