#!/usr/bin/env bash
# A lightweight, dependency-free concurrent-request baseline against a
# running stack's public read paths (through nginx, the only path that
# should be considered a real deployment target). Answers "does this
# server fall over under N concurrent requests," not a substitute for a
# real load-testing tool - see docs/scaling.md's Load Testing section for
# when to reach for k6/JMeter instead.
#
# Usage: from docker/compose, after `docker compose up -d --build`:
#   ../scripts/load-test.sh                       # defaults: 20 concurrent, 200 total requests
#   ../scripts/load-test.sh -c 50 -n 1000          # 50 concurrent, 1000 total requests
#   ../scripts/load-test.sh -e /api/blogs/trending # target a different endpoint
#
# Requires: curl, a POSIX shell with background jobs (bash). No jq/node
# dependency - only aggregates HTTP status codes and timings.

set -euo pipefail

BASE_URL="${SMOKE_TEST_BASE_URL:-http://localhost:8080}"
CONCURRENCY=20
TOTAL_REQUESTS=200
ENDPOINT="/api/blogs/search?sortBy=recent&limit=9"

while [[ $# -gt 0 ]]; do
  case $1 in
    -c|--concurrency)
      CONCURRENCY="$2"
      shift 2
      ;;
    -n|--requests)
      TOTAL_REQUESTS="$2"
      shift 2
      ;;
    -e|--endpoint)
      ENDPOINT="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [-c concurrency] [-n total-requests] [-e endpoint-path]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

RESULTS_DIR="$(mktemp -d)"
trap 'rm -rf "$RESULTS_DIR"' EXIT

echo "Load testing $BASE_URL$ENDPOINT"
echo "Concurrency: $CONCURRENCY, total requests: $TOTAL_REQUESTS"
echo

run_one() {
  local id=$1
  local out
  out=$(curl -s -o /dev/null -w '%{http_code} %{time_total}' "$BASE_URL$ENDPOINT")
  echo "$out" >"$RESULTS_DIR/$id"
}

START_EPOCH=$(date +%s)

running=0
for i in $(seq 1 "$TOTAL_REQUESTS"); do
  run_one "$i" &
  running=$((running + 1))
  if [ "$running" -ge "$CONCURRENCY" ]; then
    wait -n
    running=$((running - 1))
  fi
done
wait

END_EPOCH=$(date +%s)
DURATION=$((END_EPOCH - START_EPOCH))
[ "$DURATION" -lt 1 ] && DURATION=1

TOTAL=0
SUCCESS=0
FAILURES=0
TIME_SUM="0"
TIME_MAX="0"

for f in "$RESULTS_DIR"/*; do
  TOTAL=$((TOTAL + 1))
  read -r code time_taken <"$f"
  if [ "$code" = "200" ]; then
    SUCCESS=$((SUCCESS + 1))
  else
    FAILURES=$((FAILURES + 1))
  fi
  TIME_SUM=$(awk -v a="$TIME_SUM" -v b="$time_taken" 'BEGIN { printf "%.3f", a + b }')
  TIME_MAX=$(awk -v a="$TIME_MAX" -v b="$time_taken" 'BEGIN { print (a > b) ? a : b }')
done

AVG_TIME=$(awk -v sum="$TIME_SUM" -v n="$TOTAL" 'BEGIN { printf "%.3f", sum / n }')
RPS=$(awk -v n="$TOTAL" -v d="$DURATION" 'BEGIN { printf "%.1f", n / d }')

echo "Results:"
echo "  Total requests:   $TOTAL"
echo "  Successful (200): $SUCCESS"
echo "  Failed:           $FAILURES"
echo "  Wall time:        ${DURATION}s"
echo "  Requests/sec:     $RPS"
echo "  Avg response:     ${AVG_TIME}s"
echo "  Max response:     ${TIME_MAX}s"

if [ "$FAILURES" -gt 0 ]; then
  echo
  echo "Non-200 responses occurred - check rate limiting (nginx/express-rate-limit" >&2
  echo "config) before assuming a real capacity problem; the defaults in this repo" >&2
  echo "are tuned for normal traffic, not load-test bursts." >&2
  exit 1
fi
