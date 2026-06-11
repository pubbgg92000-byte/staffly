# RC-1 Inspection — Phase 9: Production Readiness

Captured: 2026-06-11 · Everything locally verifiable was **re-verified
live** this phase; prod-only state is marked `NOT VERIFIABLE LOCALLY` and
mapped to its `DEPLOY_CHECKLIST.md` gate.

## 1. Environment variables

| Check | Result | Evidence |
| --- | --- | --- |
| Schema-validated env | zod schema with strict types/defaults (`apps/api/src/infra/config/env.ts`) | source |
| Prod boot guard (ED-06) | **Re-verified live this phase**: `NODE_ENV=production` with dev defaults → REFUSES boot, reporting all three violations in one error (`COOKIE_DOMAIN` localhost · `APP_BASE_URL` localhost · `EMAIL_FROM` dev default) | tsx probe of `loadEnv()` |
| Mailer provider guard | unset/misconfigured `EMAIL_PROVIDER` in prod → boot-fatal (`mailer.module.ts:153-158`, `1d29173`) | source + Phase 6 |

## 2. Cookies

| Property | Value | Evidence |
| --- | --- | --- |
| `httpOnly` | access + refresh yes; CSRF cookie readable by JS (by design, double-submit) | `cookies.ts:31-48` |
| `secure` | `NODE_ENV === "production"` → true | `cookies.ts:22` |
| `sameSite` | `lax` | `cookies.ts:23` |
| Refresh scope | path-limited to `/auth` (not sent on normal API calls) | `cookies.ts:11` |
| Domain | `COOKIE_DOMAIN` env; localhost refused in prod (guard above) | `env.ts:127-132` |
| Live prod-domain behavior | `NOT VERIFIABLE LOCALLY` — **OI-01**, gated `DEPLOY_CHECKLIST.md` §1/§9 | reconciliation |

## 3. CORS

Explicit allowlist (`CORS_ORIGINS` env) with per-request origin reflection
and `credentials: true`; no-Origin (curl/server-to-server) passes without
CORS headers; non-allowlisted origins get a hard error (`main.ts:61-77`).
No wildcard anywhere. Live prod-domain CORS = **OI-01** (deploy-time).

## 4. Storage (R2)

- S3-compatible client config: `S3_ENDPOINT/REGION/BUCKET/KEYS`,
  presign TTL 900 s (`env.ts:73-82`) — local MinIO verified end-to-end in
  Phase 7 (byte-identical round-trip, tenant-prefixed keys, guard live).
- R2 bucket provisioning + credentials: `NOT VERIFIABLE LOCALLY` —
  **OI-03**, gated `DEPLOY_CHECKLIST.md` §2.

## 5. Cloudflare

Tunnel + WAF rate-limit rule are deploy-time provisioning
(`NOT VERIFIABLE LOCALLY`, **OI-03**, `DEPLOY_CHECKLIST.md` §5). App-side
defence-in-depth throttle verified live in Phase 8 (429 at 10/60s).

## 6. Backups & restore — drill re-run THIS phase

| Step | Result |
| --- | --- |
| `deploy/backup.sh` (against `staffly-postgres`) | ✅ dump written (140 KB gz), disk-space guard active, retention prune ran, R2 upload correctly skipped with warning when `R2_ENDPOINT` unset |
| Restore into scratch DB `rc_restore_drill` | ✅ exit 0, **0 errors**, 37 tables, spot counts intact (44 employees, 2,380 attendance rows incl. `staffly-dev` org); scratch DB dropped after |
| Production-host restore | `NOT VERIFIABLE LOCALLY` — **OI-04 residual**, `DEPLOY_CHECKLIST.md` §10 |

## 7. Deploy scripts

| Script | Audit |
| --- | --- |
| `deploy/release.sh` | tag rollback anchor → **backup before migrate** (forward-only-migration recovery contract) → pull/install/generate/migrate/build → PM2 reload → health-check with automatic rollback on failure. Does not push/merge/auto-deploy frontends. |
| `deploy/backup.sh` | audited + executed above |
| `deploy/reset-demo.sh` | forwards `DEMO_PROFILE`; **does not fail fast when `DEMO_*_PASSWORD` unset** → RC-01 root cause; hardening tracked as RC-01-residual (P2) |

## 8. Classification

**PARTIAL** — every locally verifiable control is READY (env guards,
cookies, CORS config, storage path, backup/restore drill, release
machinery, throttling), but four deploy-time gates remain open by nature:

| Gate | Item | Checklist |
| --- | --- | --- |
| OI-01 | prod-domain cookie/CORS live check | §1, §9 |
| OI-02 | live email-provider send | §9 |
| OI-03 | R2 bucket + Cloudflare Tunnel provisioning | §2, §5 |
| OI-04 | restore drill against prod host | §10 |

Plus two pre-deploy code hardenings found by this inspection: **RC-05**
(P2, reset-URL logging) and **RC-01-residual** (P2, reseed password drift
guard). Neither blocks local demos.
