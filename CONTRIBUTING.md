# Contributing — Nirman Inventory OS

Read `AGENTS.md` first — it's the single source of conventions (1177 lines,
maintained). This file is the _process_ layer: how work flows from idea to
production without confusion or regressions.

## The golden rules (non-negotiable, enforced)

1. **Check the schema before building.** `packages/db/prisma/schema.prisma`
   has ~95% of what looks like a "gap" already modeled. `DECISIONS.md` is
   the ranked backlog — route through it, don't parallel-invent.
2. **Every schema change ships a migration.** `pnpm --filter @nirman/db
migrate:dev --name <desc>` — commit the `migrations/` dir together with
   `schema.prisma`. CI fails on drift. Destructive SQL needs a
   `-- nirman:accept-risk <reason>` comment.
3. **Every `/m/*` route needs a `route-manifest.ts` entry** — CI fails on
   drift (`route-manifest.test.ts`).
4. **Every API route calls `requirePermission()`/`requireUser()`** —
   `apiHandler` authenticates, never authorizes.
5. **Money = `Decimal`**, never JS `number`. Stock moves only via
   `recordMovement()`/`recordTransfer()` in serializable txns.
6. **Aggregations run in the DB** (`groupBy`/`_sum`/raw SQL), lists are
   bounded (cursor or cap), employees serialize through
   `employee-visibility.ts`.
7. **A new `/api/cron/*` route is dead unless wired into
   `apps/web/scripts/scheduler.sh`** — the Coolify sidecar is the only cron.

## Workflow

```
branch → implement → pnpm typecheck && pnpm lint && pnpm test
       → commit (husky: lint-staged runs) → push (husky: typecheck runs)
       → PR → CI (typecheck + lint + unit tests + webpack build +
                  migration coverage + audit-count drift)
       → review → merge → ./scripts/deploy-prod.sh
```

## Pull request checklist (the reviewer will check these)

- [ ] Linked to a `DECISIONS.md` backlog item or a `TESTING_FINDINGS.md` bug
- [ ] Schema change? → migration committed, `migrate:check` passes
- [ ] New `/m/*` route? → `RouteEntry` added, `perm` set to the `.view` key
- [ ] New permission? → added to `PERM.*`, role matrix, and nav `roles`
- [ ] New cron route? → `scheduler.sh` line added
- [ ] New env var? → `.env.example` + `env-validation.ts` updated
- [ ] Mutations audit-logged (auto via `apiHandler`, or `opts.audit` for
      richer entries)
- [ ] Employee data serialized through `employee-visibility.ts`
- [ ] Lists bounded; aggregations in DB; no `findMany().reduce()` on history
- [ ] Buttons horizontal (`flex gap-2`, `flex-1`) per design rules
- [ ] Status colours from `StatusPill`/`STATUS_MEANING` — never a local map
- [ ] Tests: pure helpers unit-tested; tenant isolation + serialization
      covered if touching those axes

## Commit style

Conventional commits, matching history: `feat(m): …`, `fix(api): …`,
`fix(m): …`, `revert(m): …`. Message focuses on _why_. One logical change
per commit — the audit ledger shows this repo values small, revertable
commits over big-bang ones.

## Where things live (30-second map)

| What               | Where                                               |
| ------------------ | --------------------------------------------------- |
| UI + API routes    | `apps/web/src/app`, `apps/web/src/components`       |
| Business logic     | `packages/services/src`                             |
| Schema + client    | `packages/db`                                       |
| Permissions/roles  | `apps/web/src/lib/roles.ts`, `packages/rbac`        |
| Mobile nav truth   | `apps/web/src/lib/route-manifest.ts`                |
| Desktop nav truth  | `apps/web/src/lib/nav.ts`                           |
| Infra/deploy       | `Dockerfile`, `docker-compose.prod.yml`, `scripts/` |
| What to build next | `DECISIONS.md`                                      |
| What's verified    | `TESTING_FINDINGS.md`, `docs/AUDIT_LEDGER.md`       |
| Incidents          | `docs/RUNBOOK.md`                                   |

## Asking for review

Tag the PR with the module it touches (Build / HR / Finance / Today /
Settings). If it touches money math, stock ledger, GL posting, permissions,
or serialization — say so in the PR body; those get the careful read.
