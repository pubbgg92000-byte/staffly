# Phase 12 — Performance Certification

Captured: 2026-06-11 · Branch `feat/v0.23.2-prod-readiness` @ `2883817` · Scratch tenants `staffly-bench-{50,500,5000}` (created for this phase, deleted after — see §6)
Method: deterministic scratch-org generator (`apps/api/prisma/seed-bench.ts`) seeded three isolated tenants at 50/500/5000 employees in the local dev DB; endpoints benchmarked with scripted curl timing loops (`apps/api/scripts/bench-endpoints.sh`); per-request SQL statement counts via Postgres `log_statement=all` window-counting; API process memory/CPU via `ps` snapshots. Every number below is from a live measurement on this machine.

## Verdict: PASS — all five benchmarked endpoints stay under 51 ms p95 at 5 000 employees (sequential); SQL statement counts are scale-flat (no N+1); no open P0/P1. 1 × P3 observation (dashboard query fan-out + ~2.4× latency growth at 100× data).

## 1. Environment

| Item | Value | Source |
| --- | --- | --- |
| Hardware | Apple M4, 16 GB RAM | `sysctl` |
| Node | v22.22.2 (`node --enable-source-maps`, single process, port 4000) | `node --version`, `lsof` |
| PostgreSQL | 18.4 (aarch64, Alpine) in Docker via Colima | `SELECT version()` |
| ORM | `@prisma/client` ^6.2.1, tenant-extended client | `apps/api/package.json` |
| API mode | dev server (`pnpm dev`), same process throughout | `/tmp/staffly-dev.log` |

Caveat: dev-mode Node on a laptop over localhost. Absolute numbers will differ in production (network RTT, prod build, container limits); the **scaling shape** (50→500→5000) is the certified result. `NOT VERIFIABLE LOCALLY` — production latency under real WAN/TLS.

## 2. Dataset (deterministic generator)

`apps/api/prisma/seed-bench.ts` — seeded PRNG keyed by N, idempotent (wipes then recreates its own org only), tenant-scoped. Document rows carry org-prefixed storage keys but no binaries (benchmarked endpoints never fetch objects; keeps MinIO clean).

| Org | Employees | Attendance (90 d) | Leave requests | Leave balances | Documents | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| `staffly-bench-50` | 50 | 3 159 | 75 | 200 | 8 + 50 personal | SQL count |
| `staffly-bench-500` | 500 | 31 490 | 754 | 2 000 | 8 + 200 personal | SQL count |
| `staffly-bench-5000` | 5 000 | 315 302 | 7 552 | 20 000 | 8 + 200 personal | SQL count + seed output |

Admin login per org: `admin@bench<N>.test` / `Bench!Passw0rd` (signin verified 200 for all three, super_admin, correct org binding).

## 3. Latency — sequential (n=30 per cell, 3 warm-up requests discarded, cookie-jar auth, localhost)

All values in milliseconds, measured with `curl -w %{time_total}` (full request incl. auth guards + serialization).

### p50 / p95 by scale

| Endpoint | 50 emp p50/p95 | 500 emp p50/p95 | 5000 emp p50/p95 | p95 growth 50→5000 |
| --- | --- | --- | --- | --- |
| `GET /dashboard/admin` | 14.3 / 21.2 | 14.3 / 17.6 | 36.5 / 43.6 | 2.1× |
| `GET /employees?page=1&pageSize=20` | 6.3 / 7.2 | 6.2 / 8.3 | 6.6 / 7.8 | 1.1× |
| `GET /attendance?page=1&pageSize=20` | 5.3 / 6.7 | 5.8 / 7.0 | 15.2 / 16.8 | 2.5× |
| `GET /leave/requests?page=1&pageSize=20` | 5.6 / 7.4 | 5.5 / 6.4 | 8.1 / 9.4 | 1.3× |
| `GET /documents?page=1&pageSize=20` | 4.8 / 6.8 | 4.8 / 5.9 | 5.0 / 5.6 | 0.8× |

Full distributions (min/p50/p95/max/mean × 3 scales × 5 endpoints, 450 samples) recorded at capture time in `/tmp/bench-samples-{50,500,5000}.tsv`; summary rows reproduced from the bench-script TSV output verbatim.

**Reading:** worst absolute case is dashboard@5000 at 50.2 ms max. Sub-linear growth everywhere — 100× data → ≤2.5× p95. Paginated lists are effectively scale-flat thanks to indexed `LIMIT/OFFSET` queries; the two endpoints that aggregate over the full tenant (dashboard counts, attendance with 315 k rows) grow modestly.

## 4. Pathological-access probes @ 5000 employees (single requests)

| Probe | Result |
| --- | --- |
| `GET /employees?page=250&pageSize=20` (last page, offset 4 980) | 200, 10.6 ms |
| `GET /attendance?page=1577&pageSize=100` (offset 157 600) | 200, 28.4 ms |
| `GET /employees?search=emp` (ILIKE over 5 000 rows) | 200, 9.2 ms |
| `GET /leave/requests?status=pending&pageSize=100` | 200, 8.8 ms |

Deep OFFSET pagination does not degrade measurably at this scale (Postgres handles 150 k-row offsets in-buffer). At ≫100 k rows per tenant keyset pagination would be the upgrade path; not needed for certification.

## 5. Concurrency, throughput, process footprint

Burst: 10 concurrent clients (`xargs -P10`), bench-5000 tenant:

| Endpoint | n | p50 | p95 | max | Wall | Throughput |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /dashboard/admin` | 50 | 246.7 ms | 415.8 ms | 451.6 ms | 1.50 s | 33.4 req/s |
| `GET /employees?page=1&pageSize=20` | 100 | 23.7 ms | 39.3 ms | 49.7 ms | 0.41 s | 243.4 req/s |

Process snapshots (`ps -o rss,pcpu`, PID 37742):

| Moment | RSS | CPU |
| --- | --- | --- |
| Idle pre-bench | 71.6 MB | 0.0 % |
| After 50-scale loop | 217.9 MB | 22.5 % |
| After 5000-scale loop | 271.8 MB | 21.5 % |
| Peak during 10-way dashboard burst | 400.0 MB | 211 % (multi-core) |
| Settled 5 s after bursts | 188.5 MB | 0.0 % |

No leak signature: RSS returns to ~190 MB after load; peak 400 MB under deliberate 10-way aggregation burst is V8 heap headroom, reclaimed immediately.

## 6. SQL statement counts per request (Prisma query behavior)

Postgres `log_statement=all` enabled, one request per measurement window, idle-noise baseline confirmed 0 over 5 s. Counts include Prisma's `BEGIN/COMMIT` and auth-guard lookups (session, RBAC, scope) — i.e. whole-request totals.

| Endpoint | @50 | @500 | @5000 | Scale-flat? |
| --- | --- | --- | --- | --- |
| `GET /dashboard/admin` | 51 | 59 | 49 | YES |
| `GET /employees` (p1) | 11 | 11 | 11 | YES |
| `GET /attendance` (p1) | 8 | 8 | 8 | YES |
| `GET /leave/requests` (p1) | 9 | 10* | 9 | YES |
| `GET /documents` (p1) | 7 | 7 | 7 | YES |

\* first sweep recorded 25 for leave@500; three re-measurements gave 10/10/9 — the 25 was window contamination from a coincident dev-server background request, not endpoint behavior.

**No N+1 anywhere**: list endpoints issue a fixed number of statements independent of rows in the tenant. Dashboard's ~50 statements per request is a wide aggregation fan-out (per-metric counts), not per-row work — it is also the slowest endpoint and the one that saturates first under concurrency (33 req/s @5000). Logged as **PERF-01 (P3)** below.

Statement logging was reset afterwards: `ALTER SYSTEM RESET log_statement` → `SHOW log_statement` = `none` (verified).

## 7. Teardown & demo-tenant integrity

1. Pre-teardown snapshot of `staffly-demo` row counts taken (8 tables).
2. `DELETE FROM users WHERE organization_id IN (bench orgs)` (users are `onDelete: Restrict`) then `DELETE FROM organizations WHERE slug LIKE 'staffly-bench-%'` (everything else cascades) — `DELETE 3` / `DELETE 3`, committed.
3. Bench orgs remaining: **0**. Total orgs: **2** (`staffly-demo`, `staffly-dev`).
4. Post-teardown snapshot **diff-identical** to pre: employees 40, users 4, attendance 2 378, leave_requests 59, leave_balances 161, documents 28, announcements 8, notifications 24. **DEMO TENANT UNTOUCHED ✓**
5. `admin@bench50.test` signin after delete → **401** (credentials dead).
6. MinIO: nothing to clean — bench seed never uploaded binaries by design.

## 8. Findings

| ID | Severity | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| PERF-01 | P3 | `GET /dashboard/admin` issues ~50 SQL statements/request and is the slowest endpoint (36.5 ms p50 @5000 sequential; 247 ms p50 under 10-way concurrency, 33 req/s). Fine for an admin page today; first candidate if dashboards ever feel slow. | §3, §5, §6 | Optional: collapse per-metric counts into fewer grouped aggregate queries and/or cache with a short TTL. No action required for v1.0. |

No P0/P1/P2. Pagination, search, filtered queries, deep offsets and memory behavior all certified healthy at 100× current demo scale.

## 9. Reproduction

```bash
# seed (per scale)
pnpm --filter @staffly/api exec tsx prisma/seed-bench.ts 5000
# benchmark
bash apps/api/scripts/bench-endpoints.sh 5000 admin@bench5000.test 'Bench!Passw0rd' 30
# teardown all bench orgs
pnpm --filter @staffly/api exec tsx prisma/seed-bench.ts --delete
```
