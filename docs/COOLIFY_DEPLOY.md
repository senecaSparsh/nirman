# Deploying Nirman Inventory OS on a VPS with Coolify

> **Cost**: ~$5–8/month (Hetzner CX22: 2 vCPU, 4 GB RAM, 40 GB disk, 20 TB bandwidth)
> **Ease**: git push → auto-deploy (same workflow as Render)
> **Render config is untouched** — `render.yaml` stays in the repo; this is an
> alternative deploy target, not a replacement.

---

## What you get

| Component | Setup |
|---|---|
| Postgres 16 | Docker container with persistent volume |
| Next.js app | Docker container, auto-recovery wrapper, health checks |
| Uploads | Persistent volume (survives deploys/restarts) |
| SSL | Coolify auto-provisions via Let's Encrypt |
| Deploys | git push → Coolify builds → deploys automatically |
| Cron (daily backup) | See "Cron" section below |

---

## Step 1 — Provision a VPS

### Recommended: Hetzner Cloud

1. Sign up at [hetzner.cloud](https://hetzner.cloud)
2. Create a server:
   - **Location**: Falkenstein (cheapest) or Ashburn (if your users are in India/US)
   - **Image**: Ubuntu 24.04
   - **Type**: CX22 (2 vCPU, 4 GB RAM) — **€4.59/month**
   - **SSH key**: add your public key
3. Note the server IP.

### Alternatives

| Provider | Equivalent | Price |
|---|---|---|
| Hetzner | CX22 (2 vCPU/4 GB) | ~$5/mo |
| Contabo | VPS S (4 vCPU/8 GB) | ~$6/mo |
| DigitalOcean | Basic Droplet (1 vCPU/2 GB) | ~$12/mo |
| Vultr | Cloud Compute (1 vCPU/2 GB) | ~$12/mo |

Hetzner gives the best value. Contabo has more RAM but slower CPUs.

---

## Step 2 — Install Coolify

SSH into your VPS:

```bash
ssh root@<your-server-ip>
```

Run the Coolify installer (one command):

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

This installs Docker + Coolify and starts the Coolify dashboard. Takes ~5 minutes.

When done, open in your browser:
```
http://<your-server-ip>:8000
```

Create your admin account. You're now in the Coolify dashboard.

---

## Step 3 — Connect your Git repo

1. In Coolify, go to **Projects** → **New Project** → name it "Nirman"
2. Inside the project → **New Resource** → **Public Repository** (or Private if your repo is private)
3. Connect your GitHub/GitLab account (Coolify walks you through OAuth)
4. Select the `nirman-inventory` repository
5. Coolify detects `docker-compose.yml` automatically and shows it

---

## Step 4 — Configure environment variables

In the Coolify service settings, go to **Environment Variables** and set:

### Required

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://nirman.yourdomain.com` | Your domain (set DNS first, see Step 5) |
| `BETTER_AUTH_SECRET` | (random 32+ chars) | Generate: `openssl rand -base64 32` |
| `POSTGRES_PASSWORD` | (strong password) | For the Postgres container |
| `CRON_SECRET` | (random string) | Protects `/api/cron/*` endpoints |

### Optional

| Variable | Value | Notes |
|---|---|---|
| `SEED_PASSWORD` | `nirman123` (default) | Password for demo users. Change for production. |
| `SENTRY_DSN` | (Sentry DSN URL) | Server-side error tracking. Leave empty to disable. |
| `NEXT_PUBLIC_SENTRY_DSN` | (Sentry DSN URL) | Client-side error tracking. |
| `POSTGRES_DB` | `nirman_inventory` | Default DB name |
| `POSTGRES_USER` | `nirman` | Default DB user |

### Build args

Set these in Coolify's **Build Args** section (not env vars — these are
baked into the client bundle at build time):

| Arg | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://nirman.yourdomain.com` (same as the env var) |
| `NEXT_PUBLIC_SENTRY_DSN` | (your Sentry DSN, or leave empty) |

> **Why both build arg AND env var for NEXT_PUBLIC_APP_URL?**
> Next.js inlines `NEXT_PUBLIC_*` vars into the client JavaScript at build
> time. The env var at runtime is for server-side code; the build arg is for
> the client bundle. They must match.

---

## Step 5 — Set up your domain

1. Point a DNS A record to your VPS IP:
   ```
   nirman.yourdomain.com   A   <your-server-ip>
   ```
2. In Coolify, go to your service → **Domains** → add `https://nirman.yourdomain.com`
3. Coolify auto-provisions a Let's Encrypt SSL certificate (takes ~30s)
4. Update `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` to match (both in env vars and build args)
5. Trigger a redeploy

---

## Step 6 — Deploy

Click **Deploy** in Coolify. The build takes ~5–10 minutes on a 2 vCPU VPS:

1. Docker pulls `node:22-bookworm-slim`
2. `pnpm install --frozen-lockfile`
3. `pnpm --filter @nirman/db generate` (Prisma client)
4. `pnpm build` (Next.js webpack build — auto-detects RAM)
5. `pnpm prune --prod` (strips dev deps)
6. Slim runtime image assembled

On container start:
1. `prisma migrate deploy` (applies pending migrations)
2. `seed:prod` (chart of accounts + demo user passwords)
3. `start-with-recovery.mjs` (wraps `next start` with auto-restart + health checks)

Watch the logs in Coolify → **Logs**. You should see:
```
=== Nirman Inventory OS — Container Startup ===
── Running Prisma migrations ──
✓ Migrations complete
── Running production seed ──
✓ Seed complete
── Starting Next.js production server ──
```

Once healthy, visit `https://nirman.yourdomain.com` and sign in with:
```
amit@nirman.in / <SEED_PASSWORD>   (OWNER — full access)
```

---

## Step 6.5 — First deploy: load demo data (optional)

On the very first deploy, the database will have the schema + chart of
accounts but **no users or business data** (the demo seed is not run
automatically because it wipes transactional data on every run).

To load the demo dataset (company, users, projects, stock, suppliers, etc.):

1. In Coolify → your web service → **Environment Variables**
2. Set `SEED_DEMO_DATA=true`
3. Click **Deploy** (restarts the container)
4. Watch the logs — you'll see "Running demo seed" + "Demo seed complete"
5. **Immediately** set `SEED_DEMO_DATA=false` (or delete the variable)
6. Click **Deploy** again

If you forget step 5, every container restart will wipe all user-entered data
and replace it with the demo dataset. The entrypoint prints a warning when
`SEED_DEMO_DATA=true` is active.

After the demo seed, sign in with the demo users listed above.

> **For a clean production deploy** (no demo data): skip this step entirely.
> Create your real company + users through the app's onboarding flow instead.

---

## Step 7 — Set up the daily backup cron

The app has a built-in backup endpoint (`POST /api/cron/backup`) that exports
all data to the `BackupRecord` table with 30-day retention. You need to trigger
it daily.

### Option A: Coolify Scheduled Task (recommended)

1. In your web service → **Scheduled Tasks** → **Add**
2. Command:
   ```
   curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/backup || echo "backup failed"
   ```
3. Schedule: `0 2 * * *` (daily at 2:00 AM UTC)
4. This runs inside the web container, so `localhost:3000` works.

### Option B: Host crontab

SSH into the VPS and add:
```bash
crontab -e
```
```cron
0 2 * * * curl -fsS -X POST -H "x-cron-secret: YOUR_CRON_SECRET" https://nirman.yourdomain.com/api/cron/backup || echo "backup failed"
```

---

## Step 8 — Back up the Postgres volume

The `BackupRecord` table stores data *inside* Postgres, but if the volume is
lost, both the live data and the backups are lost. Set up off-VPS backups:

### Coolify volume backup

1. Coolify → your `db` service → **Backups** → enable scheduled backups
2. Choose a destination (S3, any S3-compatible storage, or local)
3. Schedule: daily

### Manual pg_dump (alternative)

```bash
# Run on the VPS — dumps to a file, copy it off-server
docker exec nirman-db-1 pg_dump -U nirman nirman_inventory | gzip > backup_$(date +%Y%m%d).sql.gz
```

Set up a cron on your local machine or another server to pull this file.

---

## Ongoing operations

### Deploy an update

```bash
git push origin main
```

Coolify auto-detects the push, rebuilds, and deploys. Zero downtime — the
container drains for 30s (graceful shutdown) before the new one takes over.

### View logs

Coolify → your service → **Logs**. Real-time stdout from the app + wrapper.

### Check health

```bash
curl https://nirman.yourdomain.com/api/health
```

Returns `200` with JSON showing liveness + DB reachability + memory config.

### Run Prisma Studio (debug DB)

Temporarily expose the DB port in Coolify, then:
```bash
npx prisma studio --url "postgresql://nirman:PASSWORD@your-server-ip:5432/nirman_inventory"
```
**Disable the port exposure when done** — don't leave Postgres open to the internet.

### SSH into the running container

```bash
docker exec -it <container-name> sh
```

---

## Cost breakdown

| Item | Monthly cost |
|---|---|
| Hetzner CX22 (2 vCPU, 4 GB RAM) | ~$5 |
| Domain (if you don't have one) | ~$1 |
| Off-site backup storage (S3/Backblaze B2) | ~$0.50 |
| **Total** | **~$6.50/month** |

Compare to Render Pro: ~$45–55/month. You save ~$40–48/month.

### What you're trading

| Render Pro | VPS + Coolify |
|---|---|
| Managed Postgres with automated backups | You back up the volume yourself |
| Zero server maintenance | You patch the OS (Ubuntu `apt update && apt upgrade` monthly) |
| Auto-scaling | Fixed VPS size (manual upgrade: snapshot → larger server) |
| DDoS protection | None (add Cloudflare free tier in front if needed) |
| $45–55/mo | $6.50/mo |

For a 50-user internal ERP, the VPS trade-off is worth it. Put Cloudflare
(free) in front for DDoS protection + caching, set up volume backups, and
you're done.

---

## Troubleshooting

### Build fails: "out of memory"

The build wrapper auto-detects RAM and sets `--max-old-space-size`. On a 4 GB
VPS, it allocates ~3.2 GB for the build. If other containers are using RAM
during the build, it may OOM. Fix: stop the `db` + `web` containers during
builds (Coolify does this by default), or upgrade to an 8 GB VPS.

### Container restarts repeatedly

Check logs in Coolify. Common causes:
- **DB not ready**: the `depends_on: service_healthy` should handle this, but
  if Postgres takes >30s to start, the web container may fail. The
  start-with-recovery wrapper retries for 90s before giving up.
- **Missing env vars**: `BETTER_AUTH_SECRET` or `DATABASE_URL` not set. Check
  Coolify → Environment Variables.
- **Migration failure**: check if `DIRECT_URL` is set (migrations use the
  non-pooled connection).

### Uploads disappear after deploy

The `uploads` volume is persistent. If uploads disappear, check that the
volume is mounted correctly: Coolify → your service → **Volumes** → verify
`/app/storage/uploads` is mapped to a named volume (not an ephemeral one).

### "Cannot read properties of undefined (reading 'findMany')"

This means the Prisma client is stale (a model was added to the schema but
the client wasn't regenerated). The Dockerfile runs `pnpm --filter @nirman/db
generate` before build, so this shouldn't happen. If it does, trigger a clean
rebuild in Coolify (not a cached one): **Deploy** → **Rebuild from scratch**.

### Want to switch back to Render

`render.yaml` is untouched. Just deploy to Render as before — nothing in the
Render workflow was changed by adding these Docker files.

---

## File reference

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build: deps → build → slim runtime |
| `.dockerignore` | Excludes node_modules, .next, .env, storage, docs from build context |
| `docker-compose.yml` | Coolify orchestration: web + db + volumes + health checks |
| `apps/web/scripts/docker-entrypoint.sh` | Runs migrations + seed, then execs the start wrapper |
| `render.yaml` | **Unchanged** — Render deploy config, still works |
