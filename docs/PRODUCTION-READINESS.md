# Production Readiness Review — Nirman Inventory OS

> The big-company "interview": every question a Google launch review, Amazon
> PRR, or senior system-design interviewer would ask about this system —
> answered with evidence. If an answer cites a file, the control exists and is
> enforced. If it says **gap**, the fix is tracked at the bottom.
>
> **Status**: reviewed 2026-10-07. **Verdict**: production-ready for the
> current scale (single-tenant ERP, ~50 users, single VPS), with named risks
> for the 10x path — each risk has an owner-able follow-up, not a shrug.

## How to use this document

- **Before a deploy**: re-check the sections marked 🔴 _pre-launch gate_.
- **When something breaks**: `docs/RUNBOOK.md` is the operational answer;
  this doc is the _design_ answer.
- **When answering "is this enterprise-grade?"**: walk the table of contents.

---

## 1. Architecture & request flow

**Q: What does the system look like?**

Single Next.js 16 app (`apps/web`) serving a desktop surface (`/`) and a
mobile surface (`/m`) on the same route tree and DB. Business logic in
`packages/services`, Prisma + Postgres 16 in `packages/db`. Production is a
single Docker Compose stack on a Coolify VPS: `web` + `db` (postgres:16) +
`scheduler` (cron sidecar) + `backup` (pg_dump sidecar). Traefik/Coolify
proxy terminates TLS.

Evidence: `docker-compose.prod.yml`, `Dockerfile`, `DEPLOY.md`,
`docs/ARCHITECTURE.md`, `AGENTS.md`.

**Q: What's the data model?**

174 Prisma models across 9 domains (inventory, procurement, land, sales,
HR, finance/GL, tasks, integrations, platform). Money is `Decimal(14,2)`,
quantities `Decimal(14,3)` — never JS floats. Master entities soft-delete
(`deletedAt`); transactional records are immutable.

Evidence: `packages/db/prisma/schema.prisma`, `AGENTS.md` conventions.

**Q: Multi-tenancy?**

Company-scoped: every tenant model carries `companyId`; queries are
fail-closed via `scopeWhere` and enforced by `scope-registry.test.ts` in CI.
Cross-company stock transfer (STO) is explicit, priced, and audited.

Evidence: `packages/services/src/rbac.ts`, `scope-registry.test.ts`,
`AGENTS.md` authority model.

## 2. Scalability 🔴 _pre-launch gate: capacity headroom confirmed_

**Q: What happens at 10x load?**

Current sizing is a single container; the auto-memory wrapper tunes heap,
Prisma pool, rate-limit buckets and concurrency from detected RAM — so
scaling vertically is a Coolify slider, not a code change. The designed-in
10x path and its breaking points are documented in `docs/CAPACITY.md`.

Evidence: `scripts/auto-memory.mjs`, `packages/db/src/index.ts`,
`src/lib/rate-limit.ts`, `docs/PERFORMANCE.md`.

**Q: Are there N+1 / unbounded queries?**

Convention enforced + reviewed: aggregations run in the DB
(`groupBy`/`_sum`/raw `SUM`), never JS reduce over history; every list
endpoint is bounded (`take:` + cursor or a hard cap); badge counts use
`?countOnly=1`. Hot GETs opt into an in-memory response cache
(`apiHandler(fn, { cache })` + `invalidateCache`).

Evidence: `src/lib/cursor-pagination.ts`, `src/lib/nav-badges.ts`,
`api/reports/*` (raw SQL), `AGENTS.md` "Aggregation belongs in the DB".

**Q: Caching strategy?**

Three layers: Next.js route/PPR caching (cache components), in-memory
response cache for polled GETs, SWR on the client (`useFetch`, offline-pause
aware). Invalidation is explicit via `invalidateCache(tag)` on mutations.

## 3. Reliability & failure modes 🔴 _pre-launch gate_

**Q: What happens when the process crashes / hangs / leaks?**

- Crash → start wrapper restarts (max 5/10min, backoff).
- Zombie (up but not serving) → wrapper polls `/api/health` every 30s,
  restarts on 3 consecutive failures.
- Memory leak → wrapper sums process-group RSS from `/proc`, restarts at
  85% of heap limit before the OOM killer does.
- Deploy SIGTERM → 30s drain, zero dropped requests.

Evidence: `apps/web/scripts/start-with-recovery.mjs`,
`docker-compose.prod.yml` healthcheck.

**Q: What happens when the DB is down / pool exhausted / a query hangs?**

`apiHandler` maps `P1001` → 503, `P2024` (pool exhausted) → 503, `P1002`
(timeout) → 504 so the platform can retry instead of surfacing a 500.
Health check has a 3s DB timeout. Prisma warns at boot if `connection_limit`
is missing. `withTimeout()` wraps slow external calls (Twilio sync 30s,
backup 120s).

Evidence: `src/lib/server.ts` (apiHandler), `src/lib/timeout.ts`,
`api/health/route.ts`.

**Q: Idempotency / double-submit?**

Money-moving and stock-moving mutations run in **Serializable transactions**
that write the domain record + the immutable `StockMovement`/`JournalEntry`
in the same commit. Over-delivery, duplicate issue execution, and
double-stock-deduction at gate-pass exit are all guarded (verified in the
Oct 6 audit, F8).

**Q: Consistency model?**

Strong, single-primary Postgres. Stock = `StockLocationItem.qty` updated
atomically with its `StockMovement` append — the ledger can never diverge
from the balance. GL entries post inside the same transaction as the source
mutation.

## 4. Observability 🔴 _pre-launch gate_

**Q: How do you know it's broken before users tell you?**

- **External**: GitHub Actions `uptime-check.yml` pings `/api/health` every
  15 min and emails watchers on 3 consecutive failures.
- **Internal**: wrapper health-checks every 30s; `/api/health` returns
  liveness / readiness / deep modes.
- **Errors**: Sentry (server+client+edge, `/monitoring` tunnel, session
  replay, `onRequestError`) _plus_ an in-app `ErrorLog` triage system —
  fingerprint dedupe, occurrence counts, auto-reopen on regression, DEVELOPER
  notification on new signatures, console at `/dev/errors` + `/m/dev/errors`.
- **Business**: `AuditLog` captures every successful mutation automatically;
  `/finance/audit` + mobile settings feed render it.

**Q: Can you trace a request?**

Sentry tracing is on (10% prod / 100% dev sampling). Server errors carry
the `apiHandler` route context. Audit rows carry actor + `onBehalfOfId`
for delegated actions.

**Q: What's missing?** Named risk — metrics are point-in-time (ErrorLog,
Sentry, uptime boolean), not time-series. No Prometheus/Grafana. At current
scale Sentry + ErrorLog + uptime checks suffice; the 10x path adds a metrics
pipeline. See `docs/CAPACITY.md` §4.

## 5. Security 🔴 _pre-launch gate_

**Q: AuthN / AuthZ?**

Better-Auth email+password, Prisma adapter, session cookies. Middleware
gates all non-public routes; API routes return 401 JSON (middleware never
redirects APIs). RBAC: 14 roles, 60+ permission keys, 5-tier delegation,
scope (company/department/project), effective-permission union resolved
server-side. Every route calls `requirePermission`/`requireUser` —
`apiHandler` authenticates but does not authorize by design.

**Q: Can an employee record leak sensitive fields?**

Deny-by-default serialization: `pickEmployeeRoster`/`redactEmployeeRow`
allowlist; new schema columns are invisible until added. Enforced by
`employee-serialization.test.ts`. The H1 wall hides top-tier dossiers even
from delegated owners.

**Q: Injection / XSS / CSRF / clickjacking?**

- Injection: Prisma parameterizes; the few `$queryRaw` reports use bound
  parameters.
- XSS: React escaping + CSP (`default-src 'self'`, no `object-src`,
  `frame-ancestors 'self'`).
- CSRF: cookie `SameSite` (Better-Auth default) + mutations are
  JSON APIs with auth checks.
- Headers: HSTS, X-Frame-Options, nosniff, Referrer-Policy,
  Permissions-Policy, COOP — all set in `next.config.ts`.
- Rate limiting: auth endpoints 10 attempts/IP/min in middleware;
  apiHandler presets (read/write/auth/webhook/heavy).
- Employee PII + bearer-token fields never serialized raw (above).

**Q: Secrets management?**

`.env` / `.env.prod-secrets` gitignored; prod secrets live in Coolify env.
`env-validation.ts` fails fast on missing required vars and _refuses to boot_
if `AUTH_BYPASS=true` in production. `INTEGRATION_ENCRYPTION_KEY` encrypts
stored integration credentials (AES-256).

**Q: What's missing?** Named risk — no automated dependency-vuln gate in CI
(Snyk/Dependabot not wired; `pnpm audit` is manual). Rotation procedure for
secrets is documented in `docs/RUNBOOK.md` §secrets-rotation. See gaps list.

## 6. Data protection & recovery 🔴 _pre-launch gate_

**Q: Backups? Restore? RPO/RTO?**

- **Nightly pg_dump + uploads tarball** to `pgbackups` volume, 14-day
  retention (backup sidecar). Optional rclone off-site sync (B2/S3) — off
  by default, one env toggle.
- **Pre-migration snapshot**: entrypoint `pg_dump`s to
  `/backups/pre-deploy-*.sql.gz` (keep 30) _before_ `migrate deploy`.
- **Logical export**: `/api/cron/backup` writes `BackupRecord` rows
  (30-day retention) — survives corruption that kills dumps.

Full restore procedure + quarterly restore-drill checklist:
`docs/DISASTER-RECOVERY.md`. RPO 24h, RTO ~1h — both stated, not implied.

**Q: Is the schema change-safe?**

Every schema change ships a migration (CI "migration coverage" job +
deploy-time drift abort). `migrate:check` scans for destructive SQL —
requires `-- nirman:accept-risk` opt-in. `db push --accept-data-loss`
banned in prod.

## 7. Deploy & release process 🔴 _pre-launch gate_

**Q: What does a release look like?**

CI gate (typecheck + lint + 3000+ unit tests + production webpack build +
migration coverage) → merge to main → `./scripts/deploy-prod.sh` (Coolify
API, waits for health) → entrypoint: pre-deploy snapshot →
`migrate deploy` → seeds chart-of-accounts → start wrapper. Rollback =
Coolify redeploy previous image + restore pre-deploy snapshot (RUNBOOK §4).

**Q: Build vs dev parity?**

Build = webpack (Turbopack prod bug documented), dev = Turbopack + webpack
auto-fallback. Git hooks: lint-staged pre-commit, typecheck pre-push.

**Q: What's missing?** Named risk — no canary/staged rollout (single-node
Compose). Blue/green is a documented 10x-path item; at 50-user ERP scale,
pre-migration snapshots + health-gated restarts are the compensating
controls.

## 8. Operations & management plane

**Q: Who notices what, and when?**

- Uptime → GitHub Actions email (15 min).
- New error signature → in-app notify DEVELOPER users.
- Stalled approvals → daily `approval-aging` cron digests execs + delegates.
- Authority drift → daily `integrity` cron (hats vs tiers, orphan links).
- Reconciliation drift → daily `reconciliation` cron.

**Q: Cron coverage?**

`/api/cron/{reminders,backup,daily-digest,approval-aging,integrity,
reconciliation,tally-sync,hsn-seed}` all wired in `scheduler.sh` — the doc
warns that a new cron route without a scheduler line silently never runs.

**Q: Runbooks?**

`docs/RUNBOOK.md` — symptom → diagnose → fix tables for every failure seen
in production so far (sidecar crash-loop, proxy network, OOM, pool
exhaustion, deploy rollback), plus a postmortem template.

## 9. Testing

**Q: What's the test story?**

3,100+ unit tests (services 1557 + web 1581 per last audit) covering pure
money math (MAC, GST, payroll), serialization, scope registry, route
manifest guards, role matrices, tenant isolation; integration tests hit a
real `nirman_inventory_test` DB with a `resetDb()` target guard (only that
DB, only NODE_ENV=test). Playwright e2e suite (`e2e`, `e2e:smoke`,
`e2e:flows`) plus 300+ manual QA screenshots in `TESTING_FINDINGS.md`.

**Q: What's missing?** Named risk — e2e runs are manual, not CI-gated
(Playwright suite exists but isn't in `ci.yml`). No load test (k6 plan
drafted in `docs/PERFORMANCE.md` Phase 4). Both tracked as gaps.

## 10. Dependencies & third parties

Full inventory with failure-mode-per-dependency: `docs/DEPENDENCIES.md`.
Summary: all integrations are **pluggable provider stubs** (Tally, WhatsApp,
email, portals, HSN/GST, OCR, Twilio) — a dead provider degrades one feature,
never the core ledger. Postgres is the only hard dependency.

## 11. Documentation & knowledge

| Doc                                            | Answers                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| `AGENTS.md`                                    | How to work on this repo (1177 lines of conventions)  |
| `DECISIONS.md`                                 | What to build next + why + authority model invariants |
| `docs/ARCHITECTURE.md`                         | System design                                         |
| `DEPLOY.md` + `docs/COOLIFY_DEPLOY.md`         | Deploy/ops                                            |
| `docs/RUNBOOK.md`                              | Incident response                                     |
| `docs/SLO.md`                                  | Reliability targets + error budget                    |
| `docs/DISASTER-RECOVERY.md`                    | Backup/restore/DR                                     |
| `docs/CAPACITY.md`                             | Scaling model                                         |
| `docs/DEPENDENCIES.md`                         | Third-party map                                       |
| `docs/adr/`                                    | Why each irreversible choice was made                 |
| `SECURITY.md`                                  | Vuln reporting + controls                             |
| `CONTRIBUTING.md`                              | Workflow + review bar                                 |
| `TESTING_FINDINGS.md` + `docs/AUDIT_LEDGER.md` | What's verified                                       |

Single-owner bus factor is the honest answer here — these docs exist
precisely so the system is explainable without the author.

## 12. Gaps ledger (named risks, each with an owner-able fix)

| #   | Gap                        | Severity | Mitigation / fix                                           |
| --- | -------------------------- | -------- | ---------------------------------------------------------- |
| G1  | No dependency-vuln CI gate | Medium   | Add `pnpm audit --prod` step or Dependabot config          |
| G2  | Playwright e2e not in CI   | Medium   | Add `e2e:smoke` job (staging env required)                 |
| G3  | No metrics time-series     | Low      | Sentry+ErrorLog suffice at scale; Prometheus at 10x        |
| G4  | No canary deploys          | Low      | Single-node; health-gated rolling restart compensates      |
| G5  | Off-site backups opt-in    | **High** | Set `RCLONE_REMOTE` + B2 creds in Coolify — one toggle     |
| G6  | No load test               | Low      | k6 plan ready in `docs/PERFORMANCE.md` Phase 4             |
| G7  | Node version unpinned      | Low      | `.nvmrc` + `engines` added (was 22-Docker vs 23-dev drift) |

**Pre-launch gates** (the 🔴 sections): all answered; G5 is the only gate
that requires an operator action outside the repo.
