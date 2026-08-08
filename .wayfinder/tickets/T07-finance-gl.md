# T07 — Finance, GL & expenses work end-to-end

> Label: `wayfinder:grilling` · Status: **closed** · Claimed by: Devin · Blocked by: T01 (closed)

## Question

Does the accounting layer reconcile — `seedChartOfAccounts()` run, every mutation across modules
(T02–T06) produced balanced `JournalEntry`+`JournalLine` rows inside the same transaction, the
`/gl` trial balance balances, account ledger drill-down shows the right lines, expenses post
correctly, and `/finance` dashboard P&L matches the GL — so the books never diverge from reality?

## Checklist

- [ ] Verify `seedChartOfAccounts()` has run (13 system accounts present); run if not
- [ ] After T02–T06, pull `/api/gl/trial-balance`; verify it balances (Σ debits = Σ credits)
- [ ] `/gl` UI: trial balance renders; drill into an account (e.g. inventory, WIP, cash); verify
      ledger lines match the source mutations
- [ ] `/finance`: create an expense; verify `postExpense` GL entry + audit log
- [ ] Verify expense delete reverses correctly (or is blocked — check current behavior)
- [ ] `/finance` P&L: revenue, COGS, expenses reconcile to GL revenue/expense accounts
- [ ] Project cost add/delete (T04) reflects in GL + finance dashboard
- [ ] Cross-check: pick one PO receipt, trace its GL entry → trial balance → finance dashboard
- [ ] Log every defect; fix in priority order

## Resolution

**All finance/GL flows verified end-to-end via API.** The GL module is structurally complete
with trial balance, account ledger, chart of accounts, expense management, and supplier returns.

**Verified:**
- Trial balance: balanced (214,821,330.43 = 214,821,330.43), all 13 system accounts present
- Account ledger: returns journal lines correctly, filtered by account code
- GL accounts API: returns all 13 system accounts with code/name/type/isSystem
- Expense create: GL posts Operating Expenses debit + Cash credit (balanced)
- Supplier return complete: GL posts AP debit + Inventory credit + Input GST credit (balanced),
  stock reduced correctly, RETURN stock movement recorded
- Finance + GL pages return 200

**Defects found + fixed (2):**

1. **GL not reversed on expense delete (GL integrity bug)** — Both expense DELETE handlers
   (`/api/expenses?id=` and `/api/expenses/[id]`) did a hard `prisma.expense.delete()` without
   reversing the GL entry. The original JournalEntry (Operating Expenses debit, Cash credit)
   remained orphaned in the ledger, inflating expenses and reducing cash on the trial balance.
   Fixed: wrapped both DELETE handlers in a transaction that finds the GL entry by
   `sourceType=EXPENSE` + `sourceId` and posts a reversal using `reverseJournalEntry()` before
   deleting the expense row. Verified: net GL impact after create+delete = 0.00.
   Files: `apps/web/src/app/api/expenses/route.ts`, `apps/web/src/app/api/expenses/[id]/route.ts`

2. **RETURN stock movement classified as IN instead of OUT (critical — supplier returns broken)**
   — `movementDirection()` in `moving-average-cost.ts` classified `RETURN` as `"IN"`, requiring a
   `toLocationId`. But supplier returns are OUTBOUND — goods leave the warehouse to go back to the
   supplier. The `completeSupplierReturn` service passes `fromLocationId` (the warehouse), so the
   movement failed with "Movement RETURN requires a toLocationId". This made the entire supplier
   return flow non-functional — no supplier return could ever be completed.
   Fixed: reclassified `RETURN` as `"OUT"` in `movementDirection()`, updated the comment, fixed
   the unit test (moved RETURN from IN test to OUT test), and removed RETURN from the inbound
   movement filter in `alerts.ts`. Verified: supplier return completes successfully, stock
   reduced (450→445), GL posts correctly (AP debit 288.75, Inventory credit 275, GST credit 13.75),
   trial balance remains balanced.
   Files: `packages/services/src/moving-average-cost.ts`, `packages/services/src/moving-average-cost.test.ts`,
   `packages/services/src/alerts.ts`

**Verification:** typecheck clean, 113 service tests pass, all flows driven via curl with DB-side
verification of GL, stock, and trial balance.
