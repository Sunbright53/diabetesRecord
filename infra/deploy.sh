#!/usr/bin/env bash
# Cheewarun — zero-downtime deploy
set -euo pipefail

cd /root/cheewarun

echo "[deploy] Pulling latest code..."
git pull
# Never run dev overrides in production
rm -f docker-compose.override.yml docker-compose.dev.yml

echo "[deploy] Pulling new images..."
docker compose pull --ignore-pull-failures

echo "[deploy] Building web image (direct docker build — bypasses Compose v5 bake bug)..."
docker build -t cheewarun-web:latest apps/web/

echo "[deploy] Rebuilding and restarting services..."
docker compose up --no-build -d --remove-orphans

echo "[deploy] Running DB migrations..."
docker compose exec -T api alembic upgrade head

echo "[deploy] Cleanup old images..."
docker image prune -f

echo "[deploy] Done ✓"
docker compose ps
