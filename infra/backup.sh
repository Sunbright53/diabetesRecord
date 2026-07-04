#!/usr/bin/env bash
# Cheewarun — daily Postgres backup
# Cron: 0 3 * * * /root/cheewarun/infra/backup.sh >> /var/log/cheewarun-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="/backups/cheewarun"
DATE=$(date +%Y-%m-%d)
CONTAINER="cheewarun-db-1"

mkdir -p "$BACKUP_DIR"

docker exec "$CONTAINER" pg_dump \
  -U "${POSTGRES_USER:-cheewarun}" \
  "${POSTGRES_DB:-cheewarun_db}" \
  | gzip > "$BACKUP_DIR/$DATE.sql.gz"

find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup OK → $BACKUP_DIR/$DATE.sql.gz ($(du -sh "$BACKUP_DIR/$DATE.sql.gz" | cut -f1))"
