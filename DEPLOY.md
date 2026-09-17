# Deploying Nirman Inventory OS — SRG REALCON (Coolify / Docker)

This is the production path. The app deploys as a single Docker container (see
`Dockerfile`) on a Coolify-managed VPS. On every container start,
`apps/web/scripts/docker-entrypoint.sh` runs:

```
prisma migrate deploy        → applies pending migrations (safe, ordered)
SEED_DEMO_DATA check         → warns + skips if accidentally set (never runs)
node scripts/create-srg-users.mjs   → SRG REALCON company + 7 accounts (idempotent)
node --import tsx scripts/seed-prod.ts  → chart of accounts for every company
exec scripts/start-with-recovery.mjs    → production server + self-healing
```

The production database starts **clean** — no demo companies, no mock data.
SRG REALCON provisioning is the first real data. The demo seed is never run.

## Environment variables (set in Coolify)

Required — the app exits at startup if any are missing:

| Key                   | Value                                                                      |
| --------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`        | Postgres connection string (include `connection_limit=20&pool_timeout=10`) |
| `DIRECT_URL`          | Non-pooled Postgres URL for migrations (usually same as DATABASE_URL)      |
| `BETTER_AUTH_SECRET`  | Random 64-char hex — `openssl rand -hex 32`                                |
| `BETTER_AUTH_URL`     | `https://<your-domain>`                                                    |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` (same as above)                                    |

Never set: `AUTH_BYPASS` (the app refuses to boot if it's `true` in production),
`NEXT_PUBLIC_AUTH_BYPASS`, `SEED_DEMO_DATA`.

Recommended:

| Key                                        | Why                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `CRON_SECRET`                              | Daily 2am UTC backups + cron reminders (`POST /api/cron/*`)                   |
| `UPLOAD_DIR`                               | Defaults to `/app/storage/uploads` — mount a Coolify volume at `/app/storage` |
| `SENTRY_DSN`                               | Error tracking                                                                |
| `INTEGRATION_ENCRYPTION_KEY`               | AES-256 key if integrations are configured                                    |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Telephony features (optional)                                                 |

## First deploy — what to watch for

1. In Coolify deploy logs, find the **credential table** printed by
   `create-srg-users.mjs` — 7 phone numbers + generated 16-char passwords.
   **Copy these before the log rotates.** The same table is also written to
   `<volume>/srg-credentials.txt` (mode 0600, next to `uploads/` on the
   persistent volume) — copy it off the VPS, then delete the file.
2. Confirm `✓ Migrations complete`, `✓ SRG provisioning check complete`,
   `✓ Seed complete` all appear.
3. Hit `https://<your-domain>/api/health` — should return 200.

## SRG REALCON accounts

| Name          | Role                | Hierarchy | Phone (login id) |
| ------------- | ------------------- | --------- | ---------------- |
| Vardaan Kumar | OWNER               | H1        | 7017988293       |
| Sanjeev Kumar | ADMIN               | H1        | 9412230391       |
| Anurag Garg   | PROJECT_DIRECTOR    | H2        | 7302920202       |
| Manish Kumar  | FINANCE_HEAD        | H3        | 7302920201       |
| Raviraj Singh | PROCUREMENT_MANAGER | H3        | 9520002752       |
| Mani Singh    | SALES_MANAGER       | H4        | 7302920203       |
| Yash Saxena   | SITE_ENGINEER       | H4        | 7302920205       |

**Sign-in:** open the app → **Phone** tab (default) → enter the 10-digit
number (no `+91`) → the generated password. No forced password change on
first login — distribute credentials directly to each person.

Passwords are **never reset** by re-running the script. To reset one, use the
admin UI (Team settings → reset password) as the owner/admin.

## Re-running provisioning manually

The script is idempotent — it creates only what's missing and can be run any
time (e.g. after a partial failure):

```bash
# On the VPS, inside the web container
docker exec -it <container> node /app/apps/web/scripts/create-srg-users.mjs
```

If it exits `0`, state is fully provisioned. If it fails, the entrypoint
prints a loud warning box — the app still starts, but fix and re-run.

## Restarts and re-deploys

Everything in the entrypoint is safe to repeat: migrations only apply pending
files, provisioning skips existing records, the chart-of-accounts seed upserts.
A redeploy or restart will not duplicate data or reset passwords.

## Backups

`POST /api/cron/backup` (requires `CRON_SECRET` header) exports all company
data into the `BackupRecord` table, 30-day retention. Wire it to a daily cron
(Coolify scheduled task or external cron hitting the endpoint).

## Troubleshooting

- **Deploy fails at migrations** — check `migrate:status`; the wrapper
  (`packages/db/scripts/migrate-deploy.mjs`) self-heals databases previously
  synced via `db push`, but a genuinely conflicting schema needs manual review.
- **"Chart of accounts is not seeded"** — `seed-prod.ts` runs after
  provisioning every boot; if you see this error, check the startup logs for a
  seed failure.
- **A user can't sign in** — verify the phone is the 10-digit login id above;
  check the account isn't locked (5 failed attempts → 30-min lockout, settable
  per company); confirm `failedLoginAttempts`/`lockedUntil` on the User row.
- **Missing accounts after first deploy** — re-run the provisioning command
  above; it only fills in what's missing.
- **Render** — not used. The old `render.yaml` blueprint was removed;
  production is Coolify/VPS only (`nirman.life`).
