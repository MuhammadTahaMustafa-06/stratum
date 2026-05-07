#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker/docker-compose.yml}"
PROJECT_ROOT="${PROJECT_ROOT:-/opt/stratum}"

if [[ -z "${APP_TAG_PREVIOUS:-}" ]]; then
  echo "APP_TAG_PREVIOUS is required."
  exit 1
fi

if [[ -z "${BACKEND_IMAGE:-}" || -z "${FRONTEND_IMAGE:-}" ]]; then
  echo "BACKEND_IMAGE and FRONTEND_IMAGE are required."
  exit 1
fi

export APP_TAG="${APP_TAG_PREVIOUS}"
export BACKEND_TAG="${APP_TAG_PREVIOUS}"
export FRONTEND_TAG="${APP_TAG_PREVIOUS}"

# Overwrite .env to ensure rollback versions are pinned correctly
{
  printf 'APP_TAG=%s\n' "${APP_TAG}"
  printf 'BACKEND_IMAGE=%s\n' "${BACKEND_IMAGE}"
  printf 'FRONTEND_IMAGE=%s\n' "${FRONTEND_IMAGE}"
  printf 'BACKEND_TAG=%s\n' "${BACKEND_TAG}"
  printf 'FRONTEND_TAG=%s\n' "${FRONTEND_TAG}"
} > deploy/docker/.env

cd "${PROJECT_ROOT}"
# Force pull and recreate to ensure we actually go back to the previous version
docker compose -f "${COMPOSE_FILE}" pull
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans --force-recreate
docker compose -f "${COMPOSE_FILE}" ps
