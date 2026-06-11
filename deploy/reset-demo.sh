#!/usr/bin/env bash
#
# reset-demo.sh — rebuild the Staffly demo dataset to a known-good state.
#
# Idempotent and safe to re-run: applies migrations, seeds the global
# permission catalog, then runs the deterministic demo seed (which deletes and
# recreates ONLY the `staffly-demo` org). Other tenants are untouched.
#
# Usage:
#   deploy/reset-demo.sh
#
# Admin/HR/manager passwords come from apps/api/.env or the environment. This
# script FAILS FAST if any are missing rather than letting the seed generate
# unknown random passwords (RC-01 — that bricked every admin demo login once).
# Set them in apps/api/.env, or export them inline:
#   DEMO_SUPERADMIN_PASSWORD=... DEMO_HR_PASSWORD=... DEMO_MANAGER_PASSWORD=... \
#     deploy/reset-demo.sh
#
# The employee account uses a published demo password unless
# DEMO_EMPLOYEE_PASSWORD is set.
#
# `DEMO_PROFILE=us|india` (default `us`) selects the demo-data flavor
# (org name, timezone, locations, holidays). Either profile produces the
# SAME pinned org id; only descriptive/locale data changes.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
fail() {
  printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2
  exit 1
}

# ─── Fail fast: required admin passwords (RC-01) ────────────────────────────
# The seed loads apps/api/.env itself, so look there too before declaring a
# var missing. An exported value still wins. Without these, the seed would
# refuse to run anyway — this just surfaces the problem before migrations.
ENV_FILE="$REPO_ROOT/apps/api/.env"
env_has() {
  # value present in the process env?
  if [ -n "${!1:-}" ]; then return 0; fi
  # ...or set to a non-empty value in apps/api/.env?
  [ -f "$ENV_FILE" ] && grep -Eq "^[[:space:]]*$1[[:space:]]*=[[:space:]]*[\"']?[^\"'[:space:]]" "$ENV_FILE"
}
missing=()
for var in DEMO_SUPERADMIN_PASSWORD DEMO_HR_PASSWORD DEMO_MANAGER_PASSWORD; do
  env_has "$var" || missing+=("$var")
done
if [ "${#missing[@]}" -gt 0 ]; then
  fail "Refusing to reset demo: missing required admin password(s): ${missing[*]}.
   Set them in apps/api/.env or export them inline before running, e.g.:
     DEMO_SUPERADMIN_PASSWORD=… DEMO_HR_PASSWORD=… DEMO_MANAGER_PASSWORD=… deploy/reset-demo.sh
   (Otherwise the admin demo logins would be seeded with unknown random passwords — RC-01.)"
fi

log "Applying migrations"
pnpm --filter @staffly/api prisma:migrate:deploy

log "Seeding permission catalog"
pnpm --filter @staffly/api db:seed

log "Seeding demo dataset (recreates the staffly-demo org only) — profile=${DEMO_PROFILE:-us}"
pnpm --filter @staffly/api db:seed:demo

log "Demo reset complete ✓"
