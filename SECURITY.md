# Security Policy

## Reporting a vulnerability

This is a private, single-deployment ERP (internal tool, not a public SaaS).
If you find a vulnerability — in this repo, in `https://nirman.life`, or in
the mobile shell — report it **privately**:

- **Email** the maintainer directly (see repo owner / `AGENTS.md` production
  access section for current contacts). Do **not** open a public GitHub
  issue for a security report.
- Include: affected route/component, reproduction steps, impact
  (read/write scope, which company data is exposed), and any request
  payloads or screenshots.
- Expect acknowledgement within 48 hours. Critical fixes (auth bypass,
  cross-company data leak, RCE) are deployed out-of-band; lower-severity
  fixes ride the next normal deploy.

## Scope — what we consider security-sensitive

- Cross-company data access (any query that misses the `companyId` scope)
- Permission/scope/delegation bypasses (`requirePermission`, `scopeWhere`,
  `UserScope`, delegation union)
- Employee PII exposure (bank details, PAN/Aadhaar/PF/ESI/UAN, wages) —
  governed by `lib/employee-visibility.ts` deny-by-default allowlist
- AuthN/session issues (Better-Auth), `AUTH_BYPASS` in production
- Secrets in logs, responses, or client bundles
- Public-signing bearer tokens (`contractToken`, `offerToken`)
- File-upload traversal / cross-company upload access (`/api/uploads/[id]`)
- SSRF via integration providers, XML/Tally payload injection

## Controls in place (for reviewers)

| Layer        | Control                                                                                                                       | Where                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| AuthN        | Better-Auth, session cookies, middleware gate on all non-public routes                                                        | `apps/web/src/lib/auth.ts`, `middleware.ts`         |
| AuthZ        | 14 roles, 60+ perms, `requirePermission` per route; scope resolved via `UserScope`; delegation union via `getUserPermissions` | `src/lib/roles.ts`, `packages/services/src/rbac.ts` |
| Tenancy      | Fail-closed `scopeWhere`; CI test enforces every `companyId` model is registered                                              | `scope-registry.test.ts`                            |
| PII          | `pickEmployeeRoster`/`redactEmployeeRow` allowlist; enforced by test                                                          | `employee-serialization.test.ts`                    |
| Headers      | CSP, HSTS, X-Frame-Options=SAMEORIGIN, nosniff, Referrer-Policy, Permissions-Policy, COOP                                     | `next.config.ts`                                    |
| Rate limit   | Token bucket, per-user + per-IP buckets; auth endpoints 10/min in middleware                                                  | `src/lib/rate-limit.ts`, `middleware.ts`            |
| Audit        | Auto `AuditLog` on every successful mutation; `logAction()` in service txns                                                   | `src/lib/server.ts`                                 |
| Secrets      | Env-only, gitignored; `env-validation.ts` fails fast; `AUTH_BYPASS` refused in prod                                           | `src/lib/env-validation.ts`                         |
| Integrations | Credentials AES-256 encrypted at rest                                                                                         | `INTEGRATION_ENCRYPTION_KEY`                        |
| Transport    | TLS at Coolify proxy; HSTS preload                                                                                            | `next.config.ts`                                    |
| Injection    | Prisma parameterized queries; raw SQL uses bound params                                                                       | `api/reports/*`                                     |
| Anti-index   | `X-Robots-Tag: noindex` + `robots.ts` — internal ERP stays out of search                                                      | `next.config.ts`, `app/robots.ts`                   |

## Hardening rules (do not regress)

- `AUTH_BYPASS=true` must never be reachable in production — startup aborts.
- Never `json()` a raw `Employee` row — serialize through
  `employee-visibility.ts`.
- Never render a control the user can't use — gate UI with
  `hasPermission()` server-side and pass `permissions` down.
- Delegation must not leak cross-company: `company/switch`,
  `GET /api/companies` superuser branch, and `/api/uploads/[id]` keep the
  real role deliberately.
- Cron routes require `x-cron-secret`; webhook routes are per-provider
  verified. Both are in `AUTO_AUDIT_SKIP_PREFIXES`-aware paths.

## Dependency & supply-chain posture

- `pnpm` lockfile committed; CI builds from the lockfile.
- Prefer dependency versions published ≥7 days ago; avoid `latest`/`*`.
- Known follow-up (tracked in `docs/PRODUCTION-READINESS.md` gap ledger):
  wire `pnpm audit`/Dependabot into CI.
