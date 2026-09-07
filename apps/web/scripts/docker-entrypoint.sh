#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Docker Entrypoint — Nirman Inventory OS
#
# Runs on every container start (including Coolify deploys / restarts):
#   1. Prisma migrate deploy  — applies pending DB migrations (safe, ordered)
#   2. [Optional] Demo seed   — only if SEED_DEMO_DATA=true (FIRST TIME ONLY!)
#      Creates demo company, users, projects, stock, etc. WIPES transactional
#      data on every run — do NOT leave this enabled in production.
#   3. Production seed         — idempotent: chart of accounts + demo passwords
#   4. SRG REALCON provisioning — idempotent: creates SRG REALCON company +
#      7 team accounts on first run, silently skips on subsequent runs
#   5. Start the app           — hands off to start-with-recovery.mjs which
#                                wraps `next start` with auto-restart, health
#                                checks, graceful shutdown, and memory monitoring.
#
# Why migrations run here (not at build time):
#   The Docker build stage doesn't have DATABASE_URL (secrets are runtime-only
#   in Coolify). Render ran migrations in buildCommand because Render injects
#   DB env vars during build. In Docker, we run them at container startup
#   instead — this is the standard pattern and works with Coolify's secret
#   management.
#
# Idempotency:
#   - `prisma migrate deploy` only applies pending migrations; no-ops if up to date.
#   - `seed:prod` upserts the chart of accounts and demo user passwords.
#   Both are safe to run on every deploy/restart.
#   - The demo seed (`seed.ts`) is NOT idempotent for transactional data — it
#     wipes and recreates it. Only run it once, on first deploy.
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo ""
echo "=== Nirman Inventory OS — Container Startup ==="
echo "Time: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# ── 1. Database migrations ──────────────────────────────────────────────────
echo "── Running Prisma migrations ──"
cd /app/packages/db
node scripts/migrate-deploy.mjs
echo "✓ Migrations complete"
echo ""

# ── 2. Demo seed (FIRST TIME ONLY — controlled by SEED_DEMO_DATA env var) ───
# The demo seed creates a realistic construction company with users, projects,
# stock, suppliers, etc. It WIPES transactional data on every run, so only
# enable this for the initial deploy, then turn it off.
if [ "$SEED_DEMO_DATA" = "true" ]; then
  echo "── Running demo seed (SEED_DEMO_DATA=true) ──"
  echo "   WARNING: This wipes all transactional data and recreates demo data."
  echo "   Disable SEED_DEMO_DATA after this deploy to preserve user data."
  cd /app/packages/services
  node --import tsx prisma/seed.ts
  echo "✓ Demo seed complete"
  echo ""
fi

# ── 3. Production seed (idempotent — safe on every deploy) ──────────────────
echo "── Running production seed ──"
cd /app/apps/web
node --import tsx scripts/seed-prod.ts
echo "✓ Seed complete"
echo ""

# ── 4. SRG REALCON user provisioning (idempotent — runs once, then no-ops) ──
# Creates the SRG REALCON parent company + 7 team member accounts with
# RBAC roles, H1–H4 hierarchy, phone-based login, and call-system phone
# numbers. On the first run it prints generated passwords to the deploy
# logs (copy them!). On subsequent runs it detects the company + users
# already exist and exits silently. Safe to run on every deploy.
echo "── SRG REALCON user provisioning ──"
cd /app/apps/web
node scripts/create-srg-users.mjs || echo "  (SRG provisioning skipped or already done)"
echo "✓ SRG provisioning check complete"
echo ""

# ── 5. Start the production server with auto-recovery ───────────────────────
echo "── Starting Next.js production server ──"
echo "   Wrapper: scripts/start-with-recovery.mjs"
echo "   Features: graceful shutdown, crash auto-restart, health checks,"
echo "             DB warmup, memory monitoring (auto-scaled to available RAM)"
echo ""

# exec replaces the shell with the Node process so signals (SIGTERM from
# Coolify/Docker stop) reach the wrapper directly for graceful shutdown.
exec node scripts/start-with-recovery.mjs
