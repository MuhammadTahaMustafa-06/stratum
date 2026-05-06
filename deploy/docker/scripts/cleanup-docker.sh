#!/usr/bin/env bash
# Free disk on the host by removing unused Docker objects.
# Keeps images/layers still referenced by running containers (e.g. stratum-backend).
# By default does NOT prune volumes (preserves backend_data and other named volumes).
#
# Usage:
#   ./deploy/docker/scripts/cleanup-docker.sh
#   ./deploy/docker/scripts/cleanup-docker.sh --with-unused-volumes  # only if you know unused volumes are safe to delete

set -euo pipefail

WITH_VOLUMES=0
if [[ "${1:-}" == "--with-unused-volumes" ]]; then
  WITH_VOLUMES=1
fi

echo "=== Docker disk before ==="
docker system df || true

echo "=== Pruning stopped containers ==="
docker container prune -f

echo "=== Pruning unused images (all tags/digests not used by any container) ==="
docker image prune -af

echo "=== Pruning build cache ==="
docker builder prune -af 2>/dev/null || true

echo "=== Pruning unused networks ==="
docker network prune -f

if [[ "${WITH_VOLUMES}" -eq 1 ]]; then
  echo "=== Pruning unused volumes (not attached to any container) ==="
  docker volume prune -f
fi

echo "=== Docker disk after ==="
docker system df || true
