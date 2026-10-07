# Third-Party Dependencies — Nirman Inventory OS

> Every external service the app can call, what happens when it's down, and
> whether a failure degrades a feature or the core. **Core rule**: all
> integrations are pluggable providers — a dead provider degrades one
> feature, never the ledger.

## Hard dependency (app doesn't run without it)

| Dependency                               | Failure mode                                                                                               | Blast radius                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **PostgreSQL 16** (in-compose container) | `apiHandler` maps `P1001`→503, `P2024`→503, `P1002`→504; `/api/health` readiness 503s; wrapper may restart | **Whole app** — this is the one hard dependency |
| **Node runtime** (container)             | Wrapper restarts on crash/zombie/OOM                                                                       | Whole app                                       |

## Pluggable providers (feature degrades, core unaffected)

| Service                                            | Used for                                               | Failure mode                                                                     | Provider stub?                              |
| -------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------- |
| **Tally ERP**                                      | GL voucher sync (`/api/tally/sync`, `cron/tally-sync`) | `TallySyncLog` rows stay PENDING/FAILED; books in-app stay correct               | ✅ stub logs XML; real POSTs to Tally :9000 |
| **WhatsApp Business API**                          | Notifications, payment confirmations, reminders        | `NotificationLog` FAILED; user gets in-app/email instead                         | ✅ `WhatsAppProvider` stub                  |
| **SMTP / Email**                                   | Same notification channel                              | Same — multi-channel means email can cover WhatsApp failure                      | ✅ `EmailProvider` stub                     |
| **99acres / MagicBricks / Housing.com**            | Portal listing sync                                    | `PortalListing` SYNC_FAILED; units still sellable in-app                         | ✅ `PortalProvider` stub                    |
| **HSN/GST portal (FastGST/CBIC)**                  | HSN auto-fetch on material forms                       | Falls back to 81-code seeded master + manual entry                               | ✅ pluggable, seeded fallback               |
| **OCR (OpenAI Vision / Google Vision / Azure DI)** | Photo→DPR material lines                               | Photo-DPR button fails; manual entry unaffected                                  | ✅ provider + stub                          |
| **Twilio**                                         | Call tracking (`/api/telephony/*`)                     | Webhook returns fallback TwiML / 200; call metadata recoverable via `sync-calls` | ✅                                          |
| **Sentry**                                         | Error/perf monitoring                                  | No-op when `SENTRY_DSN` unset — zero overhead, zero crash                        | ✅ fully optional                           |

## Platform dependencies (ops, not app)

| Service                          | Role                                  | Failure mode                                                   |
| -------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| **Coolify**                      | Orchestration + TLS proxy + dashboard | App keeps running; deploys + proxy management unavailable      |
| **VPS (VirtFusion/HeavenCloud)** | Host                                  | Whole app down — see `docs/DISASTER-RECOVERY.md` full-VPS loss |
| **Docker**                       | Runtime                               | Same as VPS                                                    |
| **GitHub Actions**               | CI, uptime pings                      | Code ships still; monitoring email silent                      |
| **Backblaze B2 / S3** (rclone)   | Off-site backup sync                  | Optional; on-box `pgbackups` unaffected                        |
| **APNs**                         | Native push (Capacitor shell)         | Push tokens stop delivering; in-app notifs still land          |

## Version pins worth noting

- **Postgres 16-alpine**, **Node 22** (Dockerfile `node:22-bookworm-slim`,
  `.nvmrc` + `engines` pin dev to match), **pnpm 11.18.0**
  (`packageManager` + Docker), **alpine 3.20** sidecars.
- `pnpm` lockfile committed; CI builds from lockfile — supply-chain surface
  is the pinned graph, not floating `latest`.

## The "one provider down" test

For every integration: (1) does the request time out (`withTimeout`)?
(2) does the failure get logged (`NotificationLog`/`TallySyncLog`/
`PortalListing` status)? (3) does the user see a degraded state, not a
crash? All three are wired for every provider above — this is why the
architecture insists on stubs.
