# Staffly — Test Evidence (v0.23.2 Production-Readiness Sprint)

**Branch:** `feat/v0.23.2-prod-readiness` · **Base:** `main` @ `c22b53a` · **Date:** 2026-06-10
**Commits under test:** `c5f851a` (gitignore), `a0754c6` (email), `19034e1` (leave-reject)

> **Evidence limitations — read first.**
> - **No browser automation in this environment** → there are **no UI screenshots**.
>   Frontend correctness is evidenced indirectly (HTTP status, CSS asset byte-size +
>   token grep). Visual/mobile/a11y review remains a human step.
> - **No real DNS / production domains** → cross-subdomain cookie behavior is
>   **config-validated + curl-simulated against `localhost`**, not verified on live
>   `*.staffly.av.online`. The true test happens at deploy time.
> - **No email-provider credentials** → email is verified against **Mailhog** only;
>   Resend/Mailgun adapters are exercised by unit tests (provider selection), not live sends.

---

## 1. Automated gates

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | **7/7 packages** |
| Lint | `pnpm lint` | **0 errors** (warnings only — pre-existing `consistent-type-imports`) |
| Format | `pnpm format:check` | **clean** |
| Unit | `pnpm --filter @staffly/api test` | **56/56** (5 files; +7 new mailer specs) |
| Integration (Testcontainers PG18) | `pnpm --filter @staffly/api test:integration` | **242/242** (13 specs; +1 manager-reject) |
| API build | `pnpm --filter @staffly/api build` | **success** (`nest build`) |

Portals (`apps/admin`, `apps/employee`) are unchanged this sprint and last built green at `c22b53a` (CI run `27257404587`, success).

New tests:
- `test/mailer/mailer.spec.ts` — `buildMailerFromEnv` selects log (default) / falls back to log when smtp/resend creds missing / selects smtp+resend when configured; `MailerService.send` returns `true` on success and **`false` (never throws)** on adapter error.
- `test/rbac/manager-scope.integration.spec.ts` — manager **can reject** a team member's leave (status persisted `rejected`) and gets **403** for an outsider's.

---

## 2. Email delivery — Mailhog receipt (live SMTP)

Config: `EMAIL_PROVIDER=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=1025` (Mailhog). Mailhog inbox
cleared, two flows triggered, then `GET http://localhost:8025/api/v2/messages`:

| # | Trigger | To | From | Subject |
| --- | --- | --- | --- | --- |
| 1 | `POST /auth/forgot-password` (employee@acme.demo) | employee@acme.demo | Staffly <no-reply@staffly.local> | **Reset your Staffly password** |
| 2 | `POST /invites` (employee role) | newhire.beta@acme.demo | Staffly <no-reply@staffly.local> | **You're invited to Acme Corporation on Staffly** |

Mailhog message count: **2**. Org name correctly resolved into the invite subject. Both `forgot-password`
(`200`) and `invites` (`201`) returned success; sends are fire-and-forget (`void mailer.send`) so the
request never blocks on SMTP. With `EMAIL_PROVIDER=log` (CI/default) the same flows log and send nothing.

---

## 3. Backup → restore drill (real, local PG18)

Dumped the live `staffly` DB, restored into an isolated `staffly_restore_test`, compared, dropped it.
The live database was never modified.

- **Dump:** `pg_dump` → 908 KB / 6,273 lines.
- **Restore:** `psql -f` into `staffly_restore_test` → **0 errors**.
- **Row counts (live vs restored) — identical:**

| Table | Live | Restored |
| --- | --- | --- |
| organizations | 2 | 2 |
| users | 8 | 8 |
| employees | 44 | 44 |
| attendance_records | 2378 | 2378 |
| leave_requests | 54 | 54 |
| announcements | 7 | 7 |
| audit_logs | 22 | 22 |

- **Schema diff** (`pg_dump --schema-only` live vs restored): **18 lines, all cosmetic** — only the
  per-dump random `\restrict`/`\unrestrict` tokens differ; the 2,567 lines of DDL are identical.

> Note: `deploy/backup.sh` defaults `PG_CONTAINER=staffly-postgres-demo` (prod). For a local drill against
> the dev container use `PG_CONTAINER=staffly-postgres`. R2 upload warns-and-skips when `R2_ENDPOINT` is unset.

---

## 4. Domain / cookie / CORS / CSRF / refresh / logout (curl, localhost)

| Check | Evidence | Verdict |
| --- | --- | --- |
| CORS — disallowed origin | `OPTIONS` w/ `Origin: https://evil.example.com` → **no** `Access-Control-Allow-Origin` | ✅ rejected |
| CORS — allowed origin | `Origin: http://localhost:3000` → `Access-Control-Allow-Origin: http://localhost:3000` + `Allow-Credentials: true` | ✅ reflected |
| Cookie `sf_access` | `HttpOnly; Path=/; Max-Age=900; SameSite=Lax` | ✅ |
| Cookie `sf_refresh` | `HttpOnly; Path=/auth; Max-Age=604800; SameSite=Lax` | ✅ scoped |
| Cookie `sf_csrf` | `Path=/; Max-Age=604800; SameSite=Lax` (no HttpOnly — JS-readable) | ✅ |
| `secure` flag | absent in dev (`NODE_ENV=development`); flips on in production | ✅ by design |
| CSRF — no token | `POST /employees` without `X-CSRF-Token` → **403** | ✅ blocked |
| CSRF — with token | same POST with header → **201** | ✅ allowed |
| Refresh rotation | `POST /auth/refresh` + cookie + CSRF → **204**, new `sf_access`+`sf_refresh` issued | ✅ |
| Refresh reuse-detection | replay the **old** refresh token → **401** | ✅ |
| Logout | `POST /auth/logout` → **204**, all three cookies cleared (`Expires=1970`) | ✅ |

**Cross-subdomain cookie sharing:** in dev the cookie `Domain=localhost`; production sets
`COOKIE_DOMAIN=.staffly.av.online` so the cookie spans `admin.` / `api.` / apex (same registrable site →
SameSite=Lax permits it). **This is config-validated only — it requires real DNS to verify live** (or an
`/etc/hosts` + `COOKIE_DOMAIN=.staffly.local` simulation, not run here).

---

## 5. Reproduction

Accounts (demo org **Acme Corporation**, slug `staffly-demo`):

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | superadmin@acme.demo | `DEMO_SUPERADMIN_PASSWORD` (env) |
| HR Admin | hr@acme.demo | `DEMO_HR_PASSWORD` (env) |
| Manager | manager@acme.demo | `DEMO_MANAGER_PASSWORD` (env) |
| Employee | employee@acme.demo | `Employee@123` (published) |

Dev URLs: Admin `http://localhost:3000` · Employee `http://localhost:3001` · API `http://localhost:4000`
· Mailhog `http://localhost:8025`.
