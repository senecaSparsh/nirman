#!/usr/bin/env bash
# bootstrap-server.sh — self-managing new-server provisioning.
#
# Run ONCE on a fresh VPS (Ubuntu 22.04+/Debian 12+, as root or sudo):
#   curl -fsSL https://raw.githubusercontent.com/<you>/nirman-inventory/main/scripts/bootstrap-server.sh | bash
# or from the repo checkout:
#   sudo ./scripts/bootstrap-server.sh
#
# What it does, unattended:
#   1. Installs Docker
#   2. Installs Coolify (manages the app, SSL, backups sidecar)
#   3. Fetches the latest OFF-SITE backup (if RCLONE_* env vars are set)
#      into /data/restore/ so the first deploy restores it automatically
#   4. Prints exactly what to paste into Coolify env (RCLONE_* included
#      so offsite backups are on from day one)
#
# Required env (export before running):
#   DOMAIN=nirman.life                 — the public hostname
# Optional:
#   RCLONE_REMOTE / RCLONE_CONFIG_*    — enables auto-restore from offsite
#   GIT_REPO=https://github.com/...    — the repo Coolify should deploy
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${DOMAIN:-nirman.life}"
GIT_REPO="${GIT_REPO:-https://github.com/sparshagarwal/nirman-inventory}"
RESTORE_DIR=/data/restore
log() { echo "[bootstrap] $1"; }

log "── 1. Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker info >/dev/null && log "   docker ok"

log "── 2. Coolify"
if [ ! -d /data/coolify ]; then
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
fi
log "   coolify at http://$(curl -fsS ifconfig.me 2>/dev/null || echo '<this-ip>'):8000"

log "── 3. Off-site backup fetch (if configured)"
if [ -n "${RCLONE_REMOTE:-}" ]; then
  mkdir -p "$RESTORE_DIR"
  if ! command -v rclone >/dev/null 2>&1; then
    curl -fsSL https://rclone.org/install.sh | bash
  fi
  # RCLONE_CONFIG_* env vars are picked up natively by rclone.
  latest=$(rclone lsf "$RCLONE_REMOTE/pg/" --files-only 2>/dev/null | sort | tail -1 || true)
  if [ -n "$latest" ]; then
    rclone copyto "$RCLONE_REMOTE/pg/$latest" "$RESTORE_DIR/$latest"
    rclone lsf "$RCLONE_REMOTE/uploads/" --files-only 2>/dev/null | sort | tail -1 | \
      xargs -I{} rclone copyto "$RCLONE_REMOTE/uploads/{}" "$RESTORE_DIR/{}" 2>/dev/null || true
    log "   pulled latest off-site dump: $latest"
    log "   → after the app deploys, restore with: gunzip -c $RESTORE_DIR/$latest | docker exec -i <db> psql -U nirman nirman_inventory"
  else
    log "   no remote backups found at $RCLONE_REMOTE/pg/ — fresh install it is"
  fi
else
  log "   RCLONE_REMOTE unset — skipping offsite restore (set it to auto-restore)"
fi

cat <<EOF

═══ Bootstrap complete ═══

1. Open Coolify:  http://$(curl -fsS ifconfig.me 2>/dev/null || echo '<this-ip>'):8000
   → create the admin account → New Resource → Git repository:
       $GIT_REPO   (branch: main, build pack: docker-compose / Dockerfile)

2. Paste these env vars into the service (values from .env.prod-secrets):
     DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET, NEXTAUTH_SECRET,
     NEXT_PUBLIC_APP_URL=https://$DOMAIN, BETTER_AUTH_URL=https://$DOMAIN,
     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER,
     CRON_SECRET, SCHEDULER_SECRET,
     RCLONE_REMOTE + RCLONE_CONFIG_*   ← offsite backups ON from day one

3. Point DNS: $DOMAIN A-record → $(curl -fsS ifconfig.me 2>/dev/null || echo '<this-ip>')
   Coolify issues the cert automatically once DNS resolves.

4. If $RESTORE_DIR holds a dump, restore it:
     gunzip -c $RESTORE_DIR/nirman-*.sql.gz | docker exec -i \$(docker ps -qf name=postgres | head -1) psql -U nirman nirman_inventory

5. Verify: ./scripts/prod-health-check.sh — then run the workflow chain.
EOF
