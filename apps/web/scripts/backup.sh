#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Backup sidecar — self-contained data protection, zero external deps.
#
# Daily, forever:
#   1. pg_dump the database        → /backups/pg/nirman-<ts>.sql.gz
#   2. tar the uploads volume      → /backups/uploads/uploads-<ts>.tgz
#   3. Prune backups older than RETENTION_DAYS (default 14)
#   4. If RCLONE_REMOTE is set, sync /backups off-VPS (Backblaze B2, S3,
#      or any rclone backend) — off-site protection with no code changes.
#
# This complements (not replaces) /api/cron/backup — that one writes
# BackupRecord rows inside Postgres for in-app restore; this one produces
# real pg_dump files that survive DB corruption and can rebuild the volume.
#
# Optional off-VPS upload (set in Coolify env, off by default):
#   RCLONE_REMOTE="b2:nirman-backups"            (any rclone remote:path)
#   RCLONE_CONFIG_B2_TYPE="b2"
#   RCLONE_CONFIG_B2_ACCOUNT="<keyID>"
#   RCLONE_CONFIG_B2_KEY="<applicationKey>"
# With no RCLONE_REMOTE, backups stay on the pgbackups volume (still protects
# against corruption/bad migrations — just not total disk loss).
#
# Restore (on the VPS):
#   docker cp <backup-container>:/backups/pg/<file>.sql.gz .
#   gunzip -c file.sql.gz | docker exec -i <db-container> psql -U nirman nirman_inventory
# ─────────────────────────────────────────────────────────────────────────────
set -u

PGHOST="${PGHOST:-db}"
PGUSER="${POSTGRES_USER:-nirman}"
PGDATABASE="${POSTGRES_DB:-nirman_inventory}"
export PGPASSWORD="${POSTGRES_PASSWORD:-changeme_please}"

BACKUP_DIR="/backups"
UPLOADS_SRC="/uploads-src"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"

echo "=== Nirman backup sidecar starting ==="
echo "Target DB: $PGUSER@$PGHOST/$PGDATABASE  | retention: ${RETENTION_DAYS}d | interval: ${INTERVAL}s"
[ -n "${RCLONE_REMOTE:-}" ] && echo "Off-site upload: $RCLONE_REMOTE" || echo "Off-site upload: disabled (set RCLONE_REMOTE to enable)"

mkdir -p "$BACKUP_DIR/pg" "$BACKUP_DIR/uploads"

run_backup() {
  ts="$(date -u +%Y%m%d-%H%M%S)"

  # ── Database dump ──
  pg_out="$BACKUP_DIR/pg/nirman-$ts.sql.gz"
  if pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" --no-owner --no-privileges 2>/tmp/pgdump.err | gzip > "$pg_out"; then
    size=$(du -h "$pg_out" | cut -f1)
    echo "[backup] OK   pg → $pg_out ($size)"
  else
    echo "[backup] FAIL pg_dump: $(cat /tmp/pgdump.err)"
    rm -f "$pg_out"
  fi

  # ── Uploads archive ──
  up_out="$BACKUP_DIR/uploads/uploads-$ts.tgz"
  if tar -czf "$up_out" -C "$UPLOADS_SRC" . 2>/tmp/tar.err; then
    size=$(du -h "$up_out" | cut -f1)
    echo "[backup] OK   uploads → $up_out ($size)"
  else
    echo "[backup] FAIL tar: $(cat /tmp/tar.err)"
    rm -f "$up_out"
  fi

  # ── Prune old backups ──
  find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

  # ── Optional off-site upload ──
  if [ -n "${RCLONE_REMOTE:-}" ]; then
    if command -v rclone >/dev/null 2>&1; then
      rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --create-empty-src-dirs \
        && echo "[backup] OK   off-site sync → $RCLONE_REMOTE" \
        || echo "[backup] FAIL rclone sync (check RCLONE_* env vars)"
    else
      echo "[backup] FAIL rclone not installed but RCLONE_REMOTE is set"
    fi
  fi
}

# rclone isn't in the postgres base image — install once at start (best-effort;
# only needed when RCLONE_REMOTE is configured).
apk add --no-cache rclone >/dev/null 2>&1 || true

run_backup   # one backup immediately at boot — a fresh deploy is a good checkpoint
while :; do
  sleep "$INTERVAL"
  run_backup
done
