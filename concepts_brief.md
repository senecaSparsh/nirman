# Concepts Brief — Business-Logic Risk Hunt (EGM Brainstorm)

**Status:** Goldfish review complete — fixes in progress (3 of 8 steps landed)
**Method:** Elephant-Goldfish Model (google/elephant-goldfish-model). The Elephant
(read the full Gopalpur 3 transcript, audited every owner ask against code)
drafted the hypothesis; six zero-context Goldfish reviewers — Contrarian/YAGNI,
Cost/Scale, UX, Migration, SRE, Structural — stress-tested it in parallel.
Three reviewers converged independently on the same top finding.

## Verdict on the hypothesis

Half right. The "second-order decay" frame was wrong for 4 of 6 items — the
codebase has an extensive aging apparatus (18 sweeps every 15 min, daily digests,
approval backlog, stock/land aging reports). But the hunt surfaced something
sharper: **first-order wiring gaps in owner-requested features** — fields that
are stored, displayed, and printed in contracts but never read by the engine
that bills money. Those are worse than second-order risks: reachable on first
use, externally visible, and contradicted by the printed agreement itself.

## Ranked findings ledger

### BLOCKERS

**B1. `rentFreeDays` is write-only — tenants get billed AND WhatsApp-dunned during
the contractual fit-out period.** [3 lenses: Contrarian, Migration, Structural]
Schema comment promises "rent billing begins after rentFreeDays"; the printed
tenancy draft says rent starts `startDate + rentFreeDays`; but all three
schedule generators (`tenancy.ts:455,1073,1146`) mint dues from `max(startDate,
now)` — the field has zero service reads. A 30-day fit-out produces an instantly
OVERDUE rent row, and `sendRentDueReminders` WhatsApps the tenant during a
period the printed contract says is free. `updateTenancy` accepts and silently
drops the field (`:244` declared, never mapped). `changeTenant` resets it to 0.
_Fix:_ offset `schedBase` by `rentFreeDays` in the three mint sites; wire it
through `updateTenancy`/`changeTenant`; data surgery — delete unpaid fit-out
`RentalPayment` rows, audit+void RECEIVED ones (reversal JEs, not UPDATEs).

**B2. Two fulfilment pipelines mint double POs for one requisition.** [Structural]
`approveRequisition` auto-creates a `QuotationRequest`, but `VendorQuote`s under
it get `requisitionId: null` (`quotation.ts:468`) — invisible to the comparative
gate. `approveQuotation` auto-creates a PO but never marks the requisition
CONVERTED → `convertRequisitionToPo` mints a **second PO for the same demand**.
The min-quotes gate counts 0 for QR-path quotes; `convertRequisitionToPo` never
checks the PO supplier matches the winning quote; PO cancel never releases
`convertedPoId`; `DirectPurchase` is a third path that also never closes the
indent. _Fix:_ propagate `requisitionId` onto QR-path quotes; mark requisition
CONVERTED in `approveQuotation`'s tx; validate supplier = winning quote;
release on PO cancel; invariant `POs-per-requisition ≤ 1`.

**B3. Cron rent-escalation mutates `monthlyRent` with no audit trail and can
double-fire.** [SRE #1]
`logAction` is `if (input.userId)`-gated; the cron passes none — escalation is
untraceable after notification retention (90d). `nextEscalationDate <= now` is
checked outside the tx; a serialization-retry re-applies the raise. Next date
re-anchors to `Date.now()` (execution jitter compounds forever) instead of
`lastEscalatedAt`/`startDate`. _Fix:_ claim inside tx (`updateMany` with date
predicate), always `logAction` (system actor + `companyId`), anchor to
`COALESCE(lastEscalatedAt, startDate)`.

**B4. Rejected indent — "Fix & resubmit" instructs an action that does not
exist.** [UX Blocker]
flow-map tells the creator to "correct the quantities and resubmit" — but no
indent edit path exists anywhere (PATCH is lifecycle-only), delete requires
`PROCUREMENT_MANAGE`, and Resubmit sends the identical indent back unchanged.
`rejectReason` is optional, so a rejection can render bare "Rejected" with no
clue what to fix. _Fix:_ add edit (DRAFT/REJECTED) or "Duplicate as new
indent"; require `rejectReason` (DPR already does); fix the copy.

### MAJORS

**M1. Tenancy billing cluster.** [SRE #2, Structural, Migration #3]

- `RentalPayment` PENDING→OVERDUE **never transitions** — the dunning cron
  filters `status:"OVERDUE"` and is effectively dead for rent that ages after
  minting.
- Escalation doesn't re-price already-minted PENDING rows → silent
  under-billing; tenant reminder quotes a bare amount nobody can explain.
- Same-day double-settle guard ORs `paymentDate` → can't settle two months in
  one visit (409).
- `Tenancy` has no EXPIRED writer — the docstring promises "auto on end", a
  dead `changeTenant` branch already expects it; ended tenancies hold assets
  `RENTED` forever. Needs grace-period sweep + explicit asset-release
  semantics + deposit decision.
- Schedule-mint block copy-pasted 3×; `RentalPayment` lacks
  `@@unique([tenancyId, periodStart])` → concurrent mints can duplicate.

**M2. WhatsApp dunning is dead on arrival in production.** [Cost #4 + SRE #4]
`sendMessage` uses free-form `type:"text"` — Meta rejects business-initiated
texts outside the 24h window. Result: FAILED rows, retried every 15 min
forever (cooldown key is `sentAt`, null on failure). Meanwhile the PENDING
notification flush never claims rows → overlapping flushes double-send.
_Fix:_ approved utility templates; FAILED backoff (`retryAfter`); claim rows
`PENDING→SENDING` before send; pass logId through instead of writing a second
log row per flush.

**M3. Whole-sweep cron failure is invisible.** [SRE #3]
Every sweep in `/api/cron/reminders` ends `.catch(() => ({checked:0}))` — a
dead DB looks identical to an idle run. No `CronRun` record exists; even
`checkBooksHealth` can fail silently. _Fix:_ CronRun table or at minimum
per-sweep `console.error` + `failed:true` flag.

**M4. `checkBooksHealth` inside the 15-min reminders sweep.** [Cost #1]
~20 heavy queries (full-table scans, per-project loops) × 96 runs/day ×
companies — the largest recurring DB cost, duplicated by the nightly
`/api/cron/reconciliation`. Only cron route with no `withTimeout`. _Fix:_
remove from the 15-min sweep (nightly covers it).

**M5. Books-health invariants don't cover the second-order money paths.** [SRE #5]
Escalation drift, STO transfer-price correctness (qty reconciles, price
doesn't), SMS `MATCHED` rows pointing at voided payments, UNMATCHED aging,
notification FAILED/PENDING backlog — all unchecked. Small additions to
`runInvariantChecks`.

**M6. Inter-company STO is a one-way door.** [Structural]
No COMPLETED→REVERSED path: wrong STO = permanent wrong MAC + permanent
journals in both companies. Destination company never notified of incoming
stock. Markup blended anonymously into MAC — unrecoverable for future
elimination. _Fix:_ REVERSED transition (counter-movements + `reverseJournalEntry`
both companies); notify `toLocation.companyId`; persist markup component.

**M7. `nextEscalationDate` backfill is a prerequisite, not optional.** [Migration #1]
Stored computed value (not derived); seed already ships 365-day rows while the
service writes 360-day rows — mixed era today. `updateTenancy` can change
`startDate`/`escalationPercent` without recomputing it → escalation set on an
existing tenancy **never fires** (`nextEscalationDate` stays null). Backfill
SQL in the migration finding; must run before/with the anchor fix.

**M8. Wrong-actor copy is a pattern, not one bug.** [UX cross-cutting]
Three surfaces tell the reader to perform verbs belonging to another role:
"reject it to make changes" (engineer can't reject), "correct it with an
adjustment" (payroll action), "fix the quantities" (no edit exists). Rewrite
copy to name who acts + the reachable path.

**M9. Dual document stores split the truth.** [Structural]
Gates read bespoke columns only (`registryDocumentUrl` etc.) — a doc uploaded
via generic Attach does not satisfy the gate. Tenancy page mounts
`AttachmentList` without `extraDocuments` so the rent agreement never shows in
"Documents". _Fix:_ pass `extraDocuments` everywhere a column doc exists; later
converge on one write path.

**M10. Migration-side constraints for the fix wave.** [Migration]

- `REGISTRY_PENDING` has no stage-entry timestamp — needs `registryPendingAt`
  - AuditLog backfill; `markRegistryDone` accepts `registryDate` and drops it.
- `RequisitionStatus` has no owner exit (no withdraw/expire; requester can't
  even reject) — EXPIRED enum ADD is irreversible; grandfather decision needed;
  orphan `QuotationRequest`s on expiry.
- STO movements are append-only — pricing changes need era markers, never
  back-edits; `repair-books-dev.sh` formulas must become era-aware first.
- `Company.code` set after documents exist splits the sequence series.
- Books-lock read predicate re-implemented ≥5 places — expose via one API.

### NITS / REJECTED (documented YAGNI — do not build)

- **Registry-aging escalation channel** — money already collected; registry lags
  for reasons outside the builder's control; max one count line in daily-digest.
- **Inter-company consolidation elimination** — per-entity books are already
  correct for statutory filing; group consolidation is the CA's audit-time job.
- **Unit-number collision risk** — impossible: `@@unique([projectId,unitNumber])`
  - service pre-check + in-batch dedupe.
- **Auto-expire indents** — correctly absent; cement doesn't go stale like milk.
  The real gap is owner-side withdraw/edit (B4).
- **5-day escalation drift alone** — folds into B3/M7; worthless as a solo fix.
- Delegation liveness defined twice (`server.ts` vs `push.ts`); rejected-count
  missing from indent stats strip; STO labels say "MAC"/"Unit cost" to store
  keepers; auto-QR creation skips silently; `PENDING` written into payment mode.

## Recommended execution order

1. ~~**B1** (rentFreeDays)~~ — **DONE** `7276d224`. Billing anchored to
   `startDate + rentFreeDays` in all three mint sites; wired through
   `updateTenancy`/`changeTenant`; regression tests against a real DB.
2. ~~**B3 + M7** (escalation audit/claim/anchor + backfill)~~ — **DONE**
   `cf052351`. Atomic `updateMany` claim inside the tx, calendar-month
   anniversary anchor (`addMonthsUTC`), unconditional `logAction` with a
   system actor, `updateTenancy` recomputes `nextEscalationDate`. Backfill
   ran: **18 tenancies had escalation configured but `nextEscalationDate`
   NULL — they would have never escalated.**
3. ~~**M1 cluster**~~ — **DONE** `ec256b41`. PENDING→OVERDUE sweep added and
   ordered before the dunning sweep in both cron routes; minted PENDING rows
   re-priced on escalation; same-day settle guard uses `paymentDate` only as
   last-resort identity (two months settle in one visit now works).
4. ~~**B2** (double-PO)~~ — **DONE** `581f0634`. One-fulfilment-per-indent
   enforced across all three exits: QR-path quotes carry `requisitionId`,
   `approveQuotation` claims the indent + writes `convertedPoId`, manual
   conversion refuses fulfilled indents + validates the winning supplier,
   direct purchase claims/releases, PO cancel releases links. Real-DB
   invariant tests cover all four races.
5. ~~**B4 + M8**~~ — **DONE** `cc54cebf`. `updateRequisition` edits
   DRAFT/REJECTED indents (bounces to DRAFT, clears rejection stamp, fresh
   stock/rate snapshots, project/phase locked); reject requires a reason at
   service + all UIs; edit wired through API `action:edit`, desktop
   row/dialog Edit, mobile `?edit=` mode, flow-map REJECTED → edit form.
6. **M2** (WhatsApp templates + claim rows) — claim-before-send landed in
   `c37403a7`; **FAILED backoff landed in `cd0d6cfd`** (SENT cools 72h,
   queued/failed backs off 24h for both rent + sale reminders — no more
   15-min hot loop on a dead number). Remaining: approved Meta utility
   templates (ops task — needs template names registered in the company's
   WhatsApp Business account, then `type:"template"` sends).
7. ~~**M3, M4, M5**~~ — **DONE** `cd0d6cfd`. Every reminders-sweep failure
   logs + flags by name (`ok:false` + `failedSweeps` on the response);
   `checkBooksHealth` removed from the 15-min sweep (nightly reconciliation
   covers it); 4 new invariant checks (escalation-schedule drift, STO
   transfer price, SMS→voided-payment, notification backlog). A real
   `CronRun` table is still deferred — the named-failure surfacing is the
   minimum that makes partial failure visible.
8. **M6, M9, M10 items** — as the affected areas get touched. **NEXT**

Each fix PR opens with `SELECT COUNT(*)` audits of pre-fix rows (Migration
lens: rows created now are tomorrow's legacy debt) and updates
`verify-workflows-full.sh` expectations in the same change.
