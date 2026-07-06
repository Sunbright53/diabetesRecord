#!/usr/bin/env bash
# Build the web image directly (bypasses Docker Compose v5 bake context bug)
set -euo pipefail

cd "$(dirname "$0")/.."

# Ensure dev override never runs on VPS
rm -f docker-compose.override.yml

# Read NEXT_PUBLIC_* from .env so they get baked into the client bundle at build time
# (Next.js requires these at BUILD time, not runtime — the "environment:" block in compose.yml is not enough)
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

echo "→ Building cheewarun-web:latest ..."
docker build --no-cache \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-/api}" \
  --build-arg "NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL:-/ws}" \
  --build-arg "NEXT_PUBLIC_VAPID_PUBLIC=${NEXT_PUBLIC_VAPID_PUBLIC:-}" \
  -t cheewarun-web:latest apps/web/

echo "→ Restarting web container ..."
docker compose up --no-build -d web

echo "→ Verifying pages ..."
sleep 5
for p in "" login register; do
  code=$(curl -sw "%{http_code}" -o /dev/null "http://localhost:3010/${p}")
  printf "  /%s → %s\n" "$p" "$code"
done
echo "Done."
