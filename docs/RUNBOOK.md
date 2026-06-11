# Staffly — Operations Runbook

Operational procedures for the local dev stack and the demo deployment. For
the full production deployment design see [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Services & ports

| Service | Port | Notes |
| --- | --- | --- |
| Admin portal | 3000 | Next.js (`next dev` locally) |
| Employee portal | 3001 | Next.js |
| API | 4000 | NestJS; `/healthz`, `/readyz` |
| PostgreSQL 18 | 5433 → 5432 | Docker container `staffly-postgres` |
| Redis | 6379 | Container `staffly-redis` (provisioned; unused by app) |
| MinIO | 9000 / 9001 | S3-compatible storage / console |
| Mailhog | 1025 / 8025 | Dev SMTP / web UI — drop for `EMAIL_PROVIDER=smtp` (Mailerservice wired for invites, password reset, welcome, leave decisions) |

## Starting services

```bash
# 1. Infra
docker compose -f infra/docker-compose.dev.yml up -d
# 2. Migrate + seed
pnpm --filter @staffly/api prisma:migrate:deploy
pnpm --filter @staffly/api db:seed
pnpm --filter @staffly/api db:seed:demo      # rich demo org
# 3. All three app servers
pnpm dev
```

Verify: `curl -s localhost:4000/readyz` → `{"status":"ok","checks":{"database":"ok","storage":"ok"}}`.

## Restarting services

```bash
# App servers (stop the running `pnpm dev`, then):
pnpm dev
# Infra:
docker compose -f infra/docker-compose.dev.yml restart
```

> **Do NOT run `pnpm build` while `pnpm dev` is running.** Both write to
> `.next`; a production build corrupts the dev server (symptom:
> `__webpack_modules__ is not a function`, blank/stale UI). Fix: stop dev,
> `rm -rf apps/{admin,employee}/.next`, restart `pnpm dev`.

## Docker / Colima recovery

This environment uses **Colima** (Docker Desktop / OrbStack alternative).

```bash
# Is Docker reachable?
docker ps
# If "command not found": ensure /opt/homebrew/bin is on PATH (colima + docker
# CLI install there). If the daemon is down:
colima start --cpu 2 --memory 4 --disk 20
# Stale credential helper error on image pull (osxkeychain missing):
#   remove "credsStore" from ~/.docker/config.json
# Testcontainers can't find a runtime (stale /var/run/docker.sock symlink):
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
```

Bring the stack back after a Docker restart:

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

## Database recovery

```bash
# Inspect
docker exec staffly-postgres psql -U staffly -d staffly -c "\dt"
# Re-apply migrations (forward-only)
pnpm --filter @staffly/api prisma:migrate:deploy
# Rebuild demo data (recreates only the staffly-demo org)
deploy/reset-demo.sh
# Backup / restore (prod): pg_dump → gzip → R2; restore the pre-migration dump
deploy/backup.sh
```

## Common errors

| Symptom | Cause | Fix |
| --- | --- | --- |
| API won't boot, `P1001` | Postgres not reachable | `docker compose ... up -d`; check `:5433` |
| UI shows old/empty data | Expired session (15-min TTL) or wrong org | Re-login as `@acme.demo`; hard-refresh |
| UI stale after edits | Corrupted `.next` from `pnpm build` during dev | Stop dev, clear `.next`, restart |
| `Could not find a working container runtime strategy` | Testcontainers can't see Colima | set `DOCKER_HOST` (see above) |
| `readyz` 503 `storage:fail` | MinIO/R2 down | `docker start staffly-minio` / check R2 |
| Image pull `docker-credential-osxkeychain not found` | helper removed with Docker Desktop | drop `credsStore` from `~/.docker/config.json` |

## Production deployment (summary)

Full design in [`DEPLOYMENT.md`](DEPLOYMENT.md). Topology:
`Cloudflare edge → Tunnel → Caddy → NestJS (PM2) :4000`; PostgreSQL 18 on the
host (loopback-bound); Cloudflare R2 for storage; Vercel for the two portals;
Sentry + uptime monitoring.

```bash
deploy/release.sh    # tag → backup → migrate → build → pm2 reload → healthcheck
```

## Rollback procedures

| Layer | Rollback |
| --- | --- |
| API code | `git checkout <deploy-tag>` → `deploy/release.sh` (PM2 keeps prior process) |
| Migration (forward-only) | restore the pre-migration `pg_dump` (`backup.sh` runs before every migrate) + redeploy prior tag |
| Frontend | Vercel "Promote to Production" → prior immutable build |
| Storage | R2 versioning; MinIO read-only fallback until R2 verified |
| Demo data | `deploy/reset-demo.sh` |
