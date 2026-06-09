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
# Admin/HR/manager passwords come from the environment; export them before
# running for stable credentials (otherwise strong random ones are generated
# and printed by the seed):
#   DEMO_SUPERADMIN_PASSWORD=... DEMO_HR_PASSWORD=... DEMO_MANAGER_PASSWORD=... \
#     deploy/reset-demo.sh
#
# The employee account uses a published demo password unless
# DEMO_EMPLOYEE_PASSWORD is set.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

log "Applying migrations"
pnpm --filter @staffly/api prisma:migrate:deploy

log "Seeding permission catalog"
pnpm --filter @staffly/api db:seed

log "Seeding demo dataset (recreates the staffly-demo org only)"
pnpm --filter @staffly/api db:seed:demo

log "Demo reset complete ✓"
