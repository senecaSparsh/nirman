# ADR-0004: Immutable StockMovement + co-committed GL journal

**Status**: Accepted
**Date**: 2026 (codified 2026-10-07)
**Deciders**: repo maintainers

## Context

Inventory and accounting both need to answer "what happened" forever, not
just "what is the balance". The question was how to keep stock quantities,
cost (MAC), and the general ledger provably consistent.

## Options considered

1. **Mutable "current stock" column** — fast reads, but no audit trail,
   and a crash between the stock write and the journal write leaves them
   diverged. ❌
2. **Event log + derived balance** — append-only `StockMovement`, compute
   balance on read. Perfect audit, but reads get expensive. ❌
3. **Immutable movement + cached balance in one serializable txn** —
   append a `StockMovement` AND update `StockLocationItem.qty`/MAC inside
   the same Serializable transaction; post the `JournalEntry` in that same
   commit. ✅

## Decision

Never mutate stock by updating a column directly — always
`recordMovement()`/`recordTransfer()`, which append the immutable movement
and atomically update the location item. GL entries (`postJournalEntry` and
domain helpers) post inside the same transaction as the source mutation, so
books can never diverge from reality. MAC is updated on receipt and carried
on issue/transfer; `computeMovingAverageCost` is a pure, unit-tested
function.

## Consequences

- **+** Full audit: `StockMovement` is the complete history; the balance is
  a cache that can't drift because they're committed together.
- **+** GL always balances (Dr=Cr enforced by construction) — the Oct 6
  audit verified a real balanced trial balance end-to-end.
- **+** Serializable isolation catches concurrent double-issue/over-
  delivery races.
- **−** Writes are heavier (transaction + multiple rows); the serializable
  retry surface must be handled by callers.
- **Revisit if** movement volume makes single-row updates a hotspot —
  unlikely at construction-ERP write rates.
