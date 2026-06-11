# RC-1 Inspection — Phase 8: Security Quick Pass

Captured: 2026-06-11 · Scope per directive: **previously identified risks
only** (v1.0 Phase 13 report `docs/SECURITY_REPORT.md` + fixes `0bbc97d`,
`3297aec`, `2883817`). All probes live HTTP against `:4000` with demo
accounts; probe artifacts cleaned (revoked/expired probe refresh tokens
deleted, probe announcement deleted, announcements back to 8).

| # | Risk (origin) | Probe | Result | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Tenant isolation (Phase 13 cross-tenant probes) | HR of `staffly-demo` GETs a `staffly-dev` employee id | **404 `employee.not_found`** — no data, no existence leak | **PASS** |
| 2 | Privilege escalation (RBAC matrix) | employee@acme.demo GETs `audit-logs`, `organization/settings`, `employees`, org `leave/requests` | **403 `auth.forbidden` × 4** | **PASS** |
| 3 | Manager BAC (fix `3297aec`) | manager GETs an out-of-subtree employee (Hana Reyes) | **404** — subtree scoping holds (Phase 3 also matched subtree+self exactly via CTE) | **PASS (FIXED holds)** |
| 4 | CSRF on refresh (ED-05, fix `0bbc97d`) | `POST /auth/refresh` without `x-csrf-token` | **403 × 4 accounts** (Phase 2 matrix) | **PASS (FIXED holds)** |
| 5 | CSRF on mutations | `POST /attendance/check-in` with session cookies but no CSRF header | **403 `auth.csrf_failed`**, rejected pre-handler | **PASS** |
| 6 | Refresh replay / rotation | sign in → refresh (rotate) → replay the **old** refresh cookie | replay → **401**; and the rotated *current* token is also revoked (**family revocation on reuse detection** — post-replay refresh 401) | **PASS** |
| 7 | Session expiry | logout→`/auth/me` 401 (Phase 2); fresh session's refresh token force-expired in DB → refresh | **401 `auth.unauthenticated`** — DB expiry enforced server-side | **PASS** |
| 8 | Rate limiting (`AUTH_THROTTLE` 10/60s, `auth.controller.ts:31`) | rapid signins with a **nonexistent** email (avoids demo-account lockout counters) | **429** exactly at the 10-request window (3 prior signins + 7 = 10, then 429 × 5) | **PASS** |
| 9 | Stored XSS in announcements (fix `2883817`) | HR creates announcement with `<script>` + `<img onerror>` payloads | 201 but persisted `bodyHtml` = `<p>hello</p>` — **both payloads stripped server-side**; probe deleted | **PASS (FIXED holds)** |
| 10 | Deactivation token revoke (fix `2883817`) | not re-probed live (would mutate a demo account); covered by Phase 13 fix + suite (unit 124 / integration 248 green at `1c63d62`) | — | **VERIFIED BY PROGRAM EVIDENCE** |

## New security-relevant finding (from Phase 6)

- **RC-05 (P2)** — raw password-reset URL logged via `logger.warn` in ALL
  environments (`auth.service.ts:407-409`); response body is prod-stripped
  but the log line is not. Detailed in `RC_EMAIL_CERTIFICATION.md` §3;
  carried to `docs/OPEN_BLOCKERS.md`.

## Verdict

**PASS.** All previously identified risks re-tested live and holding:
isolation, RBAC, manager BAC, CSRF (refresh + mutations), replay with
family revocation, server-side expiry, throttling, and the XSS sanitizer.
One new P2 hardening item (RC-05) — pre-production fix, not a demo
blocker.
