#!/usr/bin/env bash
set -euo pipefail

API_HEALTH_URL="${API_HEALTH_URL:-http://localhost:8000/api/v1/ping}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://localhost/}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-60}"
SLEEP_SECONDS=3

deadline=$((SECONDS + TIMEOUT_SECONDS))
until curl -fsS "${API_HEALTH_URL}" >/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "API smoke test failed: ${API_HEALTH_URL}"
    exit 1
  fi
  sleep "${SLEEP_SECONDS}"
done

curl -fsS "${WEB_HEALTH_URL}" >/dev/null
echo "Smoke tests passed."
