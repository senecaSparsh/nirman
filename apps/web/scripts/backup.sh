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
# Pre-deploy snapshots: the web entrypoint (running as uid 1001) pg_dumps here
# before applying migrations. World-writable + sticky so nirman can write and
# prune its own files inside this root-owned volume. Synced off-site too.
mkdir -p "$BACKUP_DIR/pre-deploy" && chmod 1777 "$BACKUP_DIR/pre-deploy"

# alert <message> — fires ALERT_WEBHOOK (Slack/Discord/ntfy/generic POST) if set.
# Self-managing means failures must *page someone*, not just log.
alert() {
  echo "[backup] ALERT: $1"
  [ -n "${ALERT_WEBHOOK:-}" ] && \
    curl -fsS -m 10 -X POST "$ALERT_WEBHOOK" \
      -H "content-type: application/json" \
      -d "{\"text\":\"[nirman-backup] $1\"}" >/dev/null 2>&1 || true
}

# verify_dump <file> — a backup you can't restore is a rumor. Minimum check
# every run: gzip integrity + real SQL content inside.
verify_dump() {
  gunzip -t "$1" 2>/dev/null || return 1
  n=$(gunzip -c "$1" | grep -cE '^(CREATE TABLE|COPY )')
  [ "$n" -gt 50 ]
}

# weekly_restore_verify — once a week, actually RESTORE the latest dump into
# a scratch DB inside the same Postgres, count rows, drop it. The difference
# between "we have backups" and "we have restores".
weekly_restore_verify() {
  [ "$(date +%u)" != "${VERIFY_DOW:-1}" ] && return 0   # default: Mondays
  latest=$(ls -t "$BACKUP_DIR"/pg/nirman-*.sql.gz 2>/dev/null | head -1)
  [ -z "$latest" ] && return 0
  echo "[backup] weekly restore-verify on $(basename "$latest")"
  psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS _verify" -q 2>/dev/null
  psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "CREATE DATABASE _verify" -q 2>/dev/null
  if gunzip -c "$latest" | psql -h "$PGHOST" -U "$PGUSER" -d _verify -q 2>/tmp/verify.err; then
    n=$(psql -h "$PGHOST" -U "$PGUSER" -d _verify -tAc 'SELECT count(*) FROM "User"' 2>/dev/null || echo 0)
    echo "[backup] OK   restore-verify — _verify DB has $n users"
    [ "${n:-0}" -gt 0 ] || alert "restore-verify produced 0 users — dump may be empty"
  else
    alert "restore-verify FAILED on $(basename "$latest"): $(tail -1 /tmp/verify.err)"
  fi
  psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS _verify" -q 2>/dev/null
}

run_backup() {
  ts="$(date -u +%Y%m%d-%H%M%S)"
  status="ok"; notes=""

  # ── Database dump ──
  pg_out="$BACKUP_DIR/pg/nirman-$ts.sql.gz"
  if pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" --no-owner --no-privileges 2>/tmp/pgdump.err | gzip > "$pg_out"; then
    size=$(du -h "$pg_out" | cut -f1)
    echo "[backup] OK   pg → $pg_out ($size)"
    if verify_dump "$pg_out"; then
      echo "[backup] OK   integrity — gzip valid, schema+data present"
    else
      status="fail"; notes="$notes dump-corrupt;"
      alert "pg dump failed integrity check: $pg_out"
    fi
  else
    echo "[backup] FAIL pg_dump: $(cat /tmp/pgdump.err)"
    status="fail"; notes="$notes pg_dump-failed;"
    alert "pg_dump failed: $(head -1 /tmp/pgdump.err)"
    rm -f "$pg_out"
  fi

  # ── Uploads archive ──
  up_out="$BACKUP_DIR/uploads/uploads-$ts.tgz"
  if tar -czf "$up_out" -C "$UPLOADS_SRC" . 2>/tmp/tar.err; then
    size=$(du -h "$up_out" | cut -f1)
    echo "[backup] OK   uploads → $up_out ($size)"
  else
    echo "[backup] FAIL tar: $(cat /tmp/tar.err)"
    status="fail"; notes="$notes uploads-failed;"
    rm -f "$up_out"
  fi

  # ── Prune old backups ──
  find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

  # ── Optional off-site upload ──
  if [ -n "${RCLONE_REMOTE:-}" ]; then
    if command -v rclone >/dev/null 2>&1; then
      if rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --create-empty-src-dirs 2>/tmp/rclone.err; then
        echo "[backup] OK   off-site sync → $RCLONE_REMOTE"
        # Verify it actually landed — a silent failed sync is worse than none.
        if rclone lsf "$RCLONE_REMOTE/pg/" 2>/dev/null | grep -q "$(basename "$pg_out")"; then
          echo "[backup] OK   off-site verified — $(basename "$pg_out") present remote"
        else
          status="fail"; notes="$notes offsite-verify-failed;"
          alert "off-site sync reported OK but file not found remote — check rclone remote"
        fi
      else
        status="fail"; notes="$notes offsite-failed;"
        alert "rclone sync failed: $(tail -1 /tmp/rclone.err)"
      fi
    else
      status="fail"; notes="$notes rclone-missing;"
      alert "rclone not installed but RCLONE_REMOTE is set"
    fi
  fi

  # ── Weekly self-restore-verify (restores latest dump into scratch DB) ──
  weekly_restore_verify

  # ── Status file — prod-health-check + /api/health read this ──
  cat > "$BACKUP_DIR/latest.json" <<EOF
{"lastRun":"$ts","status":"$status","notes":"$notes","pg":"$(basename "${pg_out:-none}" 2>/dev/null)","offsite":"${RCLONE_REMOTE:-off}"}
EOF
}

# rclone isn't in the postgres base image — install once at start (best-effort;
# only needed when RCLONE_REMOTE is configured).
apk add --no-cache rclone >/dev/null 2>&1 || true

run_backup   # one backup immediately at boot — a fresh deploy is a good checkpoint
while :; do
  sleep "$INTERVAL"
  run_backup
done
