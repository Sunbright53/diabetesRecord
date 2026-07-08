#!/usr/bin/env python3
"""
MetaBreath — daily Postgres → CSV backup.

Dumps every user table to `<backup_root>/YYYY-MM-DD/<table>.csv.gz`,
writes a manifest with row counts + SHA-256, prunes backups older
than the retention window, and appends one line per run to
`<backup_root>/backup.log`.

Runs on the VPS via cron:  0 20 * * *  /usr/bin/python3 /root/cheewarun/scripts/backup_db.py

Uses `docker compose exec` against the `db` service, so no host-side
psycopg / libpq required — only Docker + Python 3.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

# ── config ────────────────────────────────────────────────────────────────────
COMPOSE_DIR    = Path(os.getenv("COMPOSE_DIR", "/root/cheewarun"))
BACKUP_ROOT    = Path(os.getenv("BACKUP_ROOT", "/root/cheewarun/backups"))
DB_SERVICE     = os.getenv("DB_SERVICE", "db")
DB_USER        = os.getenv("POSTGRES_USER", "cheewarun")
DB_NAME        = os.getenv("POSTGRES_DB", "cheewarun_db")
RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "30"))

# Skip Alembic bookkeeping — its state lives in code, not data.
SKIP_TABLES = {"alembic_version"}


def run_psql(sql: str) -> str:
    """Run a SQL statement inside the db container and return stdout."""
    result = subprocess.run(
        [
            "docker", "compose", "exec", "-T", DB_SERVICE,
            "psql", "-U", DB_USER, "-d", DB_NAME,
            "-A", "-t", "-F", ",", "-c", sql,
        ],
        cwd=COMPOSE_DIR, check=True, capture_output=True, text=True,
    )
    return result.stdout


def list_tables() -> list[str]:
    out = run_psql(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
    )
    return [t for t in (line.strip() for line in out.splitlines()) if t and t not in SKIP_TABLES]


def dump_table(table: str, out_path: Path) -> tuple[int, str]:
    """
    Dump `table` to `out_path` (gzipped CSV) via `\\copy` inside the db container.

    Returns (row_count, sha256).
    """
    proc = subprocess.run(
        [
            "docker", "compose", "exec", "-T", DB_SERVICE,
            "psql", "-U", DB_USER, "-d", DB_NAME,
            "-c", rf"\copy (SELECT * FROM {table}) TO STDOUT WITH CSV HEADER",
        ],
        cwd=COMPOSE_DIR, check=True, capture_output=True,
    )
    csv_bytes = proc.stdout

    with gzip.open(out_path, "wb", compresslevel=6) as gz:
        gz.write(csv_bytes)

    # header + rows − 1 → row count
    text = csv_bytes.decode("utf-8", errors="replace")
    row_count = max(text.count("\n") - 1, 0)
    sha = hashlib.sha256(csv_bytes).hexdigest()
    return row_count, sha


def prune_old_backups() -> list[str]:
    cutoff = datetime.now().date() - timedelta(days=RETENTION_DAYS)
    removed: list[str] = []
    if not BACKUP_ROOT.exists():
        return removed
    for entry in BACKUP_ROOT.iterdir():
        if not entry.is_dir():
            continue
        try:
            day = datetime.strptime(entry.name, "%Y-%m-%d").date()
        except ValueError:
            continue
        if day < cutoff:
            shutil.rmtree(entry, ignore_errors=True)
            removed.append(entry.name)
    return removed


def log(msg: str) -> None:
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    with (BACKUP_ROOT / "backup.log").open("a", encoding="utf-8") as f:
        f.write(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}\n")
    print(msg, flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="YYYY-MM-DD override (default: today)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    stamp = args.date or datetime.now().strftime("%Y-%m-%d")
    out_dir = BACKUP_ROOT / stamp
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        tables = list_tables()
    except subprocess.CalledProcessError as e:
        log(f"ERROR listing tables: {e.stderr.strip() if e.stderr else e}")
        return 1

    manifest: dict = {
        "backup_date": stamp,
        "started_at": datetime.now().isoformat(timespec="seconds"),
        "database": DB_NAME,
        "tables": {},
    }

    total_rows = 0
    total_bytes = 0
    failed: list[str] = []

    for table in tables:
        out_file = out_dir / f"{table}.csv.gz"
        if args.dry_run:
            log(f"[dry-run] would dump {table} → {out_file}")
            continue
        try:
            rows, sha = dump_table(table, out_file)
            size = out_file.stat().st_size
            total_rows += rows
            total_bytes += size
            manifest["tables"][table] = {
                "rows": rows,
                "bytes": size,
                "sha256": sha,
            }
        except subprocess.CalledProcessError as e:
            failed.append(table)
            manifest["tables"][table] = {"error": (e.stderr or b"").decode(errors="replace").strip()[:400]}

    manifest["finished_at"] = datetime.now().isoformat(timespec="seconds")
    manifest["total_rows"] = total_rows
    manifest["total_bytes"] = total_bytes
    manifest["failed"] = failed

    if not args.dry_run:
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))

    removed = prune_old_backups()

    mb = total_bytes / 1024 / 1024
    log(
        f"backup {stamp}: tables={len(tables)} rows={total_rows} size={mb:.2f}MB "
        f"failed={len(failed)} pruned={len(removed)}"
    )
    if failed:
        log(f"  failed tables: {', '.join(failed)}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
