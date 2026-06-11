# RC-1 Inspection — Phase 1: Baseline

Captured: 2026-06-11 · Inspection scope: final release-candidate verification
(evidence-only; no new tenants/users/datasets; no push/merge/deploy).

## 1. Source state

| Item | Value | Evidence |
| --- | --- | --- |
| Branch | `feat/v0.23.2-prod-readiness` | `git branch --show-current` |
| HEAD | `1c63d62` — docs(certification): final deliverables (94/100) | `git log -1` |
| Working tree | clean (no modified/untracked files) | `git status --short` → empty |
| Prior HEAD-1 / HEAD-2 | `b204bb4` defect reconciliation · `b9dd6f2` phase 17 demo script | `git log -3` |

## 2. Runtime services

| Service | Status | Evidence |
| --- | --- | --- |
| API (NestJS) | UP — node pid 61401 listening :4000 | `lsof -iTCP:4000` |
| Admin portal (Next.js) | UP — :3000, `GET /` → 307 (auth redirect), sign-in 200 in dev log | `curl`, `/tmp/staffly-dev.log` |
| Employee portal (Next.js) | UP — :3001, `GET /` → 307 (auth redirect), sign-in 200 in dev log | `curl`, `/tmp/staffly-dev.log` |
| Node / pnpm | v22.22.2 / 11.5.0 | `node --version`, `pnpm --version` |

## 3. Docker infrastructure (Colima)

| Container | Status | Ports |
| --- | --- | --- |
| staffly-postgres | Up 21h (healthy) — PostgreSQL 18.4 | 5433→5432 |
| staffly-redis | Up 22h (healthy) | 6379 |
| staffly-minio | Up 22h (healthy) | 9000–9001 |
| staffly-mailhog | Up 22h — UI :8025 → 200 | 1025, 8025 |

## 4. Health endpoints

| Endpoint | Response | Verdict |
| --- | --- | --- |
| `GET /healthz` | `{"status":"ok"}` | PASS |
| `GET /readyz` | `{"status":"ok","checks":{"database":"ok","storage":"ok"}}` | PASS — per-dependency breakdown present (OI-08 fix holding) |

## 5. Demo tenant state (DB evidence)

Org: **Acme Corporation** · slug `staffly-demo` · id
`019e0000-0000-7000-8000-000000000001` · timezone `America/New_York`
(**US profile is currently seeded**; the India profile exists as
`DEMO_PROFILE=india` re-seed of the same pinned org). A second org
`staffly-dev` (Staffly Dev) exists for isolation probes.

| Dataset | Count |
| --- | --- |
| Employees (active, not deleted) | 40 |
| Attendance records | 2,377 |
| Leave requests | 59 |
| Documents | 22 |
| Announcements | 8 |
| Holidays (org calendars) | 12 |

Demo accounts (all `status=active`, tenant `staffly-demo`):

| Email | Role |
| --- | --- |
| superadmin@acme.demo | Super Admin |
| hr@acme.demo | HR Admin |
| manager@acme.demo | Manager |
| employee@acme.demo | Employee |

## 6. Verdict

**Baseline PASS.** All services up, health green with dependency breakdown,
working tree clean at the certified HEAD, demo tenant fully seeded with the
four required accounts active and role-mapped. Proceeding to Phase 2
(real login/logout/refresh certification).
