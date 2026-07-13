#!/usr/bin/env bash
# Local → VPS deploy (bypasses GitHub push requirement)
# Usage: bash infra/deploy-local.sh
set -euo pipefail

# Always run from repo root regardless of where script is called from
cd "$(dirname "$0")/.."

SERVER="root@metabreath.duckdns.org"
REMOTE="/root/cheewarun"

echo "[1/3] Syncing changed files to server..."
rsync -avz --progress \
  apps/web/src/ \
  apps/web/public/ \
  "${SERVER}:${REMOTE}/apps/web/src/" \
  --exclude "*.map" \
  --exclude ".next"

rsync -avz --progress \
  apps/web/public/ \
  "${SERVER}:${REMOTE}/apps/web/public/"

echo "[2/3] Building web image on server..."
ssh "$SERVER" "cd ${REMOTE} && docker build -t cheewarun-web:latest apps/web/"

echo "[3/3] Restarting web container..."
ssh "$SERVER" "cd ${REMOTE} && docker compose up --no-build -d web"

echo "Done ✓  — https://cheewarun.duckdns.org"
