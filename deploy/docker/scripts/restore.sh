#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${BACKUP_ARCHIVE:-}" ]]; then
  echo "BACKUP_ARCHIVE is required."
  exit 1
fi

VOLUME_NAME="${VOLUME_NAME:-docker_backend_data}"

if [[ ! -f "${BACKUP_ARCHIVE}" ]]; then
  echo "Backup archive not found: ${BACKUP_ARCHIVE}"
  exit 1
fi

docker run --rm \
  -v "${VOLUME_NAME}:/volume" \
  -v "$(dirname "${BACKUP_ARCHIVE}"):/backup:ro" \
  alpine:3.21 \
  sh -c "rm -rf /volume/* && tar -xzf /backup/$(basename "${BACKUP_ARCHIVE}") -C /volume"

echo "Restore completed from ${BACKUP_ARCHIVE}"
