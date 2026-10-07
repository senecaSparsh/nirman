# Architecture Decision Records

An ADR captures **one irreversible or expensive-to-reverse decision** — the
context, the options considered, the choice, and the consequences. ADRs are
immutable once accepted; a changed decision gets a _new_ ADR that supersedes
the old one (which keeps its file + a `Superseded by ADR-NNNN` note).

This answers the big-company question _"why is it built this way?"_ without
archaeology through git history.

## Index

| ADR                                           | Decision                                          | Status   |
| --------------------------------------------- | ------------------------------------------------- | -------- |
| [0001](0001-webpack-production-builds.md)     | Webpack for prod builds, Turbopack for dev        | Accepted |
| [0002](0002-single-node-coolify-vps.md)       | Single-node Coolify VPS, not k8s/PaaS             | Accepted |
| [0003](0003-pluggable-provider-stubs.md)      | All external integrations are pluggable stubs     | Accepted |
| [0004](0004-immutable-stock-ledger-gl.md)     | Immutable StockMovement + co-committed GL journal | Accepted |
| [0005](0005-deny-by-default-serialization.md) | Deny-by-default field serialization for PII       | Accepted |
| [0006](0006-schema-migrations-not-db-push.md) | Migrations required; `db push` banned in prod     | Accepted |
| [0007](0007-route-manifest-single-truth.md)   | `route-manifest.ts` as single mobile-nav truth    | Accepted |

## When to write one

- Adding a new top-level dependency or replacing one
- Changing a data-modeling invariant (money, ledger, soft-delete)
- Changing deploy topology, auth model, or multi-tenancy scoping
- Any decision where _"why?"_ can't be answered from the diff alone

## Format

```markdown
# ADR-NNNN: <Title>

**Status**: Accepted | Superseded by ADR-XXXX
**Date**: YYYY-MM-DD
**Deciders**: <names>

## Context

<the forces at play — why a decision was needed>

## Options considered

1. <option> — <pros> / <cons>

## Decision

<what we chose>

## Consequences

- <positive>
- <negative — the honest cost>
- <what would make us revisit>
```
