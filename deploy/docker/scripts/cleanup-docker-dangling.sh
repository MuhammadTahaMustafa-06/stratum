#!/usr/bin/env bash
# Remove stopped containers and *dangling* image layers only (untagged leftovers).
# Safe after a failed pull/build: frees partial extract cruft without deleting
# tagged images you may still need for rollback.
set -uo pipefail

echo "=== Pruning dangling Docker data (post-failure safe) ==="
docker container prune -f || true
docker image prune -f || true
docker builder prune -f 2>/dev/null || true
docker system df || true
