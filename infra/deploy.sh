#!/usr/bin/env bash
# Cheewarun — zero-downtime deploy
set -euo pipefail

cd /root/cheewarun

echo "[deploy] Pulling latest code..."
git pull

echo "[deploy] Pulling new images..."
docker compose pull --ignore-pull-failures

echo "[deploy] Rebuilding and restarting services..."
docker compose up -d --build --remove-orphans

echo "[deploy] Running DB migrations..."
docker compose exec -T api alembic upgrade head

echo "[deploy] Cleanup old images..."
docker image prune -f

echo "[deploy] Done ✓"
docker compose ps
