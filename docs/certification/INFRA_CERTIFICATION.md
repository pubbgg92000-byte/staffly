# Phase 1 — Infrastructure Certification

Captured: 2026-06-10 (~12:20Z) · Program phase 1 of 17 · Baseline: `docs/CERTIFICATION_BASELINE.md`
Method: live failure drills against the running dev stack + static audit of all supervision/topology configs. Prod-host-only state marked NOT VERIFIABLE LOCALLY.

## Verdict: PASS with findings (local stack: all drills pass; prod supervision configs: 2 × P1, 7 × P2 gaps)

| Component | Verdict | Evidence |
| --- | --- | --- |
| Docker (Colima) | **PASS** — cold start, stop/start, full-stack restart all clean | drills §2 |
| PostgreSQL 18 | **PASS** — healthcheck, outage degradation, self-recovery, data intact | drill D3, D5 |
| Redis 7 | **PASS (unused)** — healthy, restart clean; not probed by readyz, consumed by zero source files (OI-09 confirmed live) | drill D1 |
| MinIO | **PASS** — healthcheck, outage degradation, self-recovery | drill D4 |
| Mailhog | **PASS** — restart clean (no compose healthcheck — F-1.11) | drill D2 |
| PM2 | **PASS with notes** — sound fork supervision, memory cap, clean env separation; no restart backoff (F-1.6), logrotate unenforced (F-1.8) | `ecosystem.config.cjs` |
| Caddy | **PASS with notes** — routing/compression/forwarded-IP correct, port-consistent with PM2+tunnel; no body cap/access log (F-1.11), supervision unpinned (F-1.7) | `infra/Caddyfile` |
| Cloudflare Tunnel | **NOT VERIFIABLE LOCALLY** — example ingress correct and Caddy-consistent; live tunnel/DNS/service exist only on prod host | `infra/cloudflared/config.example.yml` |
| Environment variables | **PASS with findings** — schema ↔ .env.example full parity (32 vars); portals full parity; but DEPLOYMENT.md omits boot-fatal EMAIL_PROVIDER (F-1.2) and SMTP_SECURE coercion is wrong (F-1.3) | §3 |
| Health checks (`/healthz`) | **PASS** — pure liveness, 200 during every outage drill, `@Public` + `@SkipThrottle` | drills, `health.controller.ts:48-51` |
| Readiness (`/readyz`) | **PASS with findings** — correct degrade/recover semantics live; no probe timeouts (F-1.5), unconfigured-storage maps to fail not skipped (F-1.4), 503 envelope generic (F-1.10/OI-08) | drills, §4 |

## 1. Startup

Cold start verified this session: Colima start → `docker compose -f infra/docker-compose.dev.yml up -d` → postgres/redis/minio healthy via healthchecks, minio-init bucket creation gated on `service_healthy`, API boot log "Nest application successfully started", `/readyz` 200 both checks ok. Migrations: 8/8 applied, no pending.

## 2. Live failure drills (all PASS)

| # | Drill | Observed | Expected? |
| --- | --- | --- | --- |
| D1 | Redis stop → probe → start | readyz **200** during outage (Redis not probed — by design while unused); container healthy after start | YES |
| D2 | Mailhog restart | UI 200, container running | YES |
| D3 | Postgres stop → probe → start | healthz **200**; readyz **503** body: `{"error":{"code":"error","message":"error","details":{"status":"degraded","checks":{"database":"fail","storage":"ok"}}}}`; signin **500**. After start: readyz **200**, signin **200** — **no API restart needed** | YES (envelope shape = F-1.10) |
| D4 | MinIO stop → probe → start | readyz **503** `checks:{database:"ok",storage:"fail"}`; signin **200** (degraded-not-dead — DB endpoints serve during storage outage). After start: readyz **200** | YES |
| D5 | Full stack `compose restart` | All 4 containers healthy ≤10 s; readyz 200; data intact: staffly-demo employees=40 attendance=2377 (matches baseline) | YES |

## 3. Environment contract

- **API**: all 32 schema vars (`apps/api/src/infra/config/env.ts`) present in `apps/api/.env.example`; nothing in the example is outside the schema. Required-no-default: `DATABASE_URL`, `JWT_SECRET` — fail-fast with clear zod messages at boot (`env.ts:115-126`).
- **Portals**: `.env.local.example` ↔ actual `NEXT_PUBLIC_*` usage full parity (client.ts, role-redirect.ts, Sentry configs).
- **Prod wiring**: PM2 injects only `NODE_ENV=production`; secrets self-loaded from gitignored `apps/api/.env` (`main.ts:15-19`) — clean separation. Prod compose hard-fails on missing `POSTGRES_PASSWORD`; loopback-only `127.0.0.1:5433` matching DATABASE_URL in deploy docs and backup.sh.
- Out-of-schema operational vars (compose POSTGRES_*, DEMO_*_PASSWORD, release.sh/backup.sh knobs, awscli creds for R2 backup upload) consumed outside API runtime; backup credential conventions undocumented (F-1.14).

## 4. Health endpoint semantics (source-verified)

- `/healthz`: unconditional `{status:"ok"}`, probes nothing — correct liveness.
- `/readyz`: parallel probes — DB `SELECT 1`, storage `HeadBucketCommand`; ok iff db ok AND storage ≠ fail; degraded → `ServiceNotReady` 503 (`health.controller.ts:53-88`). **Not probed**: Redis (unused), mailer (presence-validated at boot only, never connectivity — F-1.13n/OI-02).
- 503 wire shape confirmed live = `GlobalExceptionFilter.normalize()` has no 503 `defaultCode` case → `code:"error", message:"error"`, breakdown survives under `error.details` (`http-exception.filter.ts:59-90`). 200 and 503 bodies have different shapes — monitors parsing `body.status` on a 503 break (F-1.10 = OI-08 confirmed).

## 5. Findings register

| ID | Sev | Finding | Source | Disposition |
| --- | --- | --- | --- | --- |
| F-1.1 | **P1** | `release.sh` failure path claims "Code rolled back via PM2" but reloads the **same overwritten** `apps/api/dist` (built in-place at :58) — no versioned releases, no checkout of the rollback tag; a failed deploy stays broken while reporting recovery. Related: `pm2 reload` in fork-mode/1-instance is stop-then-start, so the "near-zero-downtime" claim is also false | `deploy/release.sh:58,80-84`; `ecosystem.config.cjs:24-25` | **Phase 13** (needs design: versioned release dirs or checkout-rollback) |
| F-1.2 | **P1** | `docs/DEPLOYMENT.md` §5 env table omits `EMAIL_PROVIDER`/`EMAIL_FROM` while `1d29173` made unset `EMAIL_PROVIDER` **boot-fatal in production**; DEPLOY_CHECKLIST.md:51 lists it — deploy docs contradict; operator following DEPLOYMENT.md alone ships an API that cannot start | `docs/DEPLOYMENT.md:79-94`; `mailer.module.ts:155-170` | **FIXED at gate** — env table now lists EMAIL_PROVIDER (boot-fatal note), EMAIL_FROM, provider creds |
| F-1.3 | P2 | `SMTP_SECURE: z.coerce.boolean()` — `Boolean("false") === true`; shipped `.env.example:78` sets `SMTP_SECURE=false` literally → parses TRUE when copied, breaking Mailhog/STARTTLS with opaque TLS errors (latent locally only because dev `.env` leaves it unset) | `env.ts:100`; `.env.example:78` | **FIXED at gate** — strict `z.enum(["true","false"]).transform()`; 4 unit tests (`test/infra/env.spec.ts`) |
| F-1.4 | P2 | Unconfigured object storage → `/readyz` permanently 503: the not-configured stub assigns a **rejecting** `healthCheck` so the probe maps to "fail", not the documented "skipped"; boots fine, never ready, release.sh declares release unhealthy | `storage.module.ts:178-185`; `health.controller.ts:81-88` | **FIXED at gate** — stub no longer exposes `healthCheck`; storage-less boot probes "skipped"/ready; tests in `test/health/readyz.spec.ts` |
| F-1.5 | P2 | No readiness probe timeouts (no AbortSignal/race on DB or S3 probe; AWS SDK default unbounded) — a hung dependency stalls `/readyz` instead of fast-503; `release.sh` health curl has no `--max-time`, so a wedged dep hangs the deploy script | `health.controller.ts:53-88`; `release.sh:71-78` | **FIXED at gate** — `withTimeout()` bounds both probes at 3 s; `curl --max-time 5` in release.sh; timeout unit-tested |
| F-1.6 | P2 | PM2: `max_restarts: 10` with no `min_uptime`/backoff — persistent boot failure (now more likely: mailer is prod-fatal) burns 10 restarts in seconds, process sits errored indefinitely | `ecosystem.config.cjs:26-27` | Phase 13 |
| F-1.7 | P2 | Caddy + cloudflared supervision not pinned (foreground/"or brew services"/"or launchd") — both are single points of failure for all public traffic; live state NOT VERIFIABLE LOCALLY | `docs/DEPLOYMENT.md:72`; `config.example.yml:11` | Phase 13 |
| F-1.8 | P2 | pm2-logrotate exists only as a comment; host has StorageFull history; unbounded logs risk the disk-space failure backup.sh itself guards against | `ecosystem.config.cjs:34-39` | Phase 13 |
| F-1.9 | P2 | Deploys not gated on green CI (`git pull --ff-only`, no status check); CI `artifact` job `needs: [check]` only — an artifact can publish from a main push whose **test job failed** | `release.sh:46`; `.github/workflows/ci.yml:100` | Phase 13 |
| F-1.10 | P3 | OI-08 confirmed with exact wire shape (§2 D3): add 503 case to `defaultCode()` (e.g. `service.unavailable`) and/or have `ServiceNotReady` carry code/message | `http-exception.filter.ts:73-90` | **FIXED at gate** — `defaultCode` 503 case + `ServiceNotReady` carries code/message; shape unit-tested + live-verified (§7) |
| F-1.11 | P3 | Proxy/stack hygiene rollup: Caddy lacks `request_body max_size` + access log; CI lacks dependency audit/secret scanning; `postgres:18-alpine` major-pin only; Mailhog no healthcheck; dev ports bind all interfaces with dev creds | Caddyfile:25-35; ci.yml; compose files | Phase 13 (checklist items) |
| F-1.12 | P3 | `REDIS_URL` declared in schema, consumed by zero source files; Redis not probed (correct while unused) — dead config surface = OI-09, now live-confirmed (D1) | `env.ts:10` | Phase 13/15 (drop or annotate) |
| F-1.13 | P3 | Stale references: `role-redirect.ts:13` claims `NEXT_PUBLIC_PORTAL` (read nowhere); `RUNBOOK.md:16` says email "not wired" (wired since a0754c6); mailer validated for presence, never connectivity | as cited | Phase 15 (docs) / OI-02 (live send) |
| F-1.14 | P3 | Backup-path credentials out-of-band: awscli creds for R2 upload and compose POSTGRES_* ↔ DATABASE_URL consistency are operator-managed with no documented convention | `backup.sh:27-35,69-75` | Phase 13 |

## 6. Gate fixes — implemented and verified (approved 2026-06-10)

F-1.2, F-1.3, F-1.4, F-1.5, F-1.10 fixed at this gate (changes: `env.ts`, `storage.module.ts`, `health.controller.ts`, `http-exception.filter.ts`, `release.sh`, `DEPLOYMENT.md`; +10 unit tests in `test/infra/env.spec.ts`, `test/health/readyz.spec.ts`). F-1.1, F-1.6..9, F-1.11, F-1.12, F-1.14 → Phase 13; F-1.13 → Phase 15.

## 7. Post-fix re-verification (live)

Postgres outage drill re-run after the fixes — degraded body is now self-describing and recovery unchanged:

```
during outage  → 503 {"error":{"code":"service.unavailable","message":"service not ready: dependency check failed",
                       "details":{"status":"degraded","checks":{"database":"fail","storage":"ok"}}}}
after restart  → 200 {"status":"ok","checks":{"database":"ok","storage":"ok"}}
```

Gates after fixes: typecheck 7/7 · lint 0 errors · format clean · unit 83/83 (73 + 10 new) · integration 243/243 · build 7/7 — recorded in the phase commit.
