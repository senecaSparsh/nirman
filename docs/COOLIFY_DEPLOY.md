# Deploying Nirman Inventory OS on a VPS with Coolify

> **Server**: HeavenCloud Mumbai — India Budget 12 GB plan (7 vCPU, 12 GB RAM, 120 GB SSD)
> **Cost**: ₹780/month (~$9) — ~5x cheaper than Render Pro (~$45–55/mo)
> **Latency**: ~5-10ms to Indian users — faster than any foreign server
> **Ease**: git push → auto-deploy (same workflow as Render)
> **Render config is untouched** — `render.yaml` stays in the repo; this is an
> alternative deploy target, not a replacement.

---

## What you get

| Component           | Setup                                                  |
| ------------------- | ------------------------------------------------------ |
| Postgres 16         | Docker container with persistent volume                |
| Next.js app         | Docker container, auto-recovery wrapper, health checks |
| Uploads             | Persistent volume (survives deploys/restarts)          |
| SSL                 | Coolify auto-provisions via Let's Encrypt              |
| Deploys             | git push → Coolify builds → deploys automatically      |
| Cron (daily backup) | See Step 7 below                                       |
| Bandwidth           | 1 Gbps unmetered (you'll use ~30-40 GB)                |
| DDoS protection     | 100 Gbps included                                      |
| Uptime              | 99.9% SLA                                              |

---

## Step 1 — Buy the VPS

1. Go to [heavencloud.in](https://heavencloud.in)
2. Navigate to **India Budget VPS** → **Mumbai**
3. Select the **India Budget 12 GB plan**:
   - 7 vCPU (Intel Xeon E5-2680 v4, dedicated cores)
   - 12 GB DDR4 RAM
   - 120 GB SSD
   - 1 Gbps unmetered bandwidth
   - DDoS protection up to 100 Gbps
   - **₹780/month**
4. Choose **OS**: Ubuntu 24.04 LTS Minimal
5. Complete checkout (UPI / Razorpay / card accepted)
6. You'll get an email with your server IP + root password (or SSH key setup via VirtFusion panel)

> **Why 12 GB, not 8 GB?** Coolify itself needs ~2 GB RAM to run. On 8 GB,
> that leaves ~6 GB for Postgres + your app + the Next.js build (which spikes
> hard during `next build`). The 12 GB plan gives 120 GB SSD (vs 90 GB) and
> 7 cores (vs 6) for only ₹100/month more — comfortable for 50 users and
> avoids build-time OOM.
>
> **Why HeavenCloud, not Hetzner?** Hetzner Singapore costs $22.99/mo
> (~~₹1,900) for a 4 GB server — nearly 3x more for half the RAM. Hetzner's
> EU servers are cheaper (~~₹950) but add ~200ms latency to every API call
> from India. HeavenCloud is in Mumbai — 5-10ms latency, unmetered bandwidth,
> and ₹780/mo. For an Indian construction company, this is the clear choice.

---

## Step 2 — Install Coolify

SSH into your server:

```bash
ssh root@<your-server-ip>
```

Run the Coolify installer (one command, ~5 minutes):

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

This installs Docker + Coolify automatically (9 steps: packages, Docker,
config, directories, firewall, images, containers, auto-update, Coolify itself).

When it finishes, open in your browser:

```
http://<your-server-ip>:8000
```

Create your admin account. You're now in the Coolify dashboard.

---

## Step 3 — Connect your Git repo

1. In Coolify: **Projects** → **New Project** → name it "Nirman"
2. Inside the project → **New Resource** → **Public Repository** (or Private if your repo is private)
3. Connect your GitHub/GitLab account (Coolify walks you through OAuth)
4. Select the `nirman-inventory` repository
5. Coolify detects `docker-compose.yml` — **change it to `docker-compose.prod.yml`**:
   - Service settings → **Build/Deploy** → **Docker Compose File** → set to `docker-compose.prod.yml`
   - (The default `docker-compose.yml` is for local dev — Postgres only on port 5433)

---

## Step 4 — Configure environment variables

In Coolify → your service → **Environment Variables**, set these:

### Required

| Variable              | Value                           | Notes                                          |
| --------------------- | ------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_APP_URL` | `https://nirman.yourdomain.com` | Your domain (set DNS first — see Step 5)       |
| `BETTER_AUTH_SECRET`  | (random 32+ chars)              | Generate on the VPS: `openssl rand -base64 32` |
| `POSTGRES_PASSWORD`   | (strong password)               | For the Postgres container                     |
| `CRON_SECRET`         | (random string)                 | Protects `/api/cron/*` endpoints               |

### Optional

| Variable                 | Value                 | Notes                                                |
| ------------------------ | --------------------- | ---------------------------------------------------- |
| `SEED_PASSWORD`          | `nirman123` (default) | Password for demo users. Change for real production. |
| `SENTRY_DSN`             | (Sentry DSN URL)      | Server-side error tracking. Leave empty to disable.  |
| `NEXT_PUBLIC_SENTRY_DSN` | (Sentry DSN URL)      | Client-side error tracking.                          |
| `POSTGRES_DB`            | `nirman_inventory`    | Default DB name                                      |
| `POSTGRES_USER`          | `nirman`              | Default DB user                                      |

### Build args

Set these in Coolify's **Build Args** section (not env vars — these are
baked into the client bundle at build time):

| Arg                      | Value                                                    |
| ------------------------ | -------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`    | `https://nirman.yourdomain.com` (must match the env var) |
| `NEXT_PUBLIC_SENTRY_DSN` | (your Sentry DSN, or leave empty)                        |

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
2. In Coolify → your service → **Domains** → add `https://nirman.yourdomain.com`
3. Coolify auto-provisions a Let's Encrypt SSL certificate (~30s)
4. Update `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` to match (both in env vars and build args)
5. Trigger a redeploy

> **No domain yet?** You can use the server IP directly for testing:
> set `NEXT_PUBLIC_APP_URL` to `http://<your-server-ip>` and skip SSL.
> **You must still add the domain in Coolify** (see Step 5.1 below) — Coolify's
> Traefik proxy on port 80 will not route to your container until you do.
> Add a real domain later when ready for production use.

---

## Step 5.1 — Expose the app via Coolify's proxy (REQUIRED)

Coolify runs a Traefik proxy on port 80 (and 443 for SSL). Your container
listens on port 3000, but **port 3000 is not exposed externally by default**
(the VPS firewall blocks it). Traffic must go through Coolify's proxy.

After Step 5 (domain configured) or if using the raw IP:

1. In Coolify → your `web` service → **Domains**
2. Add the domain/IP:
   - With a domain: `https://nirman.yourdomain.com`
   - Without a domain (IP only): `http://<your-server-ip>`
3. Coolify maps the proxy port (80/443) → your container's port 3000
4. Wait ~10s for Traefik to reload
5. Verify: `curl http://<your-server-ip>/api/health` → should return `200`

If you skip this step, the container runs but `http://<your-server-ip>:3000`
returns "Connection refused" (firewall) and `http://<your-server-ip>/`
returns `404 page not found` (Traefik has no route).

---

## Step 6 — Deploy

Click **Deploy** in Coolify. The build takes ~5–10 minutes on a 6 vCPU VPS:

1. Docker pulls `node:22-bookworm-slim`
2. `pnpm install --no-frozen-lockfile --ignore-scripts` (skips root `postinstall` which needs the Prisma schema not yet copied at this stage)
3. `pnpm --filter @nirman/db generate` (Prisma client — run after full source is copied)
4. `pnpm build` (Next.js webpack build — auto-detects RAM, allocates ~5 GB heap)
5. Slim runtime image assembled (dev deps kept — needed for migrations + seed)

On container start:

1. `prisma migrate deploy` (applies pending migrations)
2. `seed:prod` (chart of accounts + demo user passwords — idempotent, safe every deploy)
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

Once healthy, visit `https://nirman.yourdomain.com/api/health` — should return `200` with JSON showing liveness + DB reachability.

---

## Step 6.5 — First deploy: load demo data

On the very first deploy, the database has the schema + chart of accounts but
**no users or business data** (the demo seed is not run automatically because
it wipes transactional data on every run).

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

After the demo seed, sign in with:

```
amit@nirman.in / <SEED_PASSWORD>   (OWNER — full access)
anita@nirman.in / <SEED_PASSWORD>  (ADMIN)
sneha@nirman.in / <SEED_PASSWORD>  (MANAGER)
ravi@nirman.in / <SEED_PASSWORD>   (SUPERVISOR)
priya@nirman.in / <SEED_PASSWORD>  (ACCOUNTANT)
karan@nirman.in / <SEED_PASSWORD>  (SALES)
```

> **For a clean production deploy** (no demo data): skip this step entirely.
> Create your real company + users through the app's onboarding flow instead.

---

## Step 7 — Set up the daily backup cron

The app has a built-in backup endpoint (`POST /api/cron/backup`) that exports
all data to the `BackupRecord` table with 30-day retention. Set up a daily
trigger:

1. In Coolify → your web service → **Scheduled Tasks** → **Add**
2. Command:
   ```
   curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/backup || echo "backup failed"
   ```
3. Schedule: `0 2 * * *` (daily at 2:00 AM UTC = 7:30 AM IST)
4. This runs inside the web container, so `localhost:3000` works

---

## Step 8 — Back up the Postgres volume

The `BackupRecord` table stores data _inside_ Postgres, but if the volume is
lost, both the live data and the backups are lost. Set up off-VPS backups:

1. Coolify → your `db` service → **Backups** → enable scheduled backups
2. Choose a destination (S3, any S3-compatible storage, or local)
3. Schedule: daily

**Manual pg_dump** (alternative or one-off):

```bash
# Run on the VPS — dumps to a file, copy it off-server
docker exec nirman-db-1 pg_dump -U nirman nirman_inventory | gzip > backup_$(date +%Y%m%d).sql.gz
```

Set up a cron on your local machine or another server to pull this file
off the VPS regularly.

> **HeavenCloud also offers automated backups** via the VirtFusion control
> panel — enable this as an extra safety net. It backs up the entire VPS
> (not just Postgres) so you can restore the whole server if needed.

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

### Patch the OS (monthly)

```bash
ssh root@<your-server-ip>
apt update && apt upgrade -y
# Reboot if a kernel update was installed:
reboot
```

Coolify auto-restarts your containers after a reboot.

---

## Cost breakdown

| Item                                                     | Monthly cost             |
| -------------------------------------------------------- | ------------------------ |
| HeavenCloud 12 GB Mumbai (7 vCPU, 12 GB RAM, 120 GB SSD) | ₹780 (~$9)               |
| Domain (if you don't have one)                           | ₹85 (~$1)                |
| Off-site backup storage (Backblaze B2, 10 GB)            | ₹4 (~$0.05)              |
| **Total**                                                | **~~₹870/month (~~$10)** |

Compare to Render Pro: ~~$45–55/month (~~₹3,800–4,700). You save ~₹3,000–3,900/month.

### What you're trading vs Render Pro

| Render Pro                              | VPS + Coolify                                  |
| --------------------------------------- | ---------------------------------------------- |
| Managed Postgres with automated backups | You back up the volume yourself (Step 8)       |
| Zero server maintenance                 | You patch the OS monthly (one command)         |
| Auto-scaling                            | Fixed VPS size (upgrade via HeavenCloud panel) |
| Tier-1 infrastructure                   | Smaller provider (99.9% SLA, DDoS protected)   |
| $45–55/mo                               | ~$9/mo                                         |

For a 50-user internal ERP, this trade-off is worth it. The monthly OS patch
takes 2 minutes, and Coolify handles everything else (deploys, SSL, restarts).

---

## Troubleshooting

### Build fails: "out of memory"

The build wrapper auto-detects RAM and sets `--max-old-space-size`. On a 12 GB
VPS, it allocates ~4 GB for the build heap — plenty. If Coolify's own containers
are using RAM during the build, it may still OOM. Fix: Coolify stops the
`db` + `web` containers during builds by default. If it still OOMs, reboot
the VPS to clear any leaked memory and retry.

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
rebuild in Coolify: **Deploy** → **Rebuild from scratch**.

### Want to switch back to Render

`render.yaml` is untouched. Just deploy to Render as before — nothing in the
Render workflow was changed by adding these Docker files.

---

## File reference

| File                                    | Purpose                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `Dockerfile`                            | Multi-stage build: deps → build → slim runtime                       |
| `.dockerignore`                         | Excludes node_modules, .next, .env, storage, docs from build context |
| `docker-compose.prod.yml`               | Coolify orchestration: web + db + volumes + health checks            |
| `docker-compose.yml`                    | **Unchanged** — local dev Postgres on port 5433                      |
| `apps/web/scripts/docker-entrypoint.sh` | Runs migrations + seed, then execs the start wrapper                 |
| `render.yaml`                           | **Unchanged** — Render deploy config, still works                    |
