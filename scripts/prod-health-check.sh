#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Nirman Inventory OS — Production health check + auto-fix
#
# Run this when the site is down or after a deploy to verify everything.
# It checks: SSH, containers, Coolify status, proxy network, health endpoint.
# It auto-fixes: missing sidecar scripts, proxy network disconnect, restart
# limit reached.
#
# Usage: ./scripts/prod-health-check.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_FILE="$REPO_DIR/.env.prod-secrets"

if [ -f "$SECRETS_FILE" ]; then source "$SECRETS_FILE"; fi

: "${VPS_SSH_HOST:=nirman-vps}"
: "${PROD_DOMAIN:=nirman.life}"
: "${COOLIFY_APP_UUID:=oa346mulnes3pgn6gmij6dih}"

APP_ID=1
APP_NET="$COOLIFY_APP_UUID"
# Container names change on each deploy (timestamp suffix). Find them by label.
VPS_APP_DIR="/data/coolify/applications/$COOLIFY_APP_UUID"
VPS_SCRIPTS_DIR="$VPS_APP_DIR/apps/web/scripts"

PASS=0; FAIL=0; FIXED=0
log() { echo "[$(date -u +%H:%M:%S)] $*"; }
ok()   { log "✓ $1"; PASS=$((PASS+1)); }
bad()  { log "✗ $1"; FAIL=$((FAIL+1)); }
fix()  { log "→ FIX: $1"; FIXED=$((FIXED+1)); }

log "=== Nirman Production Health Check ==="
echo ""

# ── 1. SSH access ──
if ssh -o ConnectTimeout=5 "$VPS_SSH_HOST" 'echo ok' &>/dev/null; then
  ok "SSH to VPS"
else
  bad "SSH to VPS (run: ssh-copy-id -i ~/.ssh/devin_nirman root@82.41.67.34)"
  echo ""
  log "Cannot continue without SSH access."
  exit 1
fi

# ── 2. Sidecar scripts exist ──
MISSING_SCRIPTS=()
for script in scheduler.sh backup.sh; do
  if ! ssh "$VPS_SSH_HOST" "test -f $VPS_SCRIPTS_DIR/$script" 2>/dev/null; then
    MISSING_SCRIPTS+=("$script")
  fi
done
if [ ${#MISSING_SCRIPTS[@]} -eq 0 ]; then
  ok "Sidecar scripts present"
else
  bad "Missing scripts: ${MISSING_SCRIPTS[*]}"
  fix "Uploading scripts..."
  for script in "${MISSING_SCRIPTS[@]}"; do
    ssh "$VPS_SSH_HOST" "rm -rf $VPS_SCRIPTS_DIR/$script" 2>/dev/null || true
    scp "$REPO_DIR/apps/web/scripts/$script" "$VPS_SSH_HOST:$VPS_SCRIPTS_DIR/" 2>/dev/null
    ssh "$VPS_SSH_HOST" "chmod +x $VPS_SCRIPTS_DIR/$script" 2>/dev/null
  done
  ok "Scripts uploaded"
fi

# ── 3. Containers running (find by coolify label, names change per deploy) ──
CONTAINER_STATUS=$(ssh "$VPS_SSH_HOST" 'docker ps -a --filter "label=coolify.applicationId=1" --format "{{.Names}} {{.Status}}" 2>&1')
ALL_UP=true
EXPECTED_SERVICES="web db scheduler backup"
for svc in $EXPECTED_SERVICES; do
  STATUS=$(echo "$CONTAINER_STATUS" | grep "${svc}-${COOLIFY_APP_UUID}" | head -1 || true)
  if echo "$STATUS" | grep -q "Up"; then
    ok "$svc: $STATUS"
  else
    bad "$svc: ${STATUS:-not found}"
    ALL_UP=false
  fi
done

# ── 4. Coolify restart limit ──
RESTART_INFO=$(ssh "$VPS_SSH_HOST" "docker exec coolify-db psql -U coolify -d coolify -t -c \"SELECT restart_count, restart_limit_reached, status FROM applications WHERE id = '$APP_ID';\"" 2>/dev/null | tr -d ' ')
RESTART_COUNT=$(echo "$RESTART_INFO" | cut -d'|' -f1)
LIMIT_REACHED=$(echo "$RESTART_INFO" | cut -d'|' -f2)
APP_STATUS=$(echo "$RESTART_INFO" | cut -d'|' -f3)

if [ "$LIMIT_REACHED" = "t" ]; then
  bad "Restart limit reached (count=$RESTART_COUNT, status=$APP_STATUS)"
  fix "Resetting restart counter..."
  ssh "$VPS_SSH_HOST" "docker exec coolify-db psql -U coolify -d coolify -c \"UPDATE applications SET restart_count = 0, restart_limit_reached = false, last_restart_at = NULL, last_restart_type = NULL WHERE id = '$APP_ID';\"" 2>/dev/null
  ok "Restart counter reset"
else
  ok "Coolify status: $APP_STATUS (restarts=$RESTART_COUNT)"
fi

# ── 5. Proxy network connection ──
PROXY_NETS=$(ssh "$VPS_SSH_HOST" "docker inspect coolify-proxy --format '{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} {{end}}'" 2>/dev/null)
if echo "$PROXY_NETS" | grep -q "$APP_NET"; then
  ok "Proxy on app network"
else
  bad "Proxy NOT on app network ($APP_NET)"
  fix "Connecting proxy to $APP_NET..."
  ssh "$VPS_SSH_HOST" "docker network connect $APP_NET coolify-proxy" 2>/dev/null
  ok "Proxy connected to app network"
fi

# ── 6. Start containers if down ──
if [ "$ALL_UP" = false ]; then
  fix "Starting containers..."
  ssh "$VPS_SSH_HOST" "cd $VPS_APP_DIR && docker network create $APP_NET 2>/dev/null; docker compose up -d" 2>&1 | tail -5
  sleep 15
  ok "Containers started"
fi

# ── 7. Health endpoint ──
echo ""
log "Waiting for health endpoint..."
sleep 5
HTTP_CODE=$(curl -skS -m 10 -o /dev/null -w '%{http_code}' "https://$PROD_DOMAIN/api/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  ok "https://$PROD_DOMAIN/api/health → 200"
  curl -skS -m 10 "https://$PROD_DOMAIN/api/health" 2>/dev/null | python3 -m json.tool 2>/dev/null | head -5
else
  bad "https://$PROD_DOMAIN/api/health → $HTTP_CODE"
  log "  Check: ssh $VPS_SSH_HOST 'docker logs $WEB_CONTAINER --tail 30'"
  log "  Check: ssh $VPS_SSH_HOST 'docker logs coolify --since 5m 2>&1 | grep StopApplication'"
fi

# ── Summary ──
echo ""
log "=== Summary: $PASS passed, $FAIL failed, $FIXED fixed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
