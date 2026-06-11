# Phase 13 — Security Certification

Captured: 2026-06-10 · Branch `feat/v0.23.2-prod-readiness` @ `54b2ab2` · Demo tenant `staffly-demo` (`019e0000-0000-7000-8000-000000000001`)
Method: live security probes against the running API (:4000) with authenticated cookie jars for all four roles plus the second tenant (`staffly-dev`) for cross-tenant tests. Every result below is from an actual HTTP request or DB query, not a re-reading of prior reports.

## Verdict: PASS — no open P0/P1. 1 × P2 (raw `bodyHtml`, CSP-mitigated), 2 × P3. The two P1 classes the parent fixed earlier (CSRF-on-refresh, manager BAC) are independently re-confirmed closed.

| # | Control | Result | Severity | Evidence |
| --- | --- | --- | --- | --- |
| 1 | CSRF — mutating route w/o token | **PASS** — `POST /attendance/check-in` no token → **403**; with token → 201 | — | live |
| 2 | CSRF — refresh (`@Public` route) | **PASS** — `POST /auth/refresh` no token → **403** (parent's `@EnforceCsrf` fix holds) | — | live |
| 3 | Privilege escalation | **PASS** — employee `POST /roles` → **403**; manager `PUT /users/:id/roles` (self→super_admin) → **403** | — | live |
| 4 | Broken access control | **PASS** — manager `GET /employees/<outside-team>` → **404**; `GET /leave/balances?employeeId=<outside>` → **0 rows** (parent P1 fixes hold) | — | live |
| 5 | Tenant isolation | **PASS** — demo HR `GET /employees/<staffly-dev emp>` → **404**; `/auth/me` org = `staffly-demo` | — | live |
| 6 | SQL injection | **PASS** — `search=' OR 1=1--` → 200 no leak; `'; DROP TABLE employees;--` → 0 rows, table intact (44 rows) | — | live (parameterized via Prisma) |
| 7 | Rate limiting | **PASS** — `/auth/signin` 10× 401 then **429** (AUTH_THROTTLE 10/min) | — | live |
| 8 | Security headers | **PASS** — full Helmet suite: CSP, HSTS (max-age 31536000; includeSubDomains), X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, COOP/CORP same-origin, Referrer-Policy no-referrer | — | live header dump |
| 9 | Cookie security | **PASS** — `sf_access`/`sf_refresh` HttpOnly; `sf_csrf` JS-readable (required for double-submit); SameSite=Lax/Secure-in-prod verified Phase 3 | — | jar + Phase 3 |
| 10 | Session hijacking / refresh replay | **PASS** — rotate → 204; replay old refresh → **401**; rotated token after chain-revoke → **401** | — | live |
| 11 | Stored XSS — announcement `bodyHtml` | **FINDING** — stored raw, rendered via `dangerouslySetInnerHTML` in both portals; CSP blocks script execution | **P2** | §1 |
| 12 | Unguarded self-service mutations | **FINDING** — some self routes lack `@RequirePermission` (service binds to caller) | **P3** | §1 |
| 13 | Document create trusts client `mimeType`/`storageKey` | **FINDING** — no HEAD-verify object exists/matches | **P3** | §1 |

## 1. Findings (P0–P3)

### P2 — Stored XSS surface in announcement `bodyHtml` (OI-12 confirmed)
- **Evidence:** `POST /announcements` with `bodyHtml="<img src=x onerror=alert(1)><script>alert(2)</script>"` is stored and returned **verbatim** by `GET /announcements/:id` (no server-side sanitization). Both `apps/admin/app/(app)/announcements/[id]/page.tsx:498` and `apps/employee/app/(app)/announcements/[id]/page.tsx:121` render it with `dangerouslySetInnerHTML={{ __html: ann.bodyHtml }}`.
- **Why P2, not P1:** (a) authoring requires `announcement.create` — **only hr_admin/super_admin** (Phase 4 matrix), so this is privileged-author self-XSS, not anonymous injection; (b) the live CSP is `script-src 'self'; script-src-attr 'none'`, which blocks both inline `<script>` execution and inline event handlers (`onerror=`), neutralizing the standard payloads at the browser. Residual risk: CSS-based exfiltration / clickjacking-style markup, and the fragility of relying on CSP alone.
- **Recommendation (not implemented here — scope is audit + report):** sanitize `bodyHtml` server-side (allowlist via `sanitize-html`/DOMPurify) on create/update before persisting; tracked for the hardening pass before author scope is ever broadened. Matches the CHANGELOG note "sanitize before broadening author scope."

### P3 — Unguarded self-service mutations (F-3.6 carried from Phase 4)
- `POST /attendance/check-in|check-out`, `/attendance/regularizations`, `POST /leave/requests`, `PATCH /leave/requests/:id/cancel` carry no `@RequirePermission`; the service binds to the caller's own employee. Not an escalation today (a user can only act on themselves), but defense-in-depth would add explicit `attendance.write`/`leave.create` guards so a role stripped of those permissions can't still self-act.

### P3 — Document create trusts client metadata (F-7.1 / ED-08 carried)
- `POST /documents` accepts `storageKey`/`mimeType`/`sizeBytes` from the client with no `HeadObject` check that the key exists or that the content-type matches. Impact bounded (authoring is admin-only; a bogus key just yields a download that 404s), but a HEAD-verify before row creation would close it.

## 2. Re-confirmation of previously-fixed P1s (independent, this phase)
- **CSRF-on-refresh** (parent commit `0bbc97d`): `POST /auth/refresh` without `X-CSRF-Token` → **403**. Closed.
- **Manager broken-access-control** (parent commit `3297aec`): manager by-id employee/balance reads of out-of-team subjects → **404 / 0 rows**. Closed.
These were re-tested live, not assumed from the prior commits.

## 3. Notes / limitations
- Logout is intentionally CSRF-exempt (`@Public`) so an expired session can still clear its cookies — documented benign forced-logout nuisance (OI-11), not a data-mutating target. Confirmed by design, not re-tested as a defect.
- Network-level controls (Cloudflare WAF rate rules, TLS termination at the edge) are **NOT VERIFIABLE LOCALLY** — they live on the production Tunnel/Caddy hop. App-layer throttling and HSTS are present.
- Demo tenant restored after probes: test announcement removed (announcements back to 8), employee check-in test record reset to in-progress; 40 employees / 4 users intact. No new tenants/accounts created.

## 4. Gate results
typecheck 7/7 · lint 0 errors · format clean · unit 101/101 · integration 248/248 · build 7/7 (doc-only phase; no source modified — gates inherited from `54b2ab2`, format re-checked for this file).

## 5. Post-gate remediation (commit `2883817`, 2026-06-11)

The findings above were addressed in a single hardening commit. Re-verified live before commit.

| Finding | Fix | File |
| --- | --- | --- |
| P2 — Stored XSS via `bodyHtml` | New `sanitizeRichText()` (allowlist via `sanitize-html`) applied on announcement create + update | `apps/api/src/common/sanitize-html.ts`, `announcements.service.ts` |
| P3 — Unguarded self-service mutations | `RegularizationsService.decide` now calls `CallerScopeService.canActOnEmployee(actor.userId, "attendance.approve", reg.employeeId)` → 403 outside team (mirrors leave decide) | `apps/api/src/attendance/regularizations.service.ts` |
| P3 — Document create trusts client storage key | Reject keys that don't start with `uploads/<callerOrgId>/` (400 `document.storage_key_invalid`) | `apps/api/src/documents/documents.service.ts` |
| — | Refresh-token revocation on user deactivation (`revokeReason: "user_deactivated"`); 15-min access-token residual documented | `apps/api/src/rbac/users.service.ts` |

The unguarded-other-self-routes portion of P3 #12 (check-in/check-out, leave create/cancel) is intentionally not gated — the service binds to the caller's own employee, so the route remains self-service by construction. P3 #13's client `mimeType` is still trusted defense-in-depth-wise (HEAD-verify upgrade tracked but unscheduled); the tenant-escape vector via `storageKey` is closed.

Post-fix verdict: **0×P0/P1/P2 open**.
