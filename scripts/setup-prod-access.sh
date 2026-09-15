#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# One-time setup: save production credentials to .env.prod-secrets (gitignored)
#
# This file stores all credentials needed for deploy + SSH access so Devin
# (or you) can always reach the VPS and trigger deploys without re-discovering
# them every session.
#
# Run once: ./scripts/setup-prod-access.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_FILE="$REPO_DIR/.env.prod-secrets"

# ── Ensure .gitignore protects the secrets file ──
if ! grep -q '.env.prod-secrets' "$REPO_DIR/.gitignore" 2>/dev/null; then
  echo '.env.prod-secrets' >> "$REPO_DIR/.gitignore"
  echo "Added .env.prod-secrets to .gitignore"
fi

echo "Creating $SECRETS_FILE ..."
echo ""

# ── Write credentials ──
cat > "$SECRETS_FILE" << 'EOF'
# Nirman Inventory OS — Production credentials
# DO NOT COMMIT THIS FILE (it's in .gitignore)
# These are the only credentials needed for deploy + SSH access.

# ── VPS (HeavenCloud Mumbai) ──
VPS_IP=82.41.67.34
VPS_SSH_HOST=nirman-vps
# SSH key: ~/.ssh/devin_nirman (ed25519, authorized on VPS root)
# SSH alias configured in ~/.ssh/config — just: ssh nirman-vps

# ── Coolify dashboard ──
COOLIFY_URL=http://82.41.67.34:8000
COOLIFY_APP_UUID=oa346mulnes3pgn6gmij6dih
COOLIFY_APP_ID=1
COOLIFY_TOKEN='2|4RMnpG7pPoZmrRMmlJalTOn2VVtadJQogTJ4Vs5Cdec61d15'
# Token permissions: Deploy (30-day expiry — renew before Oct 15, 2026)
# Create new token: Coolify → Keys & Tokens → API Tokens → New token
#   Permissions needed: Deploy (for triggering deploys)
#   Read is optional (for querying status — we use SSH for that instead)

# ── Domain ──
PROD_DOMAIN=nirman.life

# ── VirtFusion panel (HeavenCloud) ──
VIRTFUSION_PANEL=https://compute.heavencloud.online
VIRTFUSION_SERVER_UUID=2bd51fbb-4772-403b-af19-c6b1bbf0154e
# VNC: IP 82.41.67.106, Port 5917, Password hyT9cSev
# (VNC must be enabled from the panel → Options → VNC)

# ── Application paths on VPS ──
VPS_APP_DIR=/data/coolify/applications/oa346mulnes3pgn6gmij6dih
VPS_COMPOSE_FILE=$VPS_APP_DIR/docker-compose.yaml
VPS_SCRIPTS_DIR=$VPS_APP_DIR/apps/web/scripts
EOF

chmod 600 "$SECRETS_FILE"
echo "✓ Created $SECRETS_FILE (chmod 600)"
echo ""
echo "Test it:"
echo "  source $SECRETS_FILE"
echo "  ssh \$VPS_SSH_HOST 'echo SSH_OK'"
echo "  curl -sS -H \"Authorization: Bearer \$COOLIFY_TOKEN\" -X POST \$COOLIFY_URL/api/v1/deploy -H 'Content-Type: application/json' -d '{\"uuid\":\"'\$COOLIFY_APP_UUID'\"}'"
