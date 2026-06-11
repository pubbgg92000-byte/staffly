# Phase 2 — Authentication Certification

Captured: 2026-06-10 (~12:50Z) · Program phase 2 of 17 · Baseline: `docs/CERTIFICATION_BASELINE.md`
Method: live curl matrix against the running API (:4000) + Mailhog (:8025) + portal middleware (:3000), backed by the auth integration suite (36/36). Demo accounts: super/hr/manager passwords from gitignored `apps/api/.env` (`DEMO_*_PASSWORD`), employee `Employee@123`.

## Verdict: PASS (CSRF-on-refresh P1 fixed at gate; all flows verified)

| Capability | Result | Evidence |
| --- | --- | --- |
| Login (4 roles) | **PASS** — super_admin/hr_admin/manager/employee all 200 | §1 |
| Wrong password | **PASS** — 401 | §1 |
| Account lockout | **PASS** — 10 failures → 423 | integration `auth.integration.spec.ts` |
| Cookie issuance + flags | **PASS** — sf_access HttpOnly 15m, sf_refresh HttpOnly 7d path=/auth, sf_csrf non-HttpOnly 7d, all SameSite=Lax, Secure off in dev (on in prod by NODE_ENV) | §2 |
| Refresh rotation | **PASS** — rotate → 204, new refresh ≠ old | §3 |
| Replay / reuse detection | **PASS** — replay old refresh → 401, whole chain revoked (rotated token also 401) | §3 |
| **CSRF on refresh** | **PASS after fix** — was a no-op (204 without token); now 403 without/!mismatch, 204 with valid double-submit | §4 (ED-05) |
| Logout / signout | **PASS** — 204, clears 3 cookies, refresh afterwards 401 | integration |
| Session expiry (API) | **PASS** — garbage/expired access token → 401; no auth → 401 | §5 |
| Session expiry (portal) | **PASS** — admin `/` and `/dashboard` with no cookie → 307 redirect to `/auth/sign-in?from=…` | §5 |
| Password reset email | **PASS** — Mailhog: "Reset your Staffly password" → employee | §6 |
| Invite email | **PASS** — "You're invited to Acme Corporation on Staffly" (org name resolved) | §6 |
| Welcome email + accept | **PASS** — accept-invite 200 + auto-signin cookies; "Welcome to Acme Corporation on Staffly" | §6 |
| 2FA challenge/verify | **PASS** (no demo user has 2FA on) — challenge→verify path covered by integration suite | integration |

## 1. Login matrix (live)

```
superadmin@acme.demo -> 200    hr@acme.demo      -> 200
manager@acme.demo    -> 200    employee@acme.demo -> 200
wrong password       -> 401
```

## 2. Cookie flags (employee signin, `Set-Cookie` headers)

```
sf_access  Max-Age=900    Domain=localhost Path=/      HttpOnly SameSite=Lax   (15-min access JWT)
sf_refresh Max-Age=604800 Domain=localhost Path=/auth  HttpOnly SameSite=Lax   (7-day, path-scoped)
sf_csrf    Max-Age=604800 Domain=localhost Path=/               SameSite=Lax   (non-HttpOnly: JS reads it for double-submit)
```

`Secure` correctly absent in dev (NODE_ENV=development); set in production by `cookies.ts:baseOptions()`. Refresh-cookie path scoping to `/auth` limits its exposure surface. **No HttpOnly on sf_csrf is correct** — the double-submit pattern requires JS to read it and echo it in `X-CSRF-Token`.

## 3. Rotation + replay (live)

```
rotate #1                                   -> 204 (new sf_refresh issued)
replay OLD refresh after rotation           -> 401 (reuse detected)
the rotated (latest) refresh after that     -> 401 (entire token chain revoked)
```

Reuse-detection revokes the whole descendant chain — correct defense against stolen-refresh replay. Confirmed by integration test "refresh with reused (revoked) token invalidates the chain".

## 4. CSRF on /auth/refresh — ED-05 confirmed and FIXED (P1)

**Defect (confirmed live before fix):** `POST /auth/refresh` is `@Public()` (must be — the access token is expired when a client refreshes) and carried a redundant route-level `@UseGuards(CsrfGuard)`. Because `CsrfGuard` is also a global `APP_GUARD` and short-circuited `return true` on any `@Public()` route, **the CSRF check never ran** — a forged cross-site POST with no token rotated the victim's session (live: returned **204** with no `X-CSRF-Token`). This is a real CSRF hole on a state-changing, cookie-authenticated endpoint (raises baseline OI-11's logout note to an actual refresh vulnerability).

**Fix:** new `@EnforceCsrf()` decorator (`auth/decorators/enforce-csrf.decorator.ts`) sets `CSRF_REQUIRED_KEY` metadata; `CsrfGuard` now reads it and only skips public routes when **not** `@EnforceCsrf()`. Applied to `/auth/refresh` (replacing the dead `@UseGuards`). Logout/signout stay CSRF-exempt by design (clearing your own cookies is not a data-mutating target; documented in the controller).

**Live verification after fix:**
```
refresh WITHOUT csrf header  -> 403 {error.code: auth.csrf_failed}
refresh WITH    csrf header  -> 204
```
**Tests:** 2 new integration tests (no header → 403 + token not consumed; mismatched header → 403). Pre-existing logout test corrected to send the full cookie set (it previously passed only because CSRF was bypassed). Auth suite 34 → **36/36**.

## 5. Session-expiry behavior

- API: `GET /auth/me` with a garbage `sf_access` → **401**; with no auth → **401** (tampered/expired tokens never silently authorize).
- Portal: admin `/` → 307 `…/auth/sign-in?from=%2F`; `/dashboard` → 307 `…?from=%2Fdashboard`. The middleware gates on cookie presence and redirects unauthenticated requests (baseline OI-13 notes the client-side 401 handler is the compensating control for expired-but-present cookies; the redirect-on-absent path works).

## 6. Email flows (Mailhog, EMAIL_PROVIDER=smtp)

Cleared Mailhog, then drove each flow; all delivered with the org name resolved in the subject:

| Flow | Trigger | Subject | To |
| --- | --- | --- | --- |
| Password reset | `POST /auth/forgot-password` | Reset your Staffly password | employee@acme.demo |
| Invite | `POST /invites` (as HR) | You're invited to Acme Corporation on Staffly | cert.invitee@acme.demo |
| Welcome | `POST /auth/accept-invite` (200 + auto-signin) | Welcome to Acme Corporation on Staffly | cert.invitee@acme.demo |

(Leave approved/rejected emails are exercised in Phase 6.)

## 7. Findings

| ID | Sev | Finding | Source | Disposition |
| --- | --- | --- | --- | --- |
| F-2.1 | **P1** | CSRF check was a no-op on `/auth/refresh` (`@Public` short-circuited the guard) — forged cross-site refresh succeeded | `csrf.guard.ts`, `auth.controller.ts:141` | **FIXED at gate** (`@EnforceCsrf()`); live + 2 tests |
| F-2.2 | P2 | `accept-invite` for a bare email created an auth **user with no employee profile row** (orphan login: 1 user, 0 employees) — an invitee not tied to an existing employee can sign in but has no employee record/dashboard subject | DB: `users` row, `employees` none | **Phase 4** (employee lifecycle) — verify expected vs gap; likely invites should provision an employee or be employee-scoped |
| F-2.3 | P3 | Portal middleware gates on cookie **presence**, not validity (baseline OI-13) — expired-but-present cookie yields empty dashboard until the client 401 handler fires; redirect-on-absent verified working | middleware | Track in security (Phase 11) / OI-13 |

## 8. Cleanup

The invite/welcome flow created `cert.invitee@acme.demo` (auth user only). Removed it and its invite/token/role rows post-test; demo org back to **4 login users / 40 employees**. No demo data mutated.
