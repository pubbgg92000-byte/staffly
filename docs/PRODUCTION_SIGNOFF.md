# Phase 14 — Deployment Readiness & Production Sign-off

Captured: 2026-06-11 · Branch `feat/v0.23.2-prod-readiness` @ `2e4dacf` · Demo tenant `staffly-demo` (`019e0000-0000-7000-8000-000000000001`)
Method: static + executable audit of the deploy surface (`deploy/*.sh`, `ecosystem.config.cjs`, `infra/`), a live backup→restore→verify drill against the local Postgres, live verification of new production boot guards against the built binary, and a monitoring/logging audit. Production-host behavior (PM2 on the Mini, Caddy, Cloudflare Tunnel, R2, Resend) is `NOT VERIFIABLE LOCALLY` — static checks performed and noted per item.

## Verdict: PASS — backup/restore drill green (37/37 tables row-identical, schema-identical), rollback contract coherent, prod boot guards for COOKIE_DOMAIN/APP_BASE_URL/EMAIL_FROM implemented at this gate and live-verified (refuse-to-boot + clean boot). No open P0/P1. 2 × P3 logged.

## 1. Fix landed at this gate — production env boot guards (closes ED-06)

`apps/api/src/infra/config/env.ts` previously shipped dev-flavored defaults that are silently catastrophic in production: `COOKIE_DOMAIN=localhost` (browsers never send auth cookies — every login loops), `APP_BASE_URL=http://localhost:3000` (emailed reset/invite links unusable), `EMAIL_FROM=…@staffly.local` (non-routable sender). A `superRefine` block now makes all three **refuse to boot** when `NODE_ENV=production`, reporting every violation in a single error (same philosophy as the mailer factory's prod-fatal validation, `mailer.module.ts buildMailerFromEnv`).

Evidence (live, built binary `dist/main.js`):

| Check | Result |
| --- | --- |
| `NODE_ENV=production` + dev `.env` → boot | **REFUSED** — `Invalid environment: COOKIE_DOMAIN: … localhost in production …; APP_BASE_URL: … localhost …; EMAIL_FROM: … dev default (…@staffly.local) …` (all three reported together) |
| `NODE_ENV=production` + prod-plausible values (`.staffly.example.com` / `https://app.…` / real sender) → boot | **BOOTED** — `GET /healthz` → 200 `{"status":"ok"}`, then killed |
| Non-production unaffected | dev server continued running on :4000 throughout; unit spec asserts guards inert outside production |

Tests: `apps/api/test/infra/env.spec.ts` — 7 new cases (refuse per-var, 127.0.0.1 variant, all-violations-in-one-error, prod-plausible boots, dev inert). 11/11 in file. `.env.example` annotated with `PROD BOOT GUARD` notes on all three vars.

## 2. Backup → restore → verify drill (live)

Executed `deploy/backup.sh` against the local dev container (`PG_CONTAINER=staffly-postgres`, R2 upload intentionally unset → warned and kept local dump, as designed):

| Step | Result |
| --- | --- |
| Dump | `.backups/staffly-20260611-131026.sql.gz`, 140 KB, non-empty guard passed |
| Restore | `CREATE DATABASE staffly_restore_drill` → `gunzip -c \| psql` → **0 errors** |
| Row counts | exact `count(*)` per table, source vs restored: **37/37 tables identical** (diff empty) |
| Schema | `pg_dump --schema-only --no-owner --no-privileges` both sides: **identical** — only diff lines are pg_dump's per-run random `\restrict`/`\unrestrict` session tokens (PG 18 dump preamble, not schema) |
| Spot check | restored DB: `staffly-demo` employees = 40 (matches live) |
| Teardown | `DROP DATABASE staffly_restore_drill` → only `postgres/staffly/template*` remain; live demo employees still 40 — **demo tenant untouched ✓** |

Disk guard (`MIN_FREE_GB`, default 5) and local retention pruning (keep 7) both exercised on this run. R2 upload path: `NOT VERIFIABLE LOCALLY` — code path reviewed (`aws s3 cp --endpoint-url`), gated on `R2_ENDPOINT` + aws CLI presence with a loud skip warning.

## 3. Release & rollback contract (`deploy/release.sh`) — static + parse audit

`bash -n` parses clean (all three scripts). Sequence audit:

1. **Rollback anchor** — git tag `deploy-<ts>` before anything runs. ✓
2. **Mandatory pre-migration backup** — `backup.sh` failure **aborts before any migration** (`|| fail`). This is the only way back from a bad migration (Prisma deploy is forward-only); the contract is correctly ordered. ✓
3. Pull `--ff-only` → frozen-lockfile install → prisma generate → `migrate deploy` → build. ✓ (no force-push/history rewrite anywhere)
4. PM2 `reload` (near-zero-downtime; falls back to `start ecosystem.config.cjs` on first deploy). ✓
5. Health gate: 15 × 2 s retries on `/healthz` + `/readyz`; on failure rolls the PM2 process back and prints the restore instruction referencing the pre-migration dump + anchor tag. ✓

P3 observation (DEPLOY-01): the failure path's `pm2 reload` restarts the **already-built new code** — true code rollback requires the documented manual step (checkout anchor tag → rebuild → reload). The script's failure message says exactly this, so the contract is honest; it is just not automated. Acceptable for a single-host demo deploy.

## 4. Process supervision (`ecosystem.config.cjs`) — static audit

| Item | Finding |
| --- | --- |
| Mode | fork, 1 instance — documented rationale (single Prisma pool, demo load); flagged "revisit for production" in-file ✓ |
| Restart policy | `autorestart`, `max_restarts: 10`, `max_memory_restart: 512M` — Phase 12 measured settled RSS ~190 MB and burst peak 400 MB, so 512 M is adequate but close under sustained concurrency; see DEPLOY-02 ✓ |
| Secrets | none in file — API self-loads gitignored `apps/api/.env` via `process.loadEnvFile` (`main.ts:16`) ✓ |
| Logs | PM2 out/err files with `merge_logs` + `time`; pairing with `pm2-logrotate` documented (Mini has hit StorageFull before) ✓ |
| Boot persistence | `pm2 save && pm2 startup` documented (launchd; systemd on a future VPS) — `NOT VERIFIABLE LOCALLY` |

P3 observation (DEPLOY-02): `max_memory_restart: 512M` vs Phase 12's 400 MB burst peak at 5 000-employee scale — at demo scale (40 employees) there is ample headroom, but a production tenant at bench scale under concurrent dashboard load could trip restart-thrash. Raise to 1 G (or move to cluster mode) when real multi-tenant load arrives.

## 5. Edge topology (`infra/Caddyfile`, `infra/cloudflared/config.example.yml`) — static audit

- Edge TLS at Cloudflare → tunnel (outbound-only, no inbound ports on the Mini) → Caddy `:8080` loopback → API `:4000`. ✓
- Caddy forwards `CF-Connecting-IP` into `X-Real-IP`/`X-Forwarded-For`; API trusts proxy chain for audit-log + rate-limit keying (`main.ts` trust-proxy). ✓
- Tunnel ingress rejects all hostnames except `api.staffly.av.online` (`http_status:404` catch-all). ✓
- Real tunnel credentials/config not in repo (example file only, with explicit do-not-commit warning). ✓
- Live behavior of edge/tunnel: `NOT VERIFIABLE LOCALLY`.

## 6. Monitoring / logging / alerting

| Surface | Finding | Evidence |
| --- | --- | --- |
| Error reporting | Sentry init gated on `SENTRY_DSN` (no-op dev/test); `GlobalExceptionFilter` reports **only genuine 5xx/unknown** via `captureException` — expected HttpExceptions excluded by design | `main.ts:27-34`, `http-exception.filter.ts:50-53` |
| Tracing | `tracesSampleRate: 0` (error-only) — documented decision for demo | `main.ts:32` |
| Health endpoints | `/healthz` liveness; `/readyz` = DB + storage (Redis/SMTP visibility gap = OI/ED-07, P3, accepted Phase 1 with readiness-semantics fix `d95849a`) | live: both 200 today |
| Log capture | PM2 files + logrotate pairing documented (§4); structured Nest logger with module context | `ecosystem.config.cjs:34-39` |
| Alerting | None beyond Sentry email defaults — acceptable for demo; flagged for GA in final report | — |

## 7. Findings

| ID | Severity | Finding | Recommendation |
| --- | --- | --- | --- |
| DEPLOY-01 | P3 | Health-fail path rolls back the PM2 process but not the code/migration (manual, correctly documented in the failure message) | Automate `git checkout <anchor> && rebuild` in the failure branch when moving past single-host demo |
| DEPLOY-02 | P3 | `max_memory_restart: 512M` vs measured 400 MB burst peak at 5 000-employee scale | Raise to 1 G or enable cluster mode before real multi-tenant load |

Closed at this gate: **ED-06** (production boot guards) — was the last expected-defect item touching deployment readiness.

## 8. Reproduction

```bash
# boot-guard refusal (from apps/api, after pnpm build)
NODE_ENV=production node dist/main.js          # → refuses, lists all violations
# backup + restore drill
PG_CONTAINER=staffly-postgres deploy/backup.sh
gunzip -c .backups/staffly-<ts>.sql.gz | docker exec -i staffly-postgres psql -U staffly -d <scratch_db>
```
