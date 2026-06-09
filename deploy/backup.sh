#!/usr/bin/env bash
#
# backup.sh — dump the Staffly demo Postgres and upload to Cloudflare R2.
#
# Run on a schedule (launchd / cron) AND automatically before every migration
# (see release.sh). Retention: keeps the last N local dumps; R2 lifecycle
# rules handle long-term retention.
#
# Usage:  deploy/backup.sh
# Requires: docker (or a local pg_dump), aws CLI configured for R2, gzip.
#
# Env (override as needed):
#   PG_CONTAINER         docker container name (default staffly-postgres-demo)
#   POSTGRES_USER/DB     credentials (default staffly/staffly)
#   BACKUP_DIR           local dump dir (default ./.backups)
#   LOCAL_RETENTION      how many local dumps to keep (default 7)
#   R2_BUCKET            target bucket (default staffly-demo)
#   R2_PREFIX            key prefix (default backups/postgres)
#   R2_ENDPOINT          R2 S3 endpoint (https://<acct>.r2.cloudflarestorage.com)
#   MIN_FREE_GB          abort if free disk below this (default 5)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_CONTAINER="${PG_CONTAINER:-staffly-postgres-demo}"
POSTGRES_USER="${POSTGRES_USER:-staffly}"
POSTGRES_DB="${POSTGRES_DB:-staffly}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/.backups}"
LOCAL_RETENTION="${LOCAL_RETENTION:-7}"
R2_BUCKET="${R2_BUCKET:-staffly-demo}"
R2_PREFIX="${R2_PREFIX:-backups/postgres}"
R2_ENDPOINT="${R2_ENDPOINT:-}"
MIN_FREE_GB="${MIN_FREE_GB:-5}"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
fail() {
  printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2
  exit 1
}

# Disk guard — the Mini has hit StorageFull; never start a dump that could
# fill the disk and corrupt the DB volume.
FREE_GB="$(df -g "$REPO_ROOT" | awk 'NR==2 {print $4}')"
if [ "${FREE_GB:-0}" -lt "$MIN_FREE_GB" ]; then
  fail "Only ${FREE_GB}GB free (< ${MIN_FREE_GB}GB). Free disk before backing up."
fi

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
DUMP="$BACKUP_DIR/staffly-${TS}.sql.gz"

log "Dumping ${POSTGRES_DB} → ${DUMP}"
if docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
  docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" |
    gzip -9 >"$DUMP"
else
  # Fallback: local pg_dump against the loopback-mapped port.
  pg_dump "postgresql://${POSTGRES_USER}@127.0.0.1:5433/${POSTGRES_DB}" |
    gzip -9 >"$DUMP"
fi

[ -s "$DUMP" ] || fail "Dump is empty — backup failed."
log "Dump written ($(du -h "$DUMP" | cut -f1))"

# Upload to R2 (skipped with a warning if the endpoint isn't configured yet).
if [ -n "$R2_ENDPOINT" ] && command -v aws >/dev/null 2>&1; then
  log "Uploading to r2://${R2_BUCKET}/${R2_PREFIX}/"
  aws s3 cp "$DUMP" "s3://${R2_BUCKET}/${R2_PREFIX}/$(basename "$DUMP")" \
    --endpoint-url "$R2_ENDPOINT"
else
  printf '\033[1;33m⚠ R2_ENDPOINT/aws not configured — kept local dump only.\033[0m\n'
fi

# Local retention.
log "Pruning local dumps (keep ${LOCAL_RETENTION})"
ls -1t "$BACKUP_DIR"/staffly-*.sql.gz 2>/dev/null |
  tail -n +"$((LOCAL_RETENTION + 1))" |
  xargs -r rm -f

log "Backup complete ✓"
