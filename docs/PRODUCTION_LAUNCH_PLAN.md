# Staffly — Production Launch Plan

Derived from the RC-1 inspection (2026-06-11, `docs/FINAL_RC_REPORT.md`,
`docs/OPEN_BLOCKERS.md`) on certified build `1c63d62`. **Plan only — do not
deploy.** Topology (from `DEPLOY_CHECKLIST.md`):
`Cloudflare edge (TLS) → Tunnel → Caddy(:8080) → NestJS API(:4000)` on the
Mac Mini; PG18 (Docker, loopback); portals on Vercel; R2 object storage;
registrable domain `staffly.av.online`.

RC-1 score **92/100**, **0×P0/P1 open**. Everything below is the bounded
work between the current certified build and a CONDITIONAL-GO production
launch.

Owner key: **BE** backend eng · **INF** infra/devops · **QA** verifier ·
**REL** release owner (sign-off). Risk: Low / Med / High.

---

## Phase A — Deploy-time code blockers (do FIRST, in-repo)

The only code changes between here and launch. Both are P2 hardenings found
by RC-1; fix on the branch, run full gates, commit. No new features.

| Step | Detail | Effort | Risk | Owner | Duration |
| --- | --- | --- | --- | --- | --- |
| A1 | **RC-05** — gate reset-URL `logger.warn` on `NODE_ENV !== "production"` (`apps/api/src/auth/auth.service.ts:407-409`) so live reset tokens never hit prod logs | 0.1 h | Low | BE | 15 min |
| A2 | **RC-01-residual** — make demo seed safe: `deploy/reset-demo.sh` fails fast when `DEMO_*_PASSWORD` unset **and/or** `seed-demo.ts` loads `apps/api/.env` | 0.25 h | Low | BE | 30 min |
| A3 | Full gates: `pnpm typecheck && lint && format:check && test && build` + integration (Colima Testcontainers) | 0.5 h | Low | QA | 45 min |
| A4 | Commit (conventional, `Gates:` line); **no push until REL approves** | 0.1 h | Low | REL | 10 min |

**Optional (recommended, not blocking):** RC-02 negative-duration check-out
guard + seed past-only check-ins (0.5 h); RC-03 in-app leave-decision
notification (0.5 h); RC-04/OBS-2 seed cosmetics (0.5 h). Defer to a
post-launch patch unless a customer demo needs them.

**Phase A total: ~1 h focused · Risk Low**

---

## Phase B — Cloudflare setup (OI-03)

`NOT VERIFIABLE LOCALLY`. Gated by `DEPLOY_CHECKLIST.md` §2, §5(WAF).

| Step | Detail | Effort | Risk | Owner | Duration |
| --- | --- | --- | --- | --- | --- |
| B1 | DNS: `api.staffly.av.online` via Tunnel; `admin.` + apex → Vercel; confirm shared registrable domain (cookie requirement) | 0.5 h | Med | INF | 30 min + DNS propagation |
| B2 | `cloudflared tunnel login/create/route`; fill `~/.cloudflared/config.yml`; run as launchd service (no inbound ports) | 1 h | Med | INF | 1 h |
| B3 | Caddy loopback `:8080→:4000`, `auto_https off`, forward `CF-Connecting-IP` | 0.5 h | Low | INF | 30 min |
| B4 | WAF rate-limit rule on `api.staffly.av.online/auth/*` (defence-in-depth over the app throttle verified in RC-1 Phase 8) | 0.5 h | Low | INF | 30 min |

**Phase B total: ~2.5 h work + DNS propagation (up to a few hrs) · Risk Med**
(DNS/tunnel are the classic first-deploy time sinks.)

---

## Phase C — R2 setup (OI-03)

Gated by `DEPLOY_CHECKLIST.md` §5. Storage path itself is proven (RC-1
Phase 7: byte-identical round-trip, tenant-prefixed keys, guard live on
MinIO).

| Step | Detail | Effort | Risk | Owner | Duration |
| --- | --- | --- | --- | --- | --- |
| C1 | Create bucket `staffly-demo`; R/W API token (access key id + secret) | 0.25 h | Low | INF | 15 min |
| C2 | Bucket CORS: origins `https://admin.staffly.av.online`, `https://staffly.av.online`; methods `GET,PUT`; headers `content-type, content-disposition` | 0.5 h | Med | INF | 30 min |
| C3 | Enable object versioning (also underpins rollback Phase G) | 0.1 h | Low | INF | 10 min |
| C4 | Set `S3_*` env (`S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, keys) | 0.25 h | Low | INF | 15 min |

**Phase C total: ~1 h · Risk Med** (CORS misconfig is the usual upload
failure; smoke-tested in Phase F).

---

## Phase D — Email provider setup (OI-02)

Gated by `DEPLOY_CHECKLIST.md` §9. Provider abstraction + SMTP/log path
verified live in RC-1 Phase 6 (5 flows through Mailhog); only the real
provider send is unverified.

| Step | Detail | Effort | Risk | Owner | Duration |
| --- | --- | --- | --- | --- | --- |
| D1 | Choose provider (Resend default per checklist); create account + API key | 0.5 h | Low | INF | 30 min |
| D2 | Domain auth: SPF/DKIM/DMARC for `staffly.av.online` sender | 1 h | Med | INF | 30 min + DNS propagation |
| D3 | Env: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM="Staffly <no-reply@staffly.av.online>"` (prod boot guard rejects the dev default — RC-1 Phase 9) | 0.25 h | Low | BE | 15 min |
| D4 | Confirm prod boot guard passes with real values (mailer module is boot-fatal on misconfig) | 0.25 h | Low | QA | 15 min |

**Phase D total: ~2 h + DKIM/DMARC propagation · Risk Med** (deliverability/
DNS is the variable; first sends may land in spam until DMARC aligns).

---

## Phase E — Production verification (OI-01)

The live-only checks that close OI-01 (cookie/CORS on the real domain).
Static config already audited clean (RC-1 Phase 9).

| Step | Detail | Effort | Risk | Owner | Duration |
| --- | --- | --- | --- | --- | --- |
| E1 | API env complete + `NODE_ENV=production`; confirm app **boots** (env guards green for COOKIE_DOMAIN/APP_BASE_URL/EMAIL_FROM) | 0.5 h | Low | BE | 30 min |
| E2 | First release via `deploy/release.sh` (tag → backup → migrate → build → PM2 reload → health-check, auto-rollback on fail) | 0.5 h | Med | REL | 30 min |
| E3 | `/healthz` 200 + `/readyz` `database:ok, storage:ok` over HTTPS _(verify live)_ | 0.25 h | Low | QA | 15 min |
| E4 | **Cross-subdomain cookie + CORS**: log in on both portals against `api.staffly.av.online` — proves OI-01 | 0.5 h | Med | QA | 30 min |
| E5 | Vercel ×2: project roots, custom domains, `NEXT_PUBLIC_*` build env set + redeployed | 0.5 h | Low | INF | 30 min |

**Phase E total: ~2.25 h · Risk Med** (cross-subdomain cookie is the
highest-signal live check; a wrong `COOKIE_DOMAIN` shows here).

---

## Phase F — Smoke testing (the RC-1 battery, run live)

Re-run the verified-local flows against production. Use the demo tenant
only; mind the RC-1 demo notes (`DEMO_READINESS.md`).

| Step | Detail | Effort | Risk | Owner | Duration |
| --- | --- | --- | --- | --- | --- |
| F1 | **4-account login matrix** (superadmin/hr/manager/employee) — the exact failure RC-01 caught; export `DEMO_*_PASSWORD` before any reseed | 0.25 h | Med | QA | 15 min |
| F2 | `pnpm --filter @staffly/api db:verify:demo` → expect **6/6** | 0.1 h | Low | QA | 10 min |
| F3 | Employee + manager + HR journeys (check-in/out, apply→approve/reject leave, create/edit employee, announcements) | 0.5 h | Low | QA | 30 min |
| F4 | Document upload→download→acknowledge (proves R2 presign round-trip live — closes the C2 risk) | 0.25 h | Med | QA | 15 min |
| F5 | Trigger password reset; confirm email arrives via the live provider (closes OI-02) | 0.25 h | Med | QA | 15 min |
| F6 | Dashboard counters spot-check vs DB; confirm RC-05 fix (no reset URL in prod logs) | 0.25 h | Low | QA | 15 min |

**Phase F total: ~1.5 h · Risk Med**

---

## Phase G — Rollback plan (rehearse once BEFORE go-live)

From `DEPLOY_CHECKLIST.md` §11 + `RUNBOOK.md`. Local backup→restore drill
already re-run green in RC-1 Phase 9 (0 errors, 37 tables).

| Vector | Procedure | Effort | Risk | Owner | Duration |
| --- | --- | --- | --- | --- | --- |
| G1 Code | `git checkout <deploy-tag>` → `deploy/release.sh`; PM2 keeps prior process for instant reload | 0.5 h | Low | REL | 30 min |
| G2 Migration (forward-only) | Restore pre-migration dump (`backup.sh` runs before every migrate) + redeploy prior tag | 0.5 h | High | INF | 30 min |
| G3 Frontend | Vercel → promote a prior immutable build to Production | 0.1 h | Low | INF | 10 min |
| G4 Storage | R2 versioning restore; MinIO read-only fallback until R2 verified | 0.25 h | Med | INF | 15 min |
| G5 **Prod-host restore drill (OI-04)** | Run one restore against the production host before declaring stable — the local drill is green; this closes the residual | 1 h | Med | INF/QA | 1 h |

**Phase G total: ~2.5 h (mostly the OI-04 drill) · Risk Med-High**
(G2 is the highest-consequence path — forward-only migrations mean the dump
is the only way back; rehearse it.)

---

## Estimated effort to production

| Phase | Focused effort | Notes |
| --- | --- | --- |
| A Code blockers | 1 h | in-repo, gated |
| B Cloudflare | 2.5 h | + DNS propagation |
| C R2 | 1 h | |
| D Email | 2 h | + DKIM/DMARC propagation |
| E Prod verification | 2.25 h | |
| F Smoke testing | 1.5 h | |
| G Rollback rehearsal | 2.5 h | incl. OI-04 prod-host drill |
| **Total focused** | **~12.75 h** | one engineer, hands-on |
| Coordination / propagation / buffer (~40%) | ~5 h | DNS + DKIM waits, context switches |
| **Realistic elapsed to production** | **~16–18 h ≈ 2–3 working days** | gated by DNS/DKIM propagation, not keyboard time |

**Hard prerequisite (one-time, host):** Mac Mini ≥20 GB free disk, toolchain
installed (`cloudflared`, `caddy`, `awscli`, `pm2`), Cloudflare zone + R2
enabled (`DEPLOY_CHECKLIST.md` §0) — not counted above; assumed done or
add ~2 h.

---

## Launch timeline

```
Day 1 (AM)  A  Code blockers RC-05 + RC-01 → gates → commit        [BE/QA] ~1h
Day 1 (AM)  B1 DNS records created (start propagation early)        [INF]   ~0.5h
Day 1 (PM)  B2-B4 Tunnel + Caddy + WAF                              [INF]   ~2h
Day 1 (PM)  C  R2 bucket + CORS + versioning + env                 [INF]   ~1h
Day 1 (PM)  D1-D2 Email provider + DKIM/DMARC (start propagation)   [INF]   ~1.5h
            ── overnight: DNS + DKIM propagate ──
Day 2 (AM)  D3-D4 Email env + boot-guard check                     [BE/QA] ~0.5h
Day 2 (AM)  E  Prod env → first release → health → cookie/CORS     [REL/QA] ~2.25h
Day 2 (PM)  F  Smoke battery (login matrix, verify-demo, journeys,
               upload, reset email, dashboards)                    [QA]    ~1.5h
Day 2 (PM)  G  Rollback rehearsal incl. OI-04 prod-host drill      [INF/QA] ~2.5h
Day 3 (AM)  REL sign PROD_SIGNOFF.md (explicit) → go-live decision [REL]
Day 3       Backups scheduled + uptime monitor + Sentry live       [INF]   ~1h
```

**Critical path:** A → B1 (DNS) → D2 (DKIM) are the propagation gates; start
B1 and D2 as early as possible on Day 1 so the overnight wait isn't on the
critical path twice. Everything in E/F/G is keyboard-bound and fast once DNS
resolves.

**Go-live gate:** all `DEPLOY_CHECKLIST.md` Blocking boxes checked + Phase F
green + Phase G rehearsed + `PROD_SIGNOFF.md` signed (OI-15, explicit human
action). **No push/merge/deploy without that sign-off.**

---

## Open items this plan closes

| Item | Sev | Closed by |
| --- | --- | --- |
| RC-05 reset-URL logging | P2 | A1 |
| RC-01-residual reseed password guard | P2 | A2 + F1 |
| OI-01 prod cookie/CORS | deploy-time | E4 |
| OI-02 live email send | deploy-time | D + F5 |
| OI-03 R2 + Cloudflare | deploy-time | B + C + F4 |
| OI-04 prod-host restore | deploy-time | G5 |

Deferred (post-launch patch, non-blocking): RC-02, RC-03, RC-04, OBS-1,
OBS-2 — see `docs/OPEN_BLOCKERS.md` §2.
