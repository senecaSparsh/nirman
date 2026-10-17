#!/usr/bin/env bash
# rescue-prod-data.sh — pull EVERYTHING off the production VPS the moment
# it's reachable again. Copies the live DB (pg_dump), the existing backup
# volume, uploads, and env into a timestamped local dir — the off-VPS copy
# that should always have existed.
#
# Run when the VPS is back:  ./scripts/rescue-prod-data.sh
# Result: ~/nirman-prod-rescue-<ts>/  with the full disaster-recovery set.

set -u
SSH=nirman-vps
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$HOME/nirman-prod-rescue-$STAMP"
mkdir -p "$OUT"

echo "── 0. connectivity"
if ! ssh -o ConnectTimeout=8 -o BatchMode=yes "$SSH" "true" 2>/dev/null; then
  echo "VPS not reachable via 'nirman-vps'. Reboot it via the VirtFusion panel first."
  exit 1
fi
echo "   ✓ ssh up"

echo "── 1. live pg_dump (all DBs, custom format)"
ssh "$SSH" '
  docker exec $(docker ps --format "{{.Names}}" | grep -E "postgres|db" | head -1) \
    pg_dumpall -U "${POSTGRES_USER:-postgres}" --clean --if-exists 2>/dev/null
' | gzip > "$OUT/pg_dumpall-$STAMP.sql.gz"
ls -la "$OUT/pg_dumpall-$STAMP.sql.gz" && \
  [[ $(stat -f%z "$OUT/pg_dumpall-$STAMP.sql.gz") -gt 100000 ]] && \
  echo "   ✓ dump looks real ($(du -h "$OUT/pg_dumpall-$STAMP.sql.gz" | cut -f1))" || \
  echo "   ✗ dump suspiciously small — check the container name manually"

echo "── 2. existing backup volume (nightly dumps + pre-deploy snapshots)"
ssh "$SSH" 'ls -t /var/lib/docker/volumes/*pgbackups*/_data/ 2>/dev/null | head -20' | tee "$OUT/onvps-backups.txt"
ssh "$SSH" 'cd /var/lib/docker/volumes && tar czf - $(ls -d *pgbackups*/_data 2>/dev/null | head -1)' \
  > "$OUT/pgbackups-volume-$STAMP.tar.gz" 2>/dev/null
echo "   → $OUT/pgbackups-volume-$STAMP.tar.gz ($(du -h "$OUT/pgbackups-volume-$STAMP.tar.gz" | cut -f1))"

echo "── 3. uploads volume (documents/photos — not in the DB)"
ssh "$SSH" 'cd /var/lib/docker/volumes && tar czf - $(ls -d *uploads*/_data */storage/uploads 2>/dev/null | head -2)' \
  > "$OUT/uploads-$STAMP.tar.gz" 2>/dev/null
echo "   → $OUT/uploads-$STAMP.tar.gz ($(du -h "$OUT/uploads-$STAMP.tar.gz" | cut -f1))"

echo "── 4. app env + coolify compose (needed to rebuild the deployment)"
ssh "$SSH" 'docker inspect $(docker ps -aq) 2>/dev/null | grep -A200 Env | head -300' \
  > "$OUT/container-envs-$STAMP.txt" 2>/dev/null
ssh "$SSH" 'cd /data/coolify 2>/dev/null && tar czf - applications services 2>/dev/null' \
  > "$OUT/coolify-state-$STAMP.tar.gz" 2>/dev/null

echo "── 5. verify the dump actually contains data"
gunzip -c "$OUT/pg_dumpall-$STAMP.sql.gz" 2>/dev/null | grep -cE "^(CREATE TABLE|COPY )" | \
  xargs -I{} echo "   {} CREATE TABLE/COPY statements in dump"

echo ""
echo "Rescue set complete: $OUT"
echo "Contents: live DB dump + backup volume + uploads + env + coolify state."
echo "From here: restore this dump onto ANY Postgres = your production data migrated."
echo "Then set RCLONE_REMOTE + RCLONE_CONFIG_* on the new server so offsite is on from day one."
