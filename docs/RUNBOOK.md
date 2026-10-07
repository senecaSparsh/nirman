# Runbook — Nirman Inventory OS

> Symptom → diagnose → fix. For the _design_ answers, see
> `docs/PRODUCTION-READINESS.md`. For access credentials, see
> `.env.prod-secrets` (gitignored) or `AGENTS.md` §Production Access.

## Access

```bash
ssh nirman-vps                    # SSH alias, key ~/.ssh/devin_nirman
# Coolify dashboard: http://82.41.67.34:8000
# App: https://nirman.life
./scripts/prod-health-check.sh    # one-shot full-stack diagnosis + autofix
```

## Severity levels

| Sev | Meaning                     | Examples                                                 | Response                    |
| --- | --------------------------- | -------------------------------------------------------- | --------------------------- |
| S1  | Site down or data-loss risk | Health check failing, DB corrupt, auth bypass            | Drop everything, page owner |
| S2  | Core flow broken            | POs won't approve, stock ledger diverging, GL unbalanced | Same-day fix                |
| S3  | Degraded feature            | Tally sync failing, one report wrong, notification lag   | Next working session        |
| S4  | Cosmetic / UX               | Label wrong, tooltip missing                             | Backlog                     |

## Incident response — the loop

1. **Detect** — uptime-check email, ErrorLog signature notify, user report.
2. **Triage** — `prod-health-check.sh`; classify S1–S4.
3. **Mitigate** — the fastest correct action below (restart, reconnect,
   rollback, restore).
4. **Resolve** — fix the root cause; don't stop at the restart.
5. **Postmortem** — S1/S2 always get one (template at the bottom).

## Known failures → fixes

### Site unreachable (S1)

```bash
./scripts/prod-health-check.sh          # containers, proxy, health — autofixes
curl -sI https://nirman.life/api/health # 200/503/nothing?
ssh nirman-vps 'docker ps -a'           # what's up/down
```

| Finding                                         | Fix                                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `web` crash-looping                             | `docker logs web --tail 200`; usually a bad migration or missing env — see §migrations                                |
| `scheduler`/`backup` crash-looping after deploy | Script files missing from VPS → `prod-health-check.sh` auto-uploads + restarts                                        |
| HTTPS dead but HTTP works                       | `coolify-proxy` not on app network → `ssh nirman-vps 'docker network connect oa346mulnes3pgn6gmij6dih coolify-proxy'` |
| Disk full                                       | `docker system df`; uploads volume is the usual suspect — prune `pgbackups` retention or old `docker images`          |
| DB container down                               | `docker start db`; if auth fails after env change → see `POSTGRES_PASSWORD` trap below                                |

### 5xx spike / DB unreachable (S1–S2)

- `P2024` pool exhausted → 503s; check `DATABASE_URL` has
  `connection_limit=20&pool_timeout=10`; restart `web`.
- `P1001` unreachable → `db` container down or network split; `docker ps`,
  `docker network inspect`.
- Slow queries → all reports are DB-aggregated by convention; check for a
  new `findMany().reduce()` over history in the diff that introduced it.

### Memory pressure / OOM (S2)

The wrapper auto-restarts at 85% heap. If recurring:

```bash
ssh nirman-vps 'free -m && docker stats --no-stream'
```

Heap, Prisma pool, rate limits all auto-scale to detected RAM — the fix is
raising the container limit in Coolify, not tuning code.

### Deploy went bad (S1)

```bash
# Rollback app (Coolify: redeploy previous image, or):
ssh nirman-vps 'docker service update --rollback <service>'   # if swarm
# Rollback DB (if the migration broke it):
#   pre-deploy snapshot is at /backups/pre-deploy-<UTC>.sql.gz
ssh nirman-vps 'ls -t /var/lib/docker/volumes/*/_data/backups/ | head'  # locate
# drop+recreate public schema, then gunzip -c <snapshot> | psql
```

Full restore procedure: `docs/DISASTER-RECOVERY.md`.

### Migration drift (blocks deploy) (S2)

`migrate-deploy.mjs` aborts with a loud banner on residual drift. Diagnose:
`pnpm --filter @nirman/db migrate:status`. Usual cause: an object created
outside migrations (data-fixes.sql is DML-only by convention) or a schema
change committed without `migrate:dev`. Fix: write the missing migration,
commit, redeploy.

### `POSTGRES_PASSWORD` trap (S1 — auth outage)

Postgres reads it only at **first init** (empty volume). Changing it in
Coolify later doesn't update the DB but _does_ change web's `DATABASE_URL`
→ instant auth failure. To rotate: `ALTER USER nirman WITH PASSWORD '…'`
in psql, _then_ update the env value to match.

### ErrorLog signature flood (S3)

`/dev/errors` — resolve a signature; if it recurs it auto-reopens with
`reopenedCount++`. Resolve = you've shipped the fix, not hidden the error.

## Secrets rotation

| Secret                             | Where                                           | Rotate how                                                                                           |
| ---------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`               | Coolify env                                     | New value → restart (invalidates all sessions — warn users)                                          |
| `CRON_SECRET` / `SCHEDULER_SECRET` | Coolify env (both `web` + `scheduler` services) | Update both, restart both                                                                            |
| `POSTGRES_PASSWORD`                | psql `ALTER USER` first, then Coolify env       | See trap above                                                                                       |
| `INTEGRATION_ENCRYPTION_KEY`       | Coolify env                                     | ⚠️ rotating orphans previously-encrypted creds — re-enter them in the integrations UI after rotation |
| `SENTRY_DSN`                       | Coolify env                                     | New DSN → rebuild (it's baked at build time for client)                                              |
| Coolify API token                  | `.env.prod-secrets`                             | Renew before expiry (30-day tokens) via Coolify dashboard                                            |

## Scheduled jobs — expected cadence

| Job                   | Fires  | Silent-failure tell                             |
| --------------------- | ------ | ----------------------------------------------- |
| `cron/reminders`      | 15 min | Payment/rent reminders stop arriving            |
| `workflow-scheduler`  | 5 min  | Scheduled workflows never trigger               |
| `cron/backup`         | daily  | `BackupRecord` rows stop; `pgbackups` dir stale |
| `cron/daily-digest`   | daily  | Morning briefing absent                         |
| `cron/approval-aging` | daily  | Stale approvals don't escalate                  |
| `cron/integrity`      | daily  | Authority drift unflagged                       |
| `cron/reconciliation` | daily  | Stock/GL drift unflagged                        |
| `cron/tally-sync`     | hourly | `TallySyncLog` PENDING grows                    |
| `cron/hsn-seed`       | weekly | HSN master stale                                |

All of the above fail **silently** if `scheduler.sh` lacks the line or
`CRON_SECRET` is unset — check `docker logs scheduler` first.

## Postmortem template

```markdown
# Postmortem: <title>

**Date**: <date> · **Severity**: S<n> · **Duration**: <detect→resolve>
**Author**: <name>

## What happened

<timeline — detection → triage → mitigation → resolution>

## Root cause

<the actual mechanism, not "a bug">

## Impact

<what users/data experienced>

## What worked

<detected fast? rollback clean? snapshot usable?>

## What didn't

<where the process or code failed>

## Action items

- [ ] <fix that prevents recurrence> — owner, due
- [ ] <detection that would have caught it sooner>
- [ ] <doc/runbook update>
```

File under `docs/postmortems/YYYY-MM-DD-<slug>.md`.
