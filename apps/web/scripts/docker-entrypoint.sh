#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Docker Entrypoint — Nirman Inventory OS
#
# Runs on every container start (including Coolify deploys / restarts):
#   1. Prisma migrate deploy  — applies pending DB migrations (safe, ordered)
#   2. SRG REALCON provisioning — idempotent: creates SRG REALCON company +
#      7 team accounts on first run, silently skips on subsequent runs.
#      This is the FIRST and ONLY data added to a clean production database.
#   3. Production seed         — idempotent: chart of accounts for every
#      company (runs AFTER provisioning so SRG REALCON gets its GL accounts)
#   4. Start the app           — hands off to start-with-recovery.mjs which
#                                wraps `next start` with auto-restart, health
#                                checks, graceful shutdown, and memory monitoring.
#
# PRODUCTION POLICY:
#   The production database starts CLEAN — no demo companies, no mock users,
#   no fake projects or stock. The SRG REALCON provisioning script is the
#   first real data added. The demo seed (seed.ts) is NEVER run in production.
#   It is only available locally via `pnpm --filter @nirman/services seed`.
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
#   - `seed:prod` upserts the chart of accounts (structural, not mock data).
#   - `create-srg-users.mjs` creates missing records only; never resets passwords.
#   All three are safe to run on every deploy/restart.
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

# ── 2. Demo seed — HARD BLOCKED in production ───────────────────────────────
# The demo seed creates fake companies, users, projects, stock, suppliers, etc.
# It WIPES all transactional data on every run. It is for LOCAL DEVELOPMENT ONLY.
#
# If SEED_DEMO_DATA=true is accidentally left set in Coolify, we warn but do NOT
# run it. The production database must stay clean — SRG REALCON is the first data.
if [ "$SEED_DEMO_DATA" = "true" ]; then
  echo "── ⚠️  SEED_DEMO_DATA=true is set but IGNORED in production ──"
  echo "   The demo seed creates fake data and wipes the database."
  echo "   Production starts clean — SRG REALCON is the first real data."
  echo "   → Remove SEED_DEMO_DATA from your Coolify env vars."
  echo ""
fi

# ── 3. SRG REALCON user provisioning (idempotent — runs once, then no-ops) ──
# Creates the SRG REALCON parent company + 7 team member accounts with
# RBAC roles, H1–H4 hierarchy, phone-based login, and call-system phone
# numbers. On the first run it prints generated passwords to the deploy
# logs (copy them!). On subsequent runs it detects the company + users
# already exist and exits silently. Safe to run on every deploy.
#
# This is the FIRST and ONLY data added to a clean production database.
#
# ORDERING: this runs BEFORE seed:prod so the chart-of-accounts seed below
# sees SRG REALCON and seeds its GL accounts. The inverse order would leave
# the company without a chart of accounts — the first expense approval or
# GL posting would fail with "Chart of accounts is not seeded".
echo "── SRG REALCON user provisioning ──"
cd /app/apps/web
if ! node scripts/create-srg-users.mjs; then
  # Non-fatal by design: this runs on EVERY container start, and a transient
  # failure (e.g. DB connection blip during a restart) must not take the
  # whole app down — existing users can still sign in. But a real failure on
  # first deploy means missing accounts, so say so loudly instead of
  # claiming "skipped or already done".
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  ⚠  SRG PROVISIONING FAILED — the app will still start,     ║"
  echo "║     but some team accounts may be missing.                  ║"
  echo "║                                                             ║"
  echo "║  Fix: re-run manually once the DB is healthy —              ║"
  echo "║     cd /app/apps/web && node scripts/create-srg-users.mjs   ║"
  echo "║  The script is idempotent — re-running only creates what    ║"
  echo "║  is missing; it never resets existing passwords.            ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
else
  echo "✓ SRG provisioning check complete"
fi
echo ""

# ── 4. Production seed (idempotent — safe on every deploy) ──────────────────
# Seeds only the chart of accounts (structural data needed for GL posting)
# for EVERY company in the database — including SRG REALCON created above.
# Does NOT create any users, companies, or mock data.
echo "── Running production seed (chart of accounts) ──"
cd /app/apps/web
node --import tsx scripts/seed-prod.ts
echo "✓ Seed complete"
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
