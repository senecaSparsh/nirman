# Disaster Recovery — Nirman Inventory OS

> Recovery is a **procedure**, not a hope. Three independent backup layers,
> a stated RPO/RTO, and a restore drill to prove the backups work.

## Objectives (stated, not implied)

| Metric                  | Target    | Mechanism                                                      |
| ----------------------- | --------- | -------------------------------------------------------------- |
| **RPO** (max data loss) | **24 h**  | Nightly `pg_dump` + uploads tarball                            |
| **RTO** (max downtime)  | **~1 h**  | Redeploy image + restore dump on the same VPS                  |
| Pre-migration loss      | **0**     | Snapshot taken _before_ every `migrate deploy`                 |
| Backup verification     | quarterly | Restore drill below — a backup you haven't restored is a rumor |

## The three backup layers

1. **`pgbackups` volume** (primary) — `backup` sidecar runs nightly
   `pg_dump` + `tar` of `/app/storage/uploads`, 14-day retention
   (`RETENTION_DAYS`). Real dump files, survive DB corruption.
2. **`BackupRecord` rows** (logical export) — `/api/cron/backup` writes an
   export per company _into_ Postgres, 30-day retention. Useful for
   per-company restore/export; does not survive full DB loss.
3. **Pre-migration snapshots** — `docker-entrypoint.sh` runs `pg_dump` to
   `/backups/pre-deploy-<UTC>.sql.gz` (keeps newest 30) before migrations,
   so a bad migration is recoverable without waiting for the nightly dump.

**Off-site** (recommended, currently opt-in): set `RCLONE_REMOTE` +
`RCLONE_CONFIG_*` in Coolify → the backup sidecar also syncs dumps to
Backblaze B2 / S3. Without this, all three layers die if the VPS is lost —
this is gap **G5** in `docs/PRODUCTION-READINESS.md` and the one pre-launch
action that requires an operator, not a code change.

## Restore procedure (DB)

```bash
ssh nirman-vps
# 1. Find the dump
ls -t /var/lib/docker/volumes/*pgbackups*/_data/ | head    # nightly dumps
ls -t /var/lib/docker/volumes/*pgbackups*/_data/pre-deploy-*.sql.gz | head  # snapshots

# 2. Stop the app so it doesn't write into a half-restored DB
docker stop web

# 3. Drop + recreate the public schema
docker exec -i <db-container> psql -U nirman -d nirman_inventory \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

# 4. Restore
gunzip -c /path/to/dump.sql.gz | docker exec -i <db-container> \
  psql -U nirman -d nirman_inventory

# 5. Bring the app back; it self-migrates on boot
docker start web
curl -sf https://nirman.life/api/health
```

## Restore procedure (uploads)

Uploads (`/app/storage/uploads`) live on the `uploads` Docker volume, dumped
nightly alongside the DB. To restore: untar the matching `uploads-*.tar.gz`
into the volume. **Restored-uploads ≠ live-DB consistency note**: files
referenced by `Upload` rows created _after_ the dump was taken will 404 —
that window is bounded by RPO.

## Full-VPS loss (worst case)

1. Provision a fresh VPS, install Coolify, point DNS (`nirman.life`).
2. `git clone` + redeploy the Compose stack (the repo is the source of
   truth for infra).
3. Restore DB from the **off-site** dump (rclone remote) — _this is why G5
   matters_: without off-site sync, a dead VPS means the DB and all three
   on-box backup layers are gone together.
4. Restore uploads the same way.
5. Re-issue `/api/cron/*` secrets + env vars from `.env.prod-secrets`.

## Quarterly restore drill (30 min, proves backups real)

- [ ] Copy the newest nightly dump to a scratch dir.
- [ ] Restore into a **throwaway** Postgres (`docker run postgres:16` + temp
      DB — never into production).
- [ ] `pnpm db:studio` or a `psql -c 'select count(*) from "User"'` sanity
      query — non-zero, plausible counts.
- [ ] Spot-check one `JournalEntry` Dr = Cr row and one `StockMovement`.
- [ ] Untar one uploads archive, confirm file count > 0 and a PDF opens.
- [ ] Record the drill date + result in `docs/AUDIT_LEDGER.md`.

**Rule**: if the drill fails, the backup is broken — fix it that day. An
untested restore path is the same as no backup.

## What to never do

- `db push --accept-data-loss` in production — can drop columns/tables.
- `prisma migrate reset` on production.
- Restore into a live DB without stopping `web` first.
- Treat `BackupRecord` exports as the only backup — they're inside the DB
  they protect.
