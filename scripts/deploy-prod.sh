#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Nirman Inventory OS — Production deploy + health check
#
# Usage:
#   ./scripts/deploy-prod.sh           # trigger deploy via Coolify API + verify
#   ./scripts/deploy-prod.sh --watch   # also tail logs until healthy
#   ./scripts/deploy-prod.sh --status  # just show current status (no deploy)
#
# Credentials are read from .env.prod-secrets (gitignored) or env vars.
# See scripts/setup-prod-access.sh to create that file.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_FILE="$REPO_DIR/.env.prod-secrets"

# ── Load credentials ──
if [ -f "$SECRETS_FILE" ]; then
  # shellcheck source=/dev/null
  source "$SECRETS_FILE"
fi

: "${COOLIFY_URL:?Set COOLIFY_URL in $SECRETS_FILE or env (e.g. http://82.41.67.34:8000)}"
: "${COOLIFY_TOKEN:?Set COOLIFY_TOKEN in $SECRETS_FILE or env}"
: "${COOLIFY_APP_UUID:?Set COOLIFY_APP_UUID in $SECRETS_FILE or env}"
: "${VPS_SSH_HOST:?Set VPS_SSH_HOST in $SECRETS_FILE or env (e.g. nirman-vps)}"
: "${PROD_DOMAIN:?Set PROD_DOMAIN in $SECRETS_FILE or env (e.g. nirman.life)}"

MODE="${1:-deploy}"
HEALTH_PATH="/api/health"
HEALTH_TIMEOUT=300  # 5 min max wait for healthy

# ── Helpers ──
log() { echo "[$(date -u +%H:%M:%S)] $*"; }
err() { echo "[$(date -u +%H:%M:%S)] ERROR: $*" >&2; }

# ── Status check (no deploy) ──
if [ "$MODE" = "--status" ]; then
  log "Checking production status..."
  echo ""
  echo "── Coolify application status ──"
  ssh "$VPS_SSH_HOST" 'docker exec coolify-db psql -U coolify -d coolify -t -c "SELECT name, status, restart_count FROM applications WHERE id = '"'"'1'"'"';"' 2>/dev/null || echo "(can't query Coolify DB)"
  echo ""
  echo "── Container status ──"
  ssh "$VPS_SSH_HOST" 'docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "web-oa|db-oa|scheduler-oa|backup-oa"' 2>/dev/null || echo "(can't reach VPS)"
  echo ""
  echo "── Health endpoint ──"
  HTTP_CODE=$(curl -skS -m 10 -o /dev/null -w '%{http_code}' "https://$PROD_DOMAIN$HEALTH_PATH" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    log "✓ Site is LIVE (HTTP $HTTP_CODE)"
    curl -skS -m 10 "https://$PROD_DOMAIN$HEALTH_PATH" 2>/dev/null | python3 -m json.tool 2>/dev/null || true
  else
    err "Site is DOWN (HTTP $HTTP_CODE)"
  fi
  exit 0
fi

# ── Trigger deploy via Coolify API ──
log "Triggering deploy via Coolify API..."
DEPLOY_RESPONSE=$(curl -sS -m 15 \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -X POST "$COOLIFY_URL/api/v1/deploy" \
  -d "{\"uuid\":\"$COOLIFY_APP_UUID\",\"force\":false}" \
  -w '\n%{http_code}' 2>&1)

HTTP_CODE=$(echo "$DEPLOY_RESPONSE" | tail -1)
BODY=$(echo "$DEPLOY_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  err "Deploy trigger failed (HTTP $HTTP_CODE): $BODY"
  exit 1
fi

DEPLOY_UUID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['deployments'][0]['deployment_uuid'])" 2>/dev/null || echo "unknown")
log "✓ Deploy queued (deployment_uuid: $DEPLOY_UUID)"

# ── Wait for health ──
log "Waiting for site to become healthy (max ${HEALTH_TIMEOUT}s)..."
ELAPSED=0
while [ "$ELAPSED" -lt "$HEALTH_TIMEOUT" ]; do
  sleep 10
  ELAPSED=$((ELAPSED + 10))
  HTTP_CODE=$(curl -skS -m 10 -o /dev/null -w '%{http_code}' "https://$PROD_DOMAIN$HEALTH_PATH" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    log "✓ Site is LIVE after ${ELAPSED}s"
    curl -skS -m 10 "https://$PROD_DOMAIN$HEALTH_PATH" 2>/dev/null | python3 -m json.tool 2>/dev/null || true
    exit 0
  fi
  log "  ...still waiting (${ELAPSED}s, HTTP $HTTP_CODE)"
done

err "Site did not become healthy within ${HEALTH_TIMEOUT}s"
log "Check logs: ssh $VPS_SSH_HOST 'docker logs coolify --since 10m 2>&1 | tail -50'"
log "Check containers: ssh $VPS_SSH_HOST 'docker ps -a | grep oa346'"
exit 1
