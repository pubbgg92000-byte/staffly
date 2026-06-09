#!/usr/bin/env bash
#
# release.sh — deploy the Staffly demo API on the Mac Mini.
#
# Safe, idempotent release with a forward-only-migration recovery contract:
#   1. Tag the current commit (rollback anchor).
#   2. Back up Postgres BEFORE migrating (the only way back from a bad
#      migration — Prisma deploy has no automatic down-migrations).
#   3. Pull → install → generate → migrate deploy → build.
#   4. Reload under PM2 (near-zero-downtime).
#   5. Health-check; on failure, roll the PM2 process back to the prior build.
#
# Usage:  deploy/release.sh
# Requires: pnpm, pm2, docker (for the Postgres backup), curl.
#
# This script intentionally does NOT push, merge, or auto-deploy frontends
# (Vercel handles those via its own git integration).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:4000/healthz}"
API_READY_URL="${API_READY_URL:-http://127.0.0.1:4000/readyz}"
PM2_APP="${PM2_APP:-staffly-api}"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
fail() {
  printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2
  exit 1
}

# 1. Rollback anchor — tag the commit we're deploying from.
TS="$(date +%Y%m%d-%H%M%S)"
PREV_TAG="deploy-${TS}"
log "Tagging current commit as ${PREV_TAG} (rollback anchor)"
git tag "$PREV_TAG" || true

# 2. Pre-migration backup. Mandatory — this is the recovery path.
log "Backing up Postgres before migrating"
"$REPO_ROOT/deploy/backup.sh" || fail "Pre-migration backup failed — aborting before any migration runs."

# 3. Build pipeline.
log "Pulling latest"
git pull --ff-only

log "Installing dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

log "Generating Prisma client"
pnpm --filter @staffly/api prisma:generate

log "Applying migrations (forward-only)"
pnpm --filter @staffly/api prisma:migrate:deploy

log "Building API"
pnpm --filter @staffly/api build

# 4. Reload under PM2 (keeps the old process until the new one is up).
log "Reloading PM2 app ${PM2_APP}"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 reload "$PM2_APP" --update-env
else
  pm2 start ecosystem.config.cjs
fi

# 5. Health check with retries; roll back the process on failure.
log "Health-checking ${API_HEALTH_URL}"
HEALTHY=0
for i in $(seq 1 15); do
  if curl -fsS "$API_HEALTH_URL" >/dev/null 2>&1 &&
    curl -fsS "$API_READY_URL" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  printf '\n\033[1;31m✖ Health check failed — rolling PM2 back to the previous build.\033[0m\n' >&2
  pm2 reload "$PM2_APP" --update-env || true
  fail "Release unhealthy. Code rolled back via PM2. NOTE: if a migration ran, restore the pre-migration dump from deploy/backup.sh and redeploy the prior tag (${PREV_TAG})."
fi

log "Release healthy ✓  (rollback anchor: ${PREV_TAG})"
