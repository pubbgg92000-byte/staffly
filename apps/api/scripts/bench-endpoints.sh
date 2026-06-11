#!/usr/bin/env bash
# Phase 12 (performance) — endpoint latency benchmark against staffly-bench-* scratch orgs.
#
# Usage: bash apps/api/scripts/bench-endpoints.sh <scale> <admin-email> <password> [runs]
#   e.g. bash apps/api/scripts/bench-endpoints.sh 50 admin@bench50.test 'Bench!Passw0rd' 30
#
# Output: TSV lines on stdout:  scale  endpoint  n  min_ms  p50_ms  p95_ms  max_ms  mean_ms
# Per-request samples are written to /tmp/bench-samples-<scale>.tsv (endpoint \t ms).
set -euo pipefail

SCALE="$1"; EMAIL="$2"; PASS="$3"; RUNS="${4:-30}"
API="http://localhost:4000"
JAR="/tmp/bench-${SCALE}.jar"
SAMPLES="/tmp/bench-samples-${SCALE}.tsv"
: > "$SAMPLES"

# Fresh signin (access token TTL is 15 min; each scale run re-authenticates).
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" -c "$JAR")
[ "$code" = "200" ] || { echo "signin failed for $EMAIL: $code" >&2; exit 1; }

ENDPOINTS=(
  "dashboard_admin|/dashboard/admin"
  "employees_list|/employees?page=1&pageSize=20"
  "attendance_list|/attendance?page=1&pageSize=20"
  "leave_requests_list|/leave/requests?page=1&pageSize=20"
  "documents_list|/documents?page=1&pageSize=20"
)

for entry in "${ENDPOINTS[@]}"; do
  name="${entry%%|*}"; path="${entry#*|}"

  # Warm-up: 3 untimed requests (connection reuse, caches, JIT).
  for _ in 1 2 3; do
    wcode=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$API$path")
    [ "$wcode" = "200" ] || { echo "WARMUP FAIL $name: HTTP $wcode" >&2; exit 1; }
  done

  # Timed runs.
  times=()
  for _ in $(seq "$RUNS"); do
    t=$(curl -s -o /dev/null -w "%{time_total}" -b "$JAR" "$API$path")
    ms=$(awk -v t="$t" 'BEGIN { printf "%.2f", t * 1000 }')
    times+=("$ms")
    printf "%s\t%s\n" "$name" "$ms" >> "$SAMPLES"
  done

  printf "%s\n" "${times[@]}" | sort -n | awk \
    -v scale="$SCALE" -v name="$name" -v n="$RUNS" '
    { a[NR] = $1; sum += $1 }
    END {
      p50 = a[int((NR - 1) * 0.50) + 1];
      p95 = a[int((NR - 1) * 0.95) + 1];
      printf "%s\t%s\t%d\t%.2f\t%.2f\t%.2f\t%.2f\t%.2f\n",
        scale, name, n, a[1], p50, p95, a[NR], sum / NR;
    }'
done
