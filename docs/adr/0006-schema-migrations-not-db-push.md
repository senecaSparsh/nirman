# ADR-0006: Schema changes ship migrations; `db push` banned in prod

**Status**: Accepted
**Date**: 2026 (codified 2026-10-07)
**Deciders**: repo maintainers

## Context

Prisma offers two ways to change the DB: `migrate` (versioned, ordered,
atomic SQL files) and `db push` (diff-and-apply, `--accept-data-loss` can
drop columns/tables). Early in the project a schema change was pushed
without a migration file; the resulting drift made a deploy unbootable.

## Options considered

1. **`db push` for speed** — no migration files to manage, but can't
   express data migrations (backfills, required-column-on-populated-table),
   and `--accept-data-loss` is destructive. ❌ for prod.
2. **`migrate` only, enforced** — every `schema.prisma` change must be
   accompanied by a `migrations/` dir. ✅

## Decision

`pnpm --filter @nirman/db migrate:dev --name <desc>` for every schema
change; commit the migration with the schema. Production uses
`migrate deploy` (safe, ordered, atomic) via `directUrl`. Two guards
enforce: the CI "migration coverage" job fails if committed migrations
don't produce the current schema, and `migrate-deploy.mjs` aborts the
deploy with a loud banner on residual drift. `migrate:check` (also CI)
scans for destructive statements requiring `-- nirman:accept-risk`.

## Consequences

- **+** Deploys are deterministic — the schema is a function of ordered,
  committed SQL, not a live diff.
- **+** Data migrations (nullable-add → backfill → SET NOT NULL) are
  expressible and reviewable.
- **+** Drift can't silently accumulate.
- **−** One more step per schema change — deliberately the point.
- **Revisit never** — this is the load-bearing correctness rule.
