# Load model (Breakscale)

Discrete-event simulation of the production topology via
[Breakscale](https://github.com/xevrion/breakscale) (cloned to
`../breakscale`, MIT). Every number below was measured by the engine —
30 simulated seconds, seed varies per run.

## Topology modelled

`clients → coolify-proxy (Traefik) → Next.js (concur ~50, ~120ms svc) →
Postgres (16 conn pool, ~8ms svc)` + a `cron` sidecar hitting the DB every
15 min. No cache, no queue — matches the real VPS.

## Measured results

| Scenario                         | Served | Failed | p99   | Bottleneck                   |
| -------------------------------- | ------ | ------ | ----- | ---------------------------- |
| 120 rps baseline                 | 120/s  | 0%     | 350ms | app 31% busy                 |
| 350 rps baseline                 | 320/s  | 0%     | 469ms | app 81% busy                 |
| 600 rps baseline                 | 399/s  | 37.5%  | 545ms | **app queue shed** (64 deep) |
| 1000 rps baseline                | 419/s  | 55.8%  | 508ms | app queue shed               |
| 350 rps + slow queries (db 40ms) | 341/s  | ~0%    | 430ms | **DB 96% busy**              |
| 200 rps + cron burst             | 217/s  | 0%     | 334ms | negligible                   |
| 600 rps + 2× app capacity        | 574/s  | ~0%    | 393ms | works                        |
| 600 rps + pages 2× faster        | 570/s  | 0%     | 221ms | works                        |

## What it says about this system

- The wall is the **app tier** (~420 rps at 120ms service), not Postgres
  (24% busy at the wall). Scaling = more app capacity or faster pages, in
  that order — bigger Postgres does nothing yet.
- Failure mode is **queue-shed**, not timeouts: past ~400 rps requests get
  refused, they don't hang. p99 stays ~500ms — the app degrades hard but
  predictably.
- The real-world risk is **compound load**: peak users + heavy report/GL
  queries pushing db serviceMs up → DB hits ~96% at just 350 rps. Bounded
  list caps and the 30s request budget are what keep that from cascading;
  a report export endpoint is the thing to watch.
- Cron sweeps are noise at this scale — they don't need a queue yet.

Run it: `npx tsx tools/loadmodel/run.ts` and `tools/loadmodel/whatif.ts`.
