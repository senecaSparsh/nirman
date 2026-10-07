# Service Level Objectives & Error Budget — Nirman Inventory OS

> These are _proposed_ SLOs (carried over from `docs/PERFORMANCE.md`) with a
> measurement plan. The point isn't the numbers — it's that reliability is
> a budget, not a feeling. When the budget is spent, feature work pauses for
> reliability work.

## What we're promising

Internal tool, ~50 users, single VPS. The honest SLO for this shape:

| SLI                                    | Target                  | Why this number                                                                             |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| Availability (`/api/health` readiness) | **99.5% monthly**       | ~3.6h/mo budget — covers deploys + restarts; a single-node app can't honestly promise 99.9% |
| List/detail page server TTFB           | p95 < **2.5s**          | `PERFORMANCE.md` budget; field users on 4G                                                  |
| List API (50-row page)                 | p95 < **300ms**         | Server-time budget                                                                          |
| Bulk write (attendance, reallocate)    | p95 < **2s / 200 rows** | Batch-op budget                                                                             |
| GL/quarterly report                    | p95 < **8s**            | Heavy-report budget                                                                         |
| Error rate (5xx share of API requests) | < **0.1%** monthly      | Sentry + ErrorLog                                                                           |
| Backup success                         | **100%** daily          | RPO depends on it                                                                           |

## How each is measured

| SLI            | Source of truth                                                           | Today     |
| -------------- | ------------------------------------------------------------------------- | --------- |
| Availability   | GitHub `uptime-check.yml` (15-min pings) + wrapper `/api/health` polls    | ✅ active |
| Latency        | Sentry tracing (10% prod sampling), route-handler timings                 | ✅ active |
| Error rate     | Sentry issues + `ErrorLog` signatures                                     | ✅ active |
| Backup success | `BackupRecord` rows + `pgbackups` volume freshness + `docker logs backup` | ✅ active |

## Error budget policy (Google SRE pattern, adapted)

**Budget**: 0.5% of requests may fail, and 3.6h of downtime per month.

- **Within budget** → ship features normally.
- **Budget burned in a month** → freeze non-urgent releases; the only merges
  are P0/security/reliability fixes until we're back inside SLO.
- **Single incident burns >50% of monthly budget** → mandatory postmortem +
  reliability sprint before the next feature deploy.

## What _isn't_ a violation

- Scheduled deploys that pass health checks (rolling restart drains 30s).
- Load-test traffic and QA probing (out of scope for the SLI).
- Upstream provider failures that degrade one feature without a 5xx
  (Tally sync, WhatsApp send, portal push) — these are logged but don't
  count against availability.

## Alerting thresholds

| Signal                                                 | Alert                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `/api/health` fails 3×                                 | GitHub uptime-check fails → email watchers                                                                    |
| New `ErrorLog` signature                               | In-app notify all DEVELOPER users                                                                             |
| Reopened signature                                     | `reopenedCount++` — regression alarm                                                                          |
| Approvals waiting > `Company.approvalAgingHours` (48h) | Daily digest to execs + delegates                                                                             |
| Backup missing > 24h                                   | (check `BackupRecord` freshness — manual today; auto-alert is gap G5→covered by rclone toggle + uptime scope) |

## Tuning the SLOs

Review quarterly or after any S1/S2. Loosen if the budget is never touched
(too conservative — we're over-investing in reliability); tighten if users
complain inside "green" SLOs (the SLO is measuring the wrong thing).
