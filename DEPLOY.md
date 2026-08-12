# Deploying Nirman Inventory OS to Render

## Prerequisites

1. A [Render](https://render.com) account
2. A GitHub repo with this code pushed to it
3. The app builds and runs locally (verified with `pnpm build` + `pnpm start`)

## One-time setup (5 minutes)

### 1. Push to GitHub

```bash
git remote add origin https://github.com/yourusername/nirman-inventory.git
git push -u origin main
```

### 2. Create a new Blueprint on Render

1. Go to https://dashboard.render.com → **New** → **Blueprint**
2. Select your GitHub repo
3. Render will read `render.yaml` and create:
   - A PostgreSQL database (`nirman-db`)
   - A web service (`nirman-inventory`)

### 3. Set environment variables

In the Render dashboard, go to the **nirman-inventory** web service → **Environment**:

| Key | Value | How |
|-----|-------|-----|
| `BETTER_AUTH_SECRET` | (random 64-char hex) | Run `openssl rand -hex 32` locally, paste it |
| `BETTER_AUTH_URL` | `https://your-app.onrender.com` | Your Render URL (shown after first deploy) |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.onrender.com` | Same as above |
| `SEED_PASSWORD` | (a strong password) | This is the password for demo users |

> `DATABASE_URL` is automatically wired from the Postgres service — don't set it manually.

### 4. Deploy

Click **Create Blueprint**. Render will:
1. Install dependencies (`pnpm install`)
2. Build the app (`pnpm build`) — this also generates the Prisma client
3. Before starting: run migrations (`prisma migrate deploy`), seed demo data, set passwords
4. Start the server (`next start`)

First deploy takes ~5 minutes. Watch the logs for "Production seed complete."

### 5. Sign in

Once deployed, go to `https://your-app.onrender.com/sign-in`:

| Email | Role | Password |
|-------|------|----------|
| amit@nirman.in | OWNER (full access) | your SEED_PASSWORD |
| anita@nirman.in | ADMIN | your SEED_PASSWORD |
| sneha@nirman.in | MANAGER | your SEED_PASSWORD |
| ravi@nirman.in | SUPERVISOR | your SEED_PASSWORD |
| priya@nirman.in | ACCOUNTANT | your SEED_PASSWORD |
| karan@nirman.in | SALES | your SEED_PASSWORD |

The OWNER account (Amit) has access to everything — that's the one the owner should use.

## What happens automatically on every deploy

```
pnpm install
  → postinstall: prisma generate (creates the DB client)
pnpm build
  → turbo build → next build (compiles the app)
preDeploy:
  → prisma migrate deploy (applies any new migrations)
  → pnpm seed (creates demo company, users, projects, materials, stock, etc.)
  → pnpm seed:prod (sets passwords on demo users)
pnpm start
  → next start (production server)
```

The seed is idempotent — it upserts master data and wipes/recreates transactional data.
Re-running it on every deploy is safe and keeps the demo dataset fresh.

## Going to real production (beyond demo)

When you're ready to use this with real data (not demo):

1. **Remove the seed from `preDeployCommand`** in `render.yaml` — comment out the `seed` and `seed:prod` lines
2. **Create a real owner account** — sign up via the sign-in page with a real email and strong password
3. **Delete demo users** — after confirming your real account works, remove the demo users from the database
4. **Set a strong `SEED_PASSWORD`** or remove it entirely if you've removed the seed step
5. **Upgrade the database plan** — the free Postgres on Render expires after 90 days; use a paid plan for production

## Troubleshooting

### "Base URL is not set" warning
Make sure `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` are set to your Render URL (with `https://`).

### Sign-in doesn't work after deploy
Check the deploy logs for "Production seed complete." If the seed failed, the demo users won't have passwords. You can manually re-run it:
```bash
# In the Render shell (Dashboard → your service → Shell)
cd apps/web && pnpm seed:prod
```

### Database connection errors
Verify `DATABASE_URL` is set (it should be automatic from the Postgres service). Check that the database is in the same region as the web service.

### Migrations fail
If `prisma migrate deploy` fails, check that the database is empty (fresh Render Postgres) or that previous migrations were applied. You can check migration status:
```bash
cd packages/db && npx prisma migrate status
```
