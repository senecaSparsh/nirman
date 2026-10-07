# System Design Deep-Dive — the hard questions

> `docs/PRODUCTION-READINESS.md` answers the _launch-review_ questions.
> This answers the **senior/staff interview questions** — the ones where a
> weak answer is "it just works" and a strong answer is a mechanism with
> evidence. Each answer names the code.

## Concurrency & correctness

### Q: Two users approve the same PO at the same time. What happens?

The second one fails. Approval runs inside a `Serializable` transaction —
the two transactions can't both observe `status=DRAFT` and both write
`APPROVED`. Postgres aborts one with a serialization failure, the retry
helper re-runs it, it now sees `APPROVED`, and the state transition throws
"already approved". There's also a self-approval guard (creator ≠ approver)
enforced at the service layer, not just the UI.

Evidence: `packages/services/src/procurement.ts` (approvePurchaseOrder),
`packages/services/src/transaction.ts` (`isRetryableTransactionError` →
"could not serialize" retry), `AGENTS.md` PO workflow invariant.

### Q: Two receipts land for the last 10 units of stock — do you oversell?

No. `recordMovement()` appends the `StockMovement` and updates
`StockLocationItem.qty`+MAC atomically in one serializable txn — a negative
stock or over-delivery attempt aborts and retries-then-fails cleanly.
Verified live (Oct 6 audit): partial + balance receipt, MAC updated,
no double deduction.

### Q: Same form submitted twice (double-click / retry / back button)?

- **API level**: mutations are state transitions, not blind inserts — a
  second `action: "approve"` on an approved record is a 4xx, not a
  duplicate.
- **Sequence level**: `nextSequenceNumber()` does an atomic
  upsert+update on `NumberSequence` _inside the same txn_ — a retry gets a
  different number only if it genuinely creates a different record; a
  rolled-back txn returns its number to the pool (no gaps).
- **Client level**: buttons disable while submitting; `TaskError`/domain
  errors carry status codes so a 409 surfaces as a message, not a crash.

### Q: Crash mid-transaction — half-written data?

Impossible by construction. Domain record + `StockMovement` +
`JournalEntry` commit in _one_ transaction. A crash is an abort — nothing
partial persists. There is no "update stock now, post GL later" window.

### Q: Read-after-write for a user who just mutated?

Server Components re-render on `router.refresh()` after the mutation's
fetch resolves — the write is committed before the read that shows it.
SWR revalidates; the in-memory response cache is invalidated by tag on the
mutation (`invalidateCache`).

### Q: Concurrent edits to the same record (last-write-wins)?

Optimistic locking — rows carry a `version`; `extractVersion()` pulls it
from the request body, a mismatch throws `ConcurrentEditError` (→409)
instead of silently clobbering. Applied on the entities where two humans
realistically edit concurrently.

Evidence: `packages/services/src/optimistic-locking.ts` + `.test.ts`.

## Consistency & data integrity

### Q: How do stock numbers and the books never disagree?

`postJournalEntry` writes the balanced `JournalEntry`+`JournalLine` inside
the same transaction as the business mutation. Trial balance was verified
Dr=Cr on real flows (Oct 6 audit: receipts, issues, sales all posted
balanced journals).

### Q: Money precision?

`Decimal(14,2)` for money, `(14,3)` for quantities — Prisma `Decimal` end
to end, serialized with `toNum()` only at the server→client boundary.
Never JS floats for money; unit tests cover the arithmetic.

### Q: Timezones / month boundaries?

Payroll + attendance use `@db.Date` with UTC constructors — the Oct 6 F2
fix moved month-boundary math to UTC after finding a `TZ=Asia/Kolkata`
drift; regression tests cover Kolkata, Los_Angeles, UTC, weekends, leap
February.

### Q: Soft delete vs audit?

Master entities soft-delete (`deletedAt`, filtered by default, guarded by
`softDelete()` which blocks deleting entities with stock/open orders).
Transactional records are immutable — history is never rewritten.

## Scale & performance

### Q: A report over 5 years of history — does it OOM?

No — aggregations run in Postgres (`groupBy`/`_sum`/raw `SUM`), never
`findMany` + JS reduce. List endpoints are bounded (cursor pagination or
hard cap). The auto-memory profile gives headroom, but the convention is
what actually protects it.

### Q: What's your caching invalidation story?

Tagged in-memory cache on hot GETs (`apiHandler { cache: { tag, ttlMs } }`)

- `invalidateCache(tag)` on mutations; Next.js route cache; SWR client
  side. The Oct-6 "stale requisition IDs" finding was cache semantics, not a
  bug — documented expectation.

### Q: N+1 in the critical path?

`include`/`select` are explicit in the service queries; badge counts are
`?countOnly=1` → `.count()` not a hydrated list. (Evidence: `nav-badges.ts`.)

## Failure & edge cases

### Q: What if an external call hangs forever?

`withTimeout()` — Twilio sync 30s, backup 120s. Webhook handlers catch and
return 200/fallback so providers don't retry-storm.

### Q: Duplicate notifications / messages?

Dedupe inside notification handlers; `approval-aging` digest dedupes 24h;
`NotificationLog` carries status so a resend is a deliberate action.

### Q: Offline field workers?

Offline mutation queue (`@/lib/offline/queue`) + SWR pause when offline;
queued mutations replay on reconnect. The receipt/issue path works without
signal and syncs later.

### Q: Delegation while someone's away — authority loops?

Delegation is one level, same-company, cycle-checked, max 90 days,
expires by date. Delegates inherit permission union + acting role, but
their _scope_ stays their own — a delegate can't see the delegator's
broader scope or re-delegate. `getReportingChain` has a cycle check.

## "Design X" answers (when they ask you to design it)

| They ask                         | Our answer lives in                                                            |
| -------------------------------- | ------------------------------------------------------------------------------ |
| "Design a stock ledger"          | ADR-0004 — immutable movement + atomic balance + co-committed GL               |
| "Design approvals"               | 2-tier DPR, value-routed PO, self-approval guard, delegation, aging escalation |
| "Design multi-tenancy"           | `companyId` + fail-closed `scopeWhere` + `UserScope` + CI-enforced registry    |
| "Design idempotent mutations"    | State-machine transitions + serializable txns + atomic sequences               |
| "Design notifications"           | Template → `NotificationLog` → pluggable channel providers                     |
| "Design PII protection"          | ADR-0005 — deny-by-default serialization allowlist                             |
| "Design audit"                   | Auto `AuditLog` on every mutation + semantic `logAction` in txns               |
| "Design cron without a platform" | `scheduler.sh` sidecar calling internal endpoints — the gotcha is documented   |

## Questions we _can't_ fully answer today (honest ledger)

- **"Prove 10x"** — capacity model is documented (`docs/CAPACITY.md`), the
  k6 load test is planned, not run. Stated, not hand-waved.
- **"Multi-region failover"** — out of scope for a single-VPS internal ERP;
  the DR story is documented, not multi-region HA.
- **"Exactly-once delivery to external APIs"** — we do at-least-once +
  status tracking (a sync-log row can be retried); true exactly-once needs
  provider-side idempotency keys.
