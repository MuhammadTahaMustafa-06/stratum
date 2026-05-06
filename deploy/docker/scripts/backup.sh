#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/stratum/backups}"
VOLUME_NAME="${VOLUME_NAME:-docker_backend_data}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "${BACKUP_DIR}"
ARCHIVE_PATH="${BACKUP_DIR}/backend_data_${TIMESTAMP}.tar.gz"

docker run --rm \
  -v "${VOLUME_NAME}:/volume:ro" \
  -v "${BACKUP_DIR}:/backup" \
  alpine:3.21 \
  sh -c "tar -czf /backup/$(basename "${ARCHIVE_PATH}") -C /volume ."

echo "Backup created: ${ARCHIVE_PATH}"
