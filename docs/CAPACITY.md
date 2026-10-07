# Capacity Model & Scaling Path — Nirman Inventory OS

> How the system is sized today, what breaks first at 10x, and the ordered
> list of what to build when it does. Tied to `docs/PERFORMANCE.md`
> (implementation) and `docs/SLO.md` (targets).

## 1. Current size

- **Shape**: single Next.js container + Postgres container on one VPS.
- **Users**: ~50 concurrent (internal ERP). Single-digit companies.
- **Data**: 174 models; hot tables = `StockMovement`, `AuditLog`,
  `JournalLine`, `WorkerAttendance`, `NotificationLog`.
- **Sizing control**: `auto-memory.mjs` detects available RAM at startup
  and tunes heap, Prisma pool, rate-limit buckets, and max concurrency —
  so "add RAM" is the only scaling knob needed today.

| Container RAM | Heap   | Prisma conns | Read rate | Concurrency | Restart@ |
| ------------- | ------ | ------------ | --------- | ----------- | -------- |
| 512MB         | 400MB  | 4            | 1x        | 12          | 80%      |
| 1GB           | 800MB  | 8            | 2x        | 25          | 82%      |
| 2GB           | 1600MB | 16           | 4x        | 50          | 85%      |
| 4GB           | 3200MB | 20           | 4x        | 100         | 88%      |
| 8GB+          | 6400MB | 20           | 4x        | 200         | 90%      |

`/api/health` reports the detected RAM + applied profile for debugging.

## 2. What breaks first (ordered by likelihood)

1. **Single DB connection pool** — at ~100 concurrent mutating users the
   `connection_limit=20` pool queues. _Symptom_: `P2024` 503s in Sentry.
   _Fix_: bump the limit, then add PgBouncer.
2. **Serial requests on one Node process** — CPU-bound reports (GL,
   EVM, GSTR) serialize behind interactive traffic. _Symptom_: p95 list
   latency climbs while reports run. _Fix_: read-replica for reports, or
   a second `web` container behind the proxy.
3. **`pgbackups` / `uploads` disk growth** — 14-day dumps + uploads on a
   120GB disk. _Symptom_: disk-full → Postgres stops. _Fix_: rclone
   off-site + retention trim (RUNBOOK §disk-full).
4. **Rate limiter memory** — in-memory token buckets are per-process;
   fine at 1 replica, wrong at N replicas (each replica gets its own
   bucket). _Fix_: Redis-backed limiter when horizontal scaling starts.

## 3. The 10x path (in order — don't do step 4 before step 1)

| Step                | Trigger                   | Change                                                                                                                                               |
| ------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Vertical         | p95 creeping / `P2024`    | Raise container RAM — auto-tuning handles the rest                                                                                                   |
| 2. Pooler           | pool still exhausted      | PgBouncer sidecar; `DIRECT_URL` already exists for migrations                                                                                        |
| 3. Read replica     | reports contending        | Route report reads to a replica; writes stay primary                                                                                                 |
| 4. 2nd web replica  | CPU saturation            | Traefik round-robins — app is already stateless except **in-memory caches + rate limiter + offline SWR**, which must move to Redis before >1 replica |
| 5. Object storage   | uploads volume huge       | Move `storage/uploads` to S3/B2 (also fixes full-VPS-loss uploads gap)                                                                               |
| 6. Metrics pipeline | "how do we know" at scale | Prometheus + Grafana; Sentry stays for errors                                                                                                        |

**The honest answer at 10x**: the app is _stateless_ except for three
in-process things — the response cache, the rate limiter, and any SWR
local state — all documented. Horizontal scaling is one Redis away.

## 4. Known non-scaling pieces (accepted, documented)

- **Single-node VPS** — no multi-AZ. Compensating: health-gated restarts,
  pre-migration snapshots, nightly dumps + opt-in off-site. Acceptable at
  50 users; revisit at 500.
- **Cron = in-compose sidecar** — one scheduler, no leader election. At
  > 1 `web` replica it stays correct because it calls endpoints over the
  > internal network (the endpoint is idempotent), not a local loop.
- **Sequential migrations** — `migrate deploy` runs on container start;
  a very large migration would delay readiness. Mitigation: keep
  migrations additive (enforced by `migrate:check`); big backfills run as
  separate marked migrations.

## 5. Load test (the missing measurement)

Plan drafted in `docs/PERFORMANCE.md` Phase 4: k6 against a staging clone,
targets in `docs/SLO.md`. Until run, the budgets are _design targets_, not
_measured facts_ — gap **G6** in `docs/PRODUCTION-READINESS.md`.
