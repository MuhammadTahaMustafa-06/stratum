#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker/docker-compose.yml}"
PROJECT_ROOT="${PROJECT_ROOT:-/opt/stratum}"
ENV_FILE="${ENV_FILE:-deploy/docker/.env}"

if [[ -z "${APP_TAG:-}" ]]; then
  echo "APP_TAG is required."
  exit 1
fi

if [[ -z "${BACKEND_IMAGE:-}" || -z "${FRONTEND_IMAGE:-}" ]]; then
  echo "BACKEND_IMAGE and FRONTEND_IMAGE are required."
  exit 1
fi

if [[ -z "${BACKEND_TAG:-}" ]]; then
  export BACKEND_TAG="${APP_TAG}"
fi

if [[ -z "${FRONTEND_TAG:-}" ]]; then
  export FRONTEND_TAG="${APP_TAG}"
fi

BACKEND_ENV="${PROJECT_ROOT}/backend/.env"
if [[ ! -f "${BACKEND_ENV}" ]]; then
  echo "ERROR: Missing ${BACKEND_ENV}"
  echo "Create it on the server with production values (see config/env/backend.env.prod)."
  exit 1
fi

cd "${PROJECT_ROOT}"
COMPOSE_ENV_ARGS=()
if [[ -f "${ENV_FILE}" ]]; then
  COMPOSE_ENV_ARGS+=(--env-file "${ENV_FILE}")
fi

docker compose "${COMPOSE_ENV_ARGS[@]}" -f "${COMPOSE_FILE}" pull
docker compose "${COMPOSE_ENV_ARGS[@]}" -f "${COMPOSE_FILE}" up -d --remove-orphans
docker compose "${COMPOSE_ENV_ARGS[@]}" -f "${COMPOSE_FILE}" ps

# Wait for the frontend container to pass its health check before returning.
# This eliminates the race condition where the smoke test hits port 8080 before
# Nginx has finished its entrypoint scripts.
echo "Waiting for stratum-frontend to become healthy (max 120s)..."
HEALTH_TIMEOUT=120
ELAPSED=0
until [[ "$(docker inspect --format='{{.State.Health.Status}}' stratum-frontend 2>/dev/null)" == "healthy" ]]; do
  if (( ELAPSED >= HEALTH_TIMEOUT )); then
    echo "ERROR: stratum-frontend did not become healthy within ${HEALTH_TIMEOUT}s."
    echo "--- Frontend logs ---"
    docker logs stratum-frontend --tail 40
    exit 1
  fi
  echo "  status: $(docker inspect --format='{{.State.Health.Status}}' stratum-frontend 2>/dev/null || echo 'starting') (${ELAPSED}s elapsed)"
  sleep 5
  ELAPSED=$(( ELAPSED + 5 ))
done
echo "stratum-frontend is healthy."
