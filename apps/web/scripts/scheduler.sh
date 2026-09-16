#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Internal scheduler — calls the app's cron endpoints on a fixed cadence.
#
# Why this exists: on Docker/VPS/Coolify there is no platform cron (unlike
# Render's cronJobs or Vercel Cron). Without a caller, reminders, backups,
# HSN re-seeds, and scheduled workflows silently never run.
#
# This sidecar container does nothing but sleep and curl. It talks to the
# `web` service over the internal compose network (no public traffic).
#
# Cadence (matches render.yaml's former schedule):
#   POST /api/cron/reminders       every 15 min   (payment/rent/doc reminders,
#                                                notification flush, recurring
#                                                expenses)
#   POST /api/workflow-scheduler   every 5 min    (due scheduled workflows)
#   POST /api/cron/backup          daily          (BackupRecord export)
#   POST /api/cron/approval-aging  daily          (escalation digest for
#                                                approvals waiting >48h)
#   POST /api/cron/hsn-seed        weekly         (HSN/GST master re-seed)
#
# Secrets: CRON_SECRET guards /api/cron/*, SCHEDULER_SECRET guards
# /api/workflow-scheduler. Both come from the compose env — set them in
# Coolify's environment settings. If a secret is missing the endpoint
# returns 401 and we log it (visible in Coolify logs) instead of failing
# silently.
# ─────────────────────────────────────────────────────────────────────────────
set -u

APP_URL="${APP_URL:-http://web:3000}"
CRON_SECRET="${CRON_SECRET:-}"
SCHEDULER_SECRET="${SCHEDULER_SECRET:-}"

echo "=== Nirman scheduler starting ==="
echo "Target: $APP_URL"
[ -n "$CRON_SECRET" ] || echo "⚠️  CRON_SECRET is not set — /api/cron/* calls will 401"
[ -n "$SCHEDULER_SECRET" ] || echo "⚠️  SCHEDULER_SECRET is not set — /api/workflow-scheduler calls will 401"

# curl is not in the alpine base image — install once at start.
apk add --no-cache curl >/dev/null 2>&1 || true

# loop <seconds> <path> <auth-header>
loop() {
  interval="$1"; path="$2"; auth_header="$3"
  while :; do
    sleep "$interval"
    if curl -fsS -m 300 -X POST -H "$auth_header" "$APP_URL$path"; then
      echo "[scheduler] OK   $path"
    else
      echo "[scheduler] FAIL $path (check secrets + web service logs)"
    fi
  done
}

# Wait for the web service to be fully up before the first calls.
sleep 30

# Kick reminders + workflow-scheduler once at boot so a fresh deploy
# processes anything pending immediately instead of waiting a cycle.
curl -fsS -m 300 -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/reminders" >/dev/null 2>&1 \
  && echo "[scheduler] boot kick: reminders OK" || true
curl -fsS -m 300 -X POST -H "Authorization: Bearer $SCHEDULER_SECRET" "$APP_URL/api/workflow-scheduler" >/dev/null 2>&1 \
  && echo "[scheduler] boot kick: workflow-scheduler OK" || true
# Backup too — otherwise a fresh deploy goes up to 24h before the first
# BackupRecord export runs. It's idempotent; the catch swallows failures.
curl -fsS -m 300 -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/backup" >/dev/null 2>&1 \
  && echo "[scheduler] boot kick: backup OK" || true

loop 900    /api/cron/reminders      "x-cron-secret: $CRON_SECRET" &
loop 300    /api/workflow-scheduler  "Authorization: Bearer $SCHEDULER_SECRET" &
loop 86400  /api/cron/backup         "x-cron-secret: $CRON_SECRET" &
loop 86400  /api/cron/approval-aging "x-cron-secret: $CRON_SECRET" &
loop 604800 /api/cron/hsn-seed       "x-cron-secret: $CRON_SECRET" &

wait
