# Phase 9 — Email Certification

Captured: 2026-06-10 (~13:50Z) · Program phase 9 of 17 · Baseline: `docs/CERTIFICATION_BASELINE.md`
Method: all wired email templates triggered live into a clean Mailhog and inspected for subject/HTML/branding; provider abstraction verified by unit tests + boot behavior; provider-switching and live Resend/Mailgun send marked deploy-time (OI-02).

## Verdict: PASS (5 wired templates delivered & well-formed; provider abstraction sound; live non-SMTP send remains a deploy-time check)

| Template | Result | Subject | Evidence |
| --- | --- | --- | --- |
| Password reset | **PASS** | "Reset your Staffly password" | §1 (also Phase 2) |
| Invite | **PASS** | "You're invited to Acme Corporation on Staffly" (org name resolved) | §1 (also Phase 2) |
| Welcome | **PASS** | "Welcome to Acme Corporation on Staffly" | Phase 2 §6 (accept-invite) |
| Leave approved | **PASS** | "Your leave request was approved" | §1 (also Phase 6) |
| Leave rejected | **PASS** | "Your leave request was rejected" | §1 (also Phase 6) |
| Announcement email | **N/A** | not wired — announcements notify in-app only (Phase 8) | — |
| HTML quality | **PASS** | `multipart/alternative` (HTML + plain text), Staffly branding, personalized greeting, correct interpolation | §2 |
| Provider abstraction | **PASS** | log/smtp/resend/mailgun selected by `EMAIL_PROVIDER`; prod-fatal when unset/creds missing | §3 |
| Live SMTP (Mailhog) | **PASS** | all 4 triggered flows delivered | §1 |
| Live Resend/Mailgun | **NOT VERIFIABLE LOCALLY** | no provider credentials; deploy-time smoke test | OI-02 |

## 1. Live delivery (Mailhog, EMAIL_PROVIDER=smtp)

Cleared Mailhog, triggered each flow, inventoried:
```
• Reset your Staffly password               → employee@acme.demo
• You're invited to Acme Corporation on Staffly → cert.email@acme.demo
• Your leave request was approved           → employee@acme.demo
• Your leave request was rejected           → employee@acme.demo
   (Welcome verified in Phase 2 on accept-invite)
```
All `From: Staffly <no-reply@staffly.local>` (the dev `EMAIL_FROM`). Org name resolves in the invite subject. Sends are fire-and-forget (`void mailer.send(...)`) so a mail failure never blocks the API response.

## 2. HTML quality (leave-approved sample, decoded)

- Content-Type `multipart/alternative` — a `text/plain` part **and** a `text/html` part (graceful degradation in text-only clients).
- Plain-text rendering: *"Hi Alex Doe, your Casual Leave request for 2026-10-05 was approved."* — personalized name, leave-type name, and date all interpolated correctly.
- HTML part contains `<html>` + Staffly branding. Template builder HTML-escapes interpolated values (verified in `mailer.spec.ts`/templates).

## 3. Provider abstraction (`buildMailerFromEnv`, `mailer.module.ts`)

`MailerClient` interface with 4 adapters selected by `EMAIL_PROVIDER`. Unit-tested (`test/mailer/mailer.spec.ts`, 10 tests):
- defaults to `log` when `EMAIL_PROVIDER` unset (dev);
- **production: refuses to boot** when `EMAIL_PROVIDER` unset, or when the chosen provider's creds are missing (commit `1d29173`) — verified by 2 throwing tests;
- production honors an explicit `EMAIL_PROVIDER=log`;
- falls back to `log` (dev) with a warning when `smtp`/`resend` creds are missing;
- selects `smtp` when `SMTP_HOST` set, `resend` when `RESEND_API_KEY` set;
- `MailerService.send` returns `true`/`false` and **never throws** (fire-and-forget resilience) — 2 tests.

`mailgun` adapter exists and is config-selected the same way (`resend` is the unit-tested representative of the HTTP-API adapters). Provider switching is a config change (`EMAIL_PROVIDER` + creds) with no code change; the boot guard prevents a silent mail-disabled production deploy.

## 4. Findings

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| OI-02 | High (deploy-time) | Resend/Mailgun never live-sent (no creds locally); only adapter selection is unit-tested | **Deploy-time** — one Resend smoke test post-deploy (DEPLOY_CHECKLIST §9) |
| F-9.1 | P3 | `mailgun` adapter lacks a dedicated selection unit test (covered indirectly; `resend` is the HTTP-adapter representative) | Note — add a mailgun selection test if mailgun becomes the chosen provider |
| F-9.2 | info | `EMAIL_FROM` defaults to `staffly.local` — Phase 1 F-1.2 already added it to the prod deploy env table with a "set me" note | Tracked (Phase 1) |

## 5. Cleanup

Test invite user (`cert.email@acme.demo`), its invite row, the 2 email-cert leave requests + approvals, and the reset token removed; employee notification read-state restored. Demo intact (40 employees, 59 leave, 24 notifications, 0 residual). No code changes this phase.
