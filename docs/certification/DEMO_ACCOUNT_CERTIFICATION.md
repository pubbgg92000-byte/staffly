# RC-1 Inspection — Phase 2: Demo Account Certification

Captured: 2026-06-11 · Org `staffly-demo` (Acme Corporation, pinned id
`019e0000-0000-7000-8000-000000000001`). All probes are REAL HTTP requests
against the running API (`http://localhost:4000`).

## 1. Account audit (DB evidence)

| Account | Exists | Status | Tenant | Role | Lockout |
| --- | --- | --- | --- | --- | --- |
| superadmin@acme.demo | ✅ | active | staffly-demo | Super Admin | none |
| hr@acme.demo | ✅ | active | staffly-demo | HR Admin | none |
| manager@acme.demo | ✅ | active | staffly-demo | Manager | none |
| employee@acme.demo | ✅ | active | staffly-demo | Employee | none |

Source: `users` ⋈ `user_roles` ⋈ `roles` ⋈ `organizations` (psql).

## 2. Live auth cycle (final state — all PASS)

Cycle per account: `POST /auth/signin` (slug `staffly-demo`) → `GET /auth/me`
→ `POST /auth/refresh` **with** CSRF token → `POST /auth/refresh` **without**
CSRF (must 403) → `POST /auth/logout` → `GET /auth/me` (must 401).

| Account | signin | me | refresh+csrf | refresh−csrf | logout | me after logout |
| --- | --- | --- | --- | --- | --- | --- |
| superadmin@acme.demo | 200 | 200 (self) | 204 | **403** ✅ | 204 | **401** ✅ |
| hr@acme.demo | 200 | 200 (self) | 204 | **403** ✅ | 204 | **401** ✅ |
| manager@acme.demo | 200 | 200 (self) | 204 | **403** ✅ | 204 | **401** ✅ |
| employee@acme.demo | 200 | 200 (self) | 204 | **403** ✅ | 204 | **401** ✅ |

The CSRF-on-refresh control (ED-05 fix, commit `0bbc97d`) and the
session-invalidation-on-logout behavior both hold for every account.

## 3. Finding RC-01 — admin demo passwords drifted from `.env` (P1, demo-blocking, REMEDIATED)

**Observed:** first probe run returned `signin=401` for superadmin/hr/manager
(employee fine). Argon2 verification of the DB `password_hash` against the
`DEMO_*_PASSWORD` values in `apps/api/.env` confirmed **mismatch** for all
three; `failed_login_count` was already 2 per account before this inspection.

**Root cause:** `seed-demo.ts` reads `process.env` only — it does **not**
load `apps/api/.env` (no dotenv import). The most recent reseed (today 09:58,
the Phase 18 US↔India round-trip ending on the US profile) was run without
the three env vars exported, so `pwFor()` fell through to
`strongPassword()` — **random generated passwords** for the admin accounts
(printed once to the seed console and lost). The employee account was
unaffected because it has a public default (`Employee@123`).

**Impact if unfixed:** every demo flow for superadmin/HR/manager dead on
arrival at the login screen — an investor-demo blocker.

**Remediation applied (no users/datasets created):** re-aligned the three
existing rows' `password_hash` to the `apps/api/.env` values using the seed's
exact argon2id parameters (`memoryCost 64MiB, timeCost 3, parallelism 2`);
reset `failed_login_count` to 0. Verified by the live PASS matrix in §2.

**Residual risk + recommendation (OPEN, P2):** the drift will recur on the
next reseed unless the operator exports the env vars. Two cheap hardenings:
(a) make `deploy/reset-demo.sh` fail fast when `DEMO_SUPERADMIN_PASSWORD` &
co. are unset, or (b) have `seed-demo.ts` load `apps/api/.env` explicitly.
Tracked as **RC-01-residual** in `docs/OPEN_BLOCKERS.md`.

## 4. Verdict

**PASS (after RC-01 remediation).** All four demo accounts exist, are active,
correctly tenant- and role-mapped, and complete real login / refresh /
logout cycles with the expected security behavior. One process defect found
and fixed; one P2 hardening recommendation remains open.
