#!/usr/bin/env bash
set -euo pipefail

API_HEALTH_URL="${API_HEALTH_URL:-http://localhost:8000/api/v1/ping}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://localhost:8080/}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-60}"
SLEEP_SECONDS=3

deadline=$((SECONDS + TIMEOUT_SECONDS))
echo "Starting smoke tests (Timeout: ${TIMEOUT_SECONDS}s)..."
echo "Checking API: ${API_HEALTH_URL}"

until curl -4fsS "${API_HEALTH_URL}" >/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "ERROR: API smoke test failed after ${TIMEOUT_SECONDS}s: ${API_HEALTH_URL}"
    # Show curl output on failure to help debug
    curl -4iv "${API_HEALTH_URL}" || true
    exit 1
  fi
  echo "API not ready yet, retrying..."
  sleep "${SLEEP_SECONDS}"
done

echo "API smoke test passed. Checking Web: ${WEB_HEALTH_URL}"

until curl -4fsS "${WEB_HEALTH_URL}" >/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "ERROR: Web smoke test failed after ${TIMEOUT_SECONDS}s: ${WEB_HEALTH_URL}"
    curl -4iv "${WEB_HEALTH_URL}" || true
    exit 1
  fi
  echo "Web not ready yet, retrying..."
  sleep "${SLEEP_SECONDS}"
done

echo "Smoke tests passed."
