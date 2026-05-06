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
  echo "Create it on the server with production values (see config/env/backend.env.production)."
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
