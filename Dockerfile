# ─────────────────────────────────────────────────────────────────────────────
# Nirman Inventory OS — Dockerfile for Coolify / VPS deployment
#
# Multi-stage build:
#   1. deps    — install all dependencies (cached layer)
#   2. builder — generate Prisma client + build Next.js (webpack, not Turbopack)
#   3. runner  — slim production image with only built artifacts + prod deps
#
# Render config (render.yaml) is NOT touched — this is an alternative deploy
# target. Both can coexist; pick whichever platform you deploy to.
#
# Build args (set via Coolify dashboard or docker build --build-arg):
#   NEXT_PUBLIC_APP_URL — public URL, e.g. https://nirman.yourdomain.com
#                         (baked into the client bundle at build time — required)
#   NEXT_PUBLIC_SENTRY_DSN — optional, client-side Sentry DSN
#
# Runtime env vars (set in Coolify dashboard / docker-compose):
#   DATABASE_URL        — Postgres connection string (pooled)
#   DIRECT_URL          — Postgres connection string (non-pooled, for migrations)
#   BETTER_AUTH_URL     — same as NEXT_PUBLIC_APP_URL
#   BETTER_AUTH_SECRET  — random 32+ char secret
#   SEED_PASSWORD       — password for demo users (defaults to nirman123)
#   CRON_SECRET         — shared secret for /api/cron/* endpoints
#   SENTRY_DSN          — optional, server-side Sentry
#   NODE_OPTIONS        — leave empty; auto-memory wrapper tunes the heap
# ─────────────────────────────────────────────────────────────────────────────

# Node 22 LTS — matches render.yaml (NODE_VERSION: 22.18.0)
FROM node:22-bookworm-slim AS deps

RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

WORKDIR /app

# Copy lockfile + workspace manifests first (cache-friendly)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/services/package.json ./packages/services/

# Install ALL deps (including devDeps — needed for build)
# Show verbose output so errors are visible in build logs
RUN pnpm install --no-frozen-lockfile --reporter=append-output 2>&1 || \
    (echo "=== PNPM INSTALL FAILED ===" && \
     pnpm install --no-frozen-lockfile --verbose 2>&1 | tail -100 && \
     exit 1)

# ── Stage 2: Build ──────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

# Copy the full source (everything not excluded by .dockerignore)
COPY . .

# Build args — NEXT_PUBLIC_* vars are inlined at build time by Next.js.
# If not provided, the app still builds but client-side URL defaults to
# whatever is in the code (localhost). Set these!
ARG NEXT_PUBLIC_APP_URL=""
ARG NEXT_PUBLIC_SENTRY_DSN=""

ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1

# Generate Prisma client BEFORE build — the app imports types from @nirman/db
# at compile time, so the generated client must exist first.
RUN pnpm --filter @nirman/db generate

# Build with webpack (not Turbopack). The build.mjs wrapper auto-detects RAM
# and sets --max-old-space-size. Turbopack production builds have a known
# "module factory is not available" bug with Prisma's `export *` pattern
# (vercel/next.js#86132, #88534, #86714). Webpack is stable.
RUN pnpm build

# NOTE: We intentionally do NOT run `pnpm prune --prod` here. The runtime
# entrypoint needs `prisma` CLI (devDep — used by migrate-deploy.mjs) and
# `tsx` (devDep — used by seed-prod.ts). Pruning would break the entrypoint.
# The extra ~300MB of dev deps is irrelevant on a 40GB VPS disk, and keeping
# them avoids fragile workarounds. If image size matters later, move `prisma`
# and `tsx` to dependencies or install them globally in the runner stage.

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

WORKDIR /app

# Security: run as non-root user
RUN groupadd --system --gid 1001 nirman && \
    useradd --system --uid 1001 --gid nirman --no-create-home --home-dir /app nirman

# Copy the built monorepo from the builder stage.
# We need: node_modules (prod-only), all package.json files, the built
# .next output, prisma schema + migrations, scripts, and public assets.
COPY --from=builder --chown=nirman:nirman /app/node_modules ./node_modules
COPY --from=builder --chown=nirman:nirman /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder --chown=nirman:nirman /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=builder --chown=nirman:nirman /app/packages/services/node_modules ./packages/services/node_modules
COPY --from=builder --chown=nirman:nirman /app/package.json ./package.json
COPY --from=builder --chown=nirman:nirman /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=nirman:nirman /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=nirman:nirman /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=nirman:nirman /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nirman:nirman /app/apps/web/scripts ./apps/web/scripts
COPY --from=builder --chown=nirman:nirman /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder --chown=nirman:nirman /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder --chown=nirman:nirman /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder --chown=nirman:nirman /app/packages/db/src ./packages/db/src
COPY --from=builder --chown=nirman:nirman /app/packages/db/scripts ./packages/db/scripts
COPY --from=builder --chown=nirman:nirman /app/packages/services/package.json ./packages/services/package.json
COPY --from=builder --chown=nirman:nirman /app/packages/services/src ./packages/services/src
COPY --from=builder --chown=nirman:nirman /app/packages/services/prisma ./packages/services/prisma

# Persistent upload directory — Coolify mounts a volume here.
# Files are stored outside public/ for auth-gated access (see /api/uploads).
RUN mkdir -p /app/storage/uploads && chown -R nirman:nirman /app/storage

# Entrypoint script: runs migrations + seed, then starts the recovery wrapper.
COPY --chown=nirman:nirman apps/web/scripts/docker-entrypoint.sh ./apps/web/scripts/docker-entrypoint.sh
RUN chmod +x ./apps/web/scripts/docker-entrypoint.sh

USER nirman

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/app/storage/uploads

EXPOSE 3000

# Coolify / Docker health check — liveness only (no DB query).
# The start-with-recovery wrapper does its own deep health check internally.
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Entrypoint: migrate → seed → start-with-recovery wrapper
ENTRYPOINT ["./apps/web/scripts/docker-entrypoint.sh"]
