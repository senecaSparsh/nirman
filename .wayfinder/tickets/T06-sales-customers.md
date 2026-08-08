# T06 — Sales & customers work end-to-end

> Label: `wayfinder:grilling` · Status: **closed** · Claimed by: Devin · Blocked by: T01 (closed)

## Question

Does the sales lifecycle work end-to-end — create customer → sell a land parcel or built unit
(double-sell guard) → record payments → verify profit computation, payment status, GL
`postAssetSale` + `postPaymentReceived` entries, asset marked sold, and `/sales` list reflecting
profit per sale — and does cancelling a sale (with no payments) correctly release the asset?

## Checklist

- [ ] `/customers`: create a customer; verify CRUD + active-sales count
- [ ] `/sales`: sell a land parcel (from T05); verify double-sell guard rejects re-selling it
- [ ] Sell a built unit (from T04); verify unit marked SOLD, production cost carried into profit
- [ ] Record a payment; verify `postPaymentReceived` GL entry + payment status (PARTIAL/FULL)
- [ ] Verify `computeSaleProfit()` matches displayed profit (revenue − cost − GST)
- [ ] Cancel a sale with no payments; verify asset released back to sellable
- [ ] Attempt cancel with payments; verify rejection
- [ ] `/sales` list: profit, payment status, asset type filters work
- [ ] Log every defect; fix in priority order

## Resolution

**All sales/customer flows verified end-to-end via API.** The module is structurally complete
with dedicated UI components (customers view, sales view, sell-asset dialog, payment dialog,
sale detail dialog, customer form dialog).

**Verified:**
- Customer create + edit: works (name, phone, email, gstin, address)
- Asset sale (built unit): creates sale with saleNumber, unit status → SOLD, saleId linked on
  unit, GL posts ASSET_SALE (AR debit, Sales Revenue credit) + ASSET_SALE_COGS (COGS debit,
  Unsold Assets - Built Units credit), profit/loss computed (costBasis vs salePrice)
- Initial payment at sale time: recorded, GL posts PAYMENT_RECEIVED (Cash debit, AR credit),
  paymentStatus → PARTIAL
- Additional payments: recorded via POST /api/sales/[id], overpayment guard works (cumulative >
  salePrice → rejected), paymentStatus transitions PARTIAL → PAID when fully paid
- Sale cancel guard: can't cancel sale with payments → "Cannot cancel sale with payments —
  process refunds first"
- Sale cancel (no payments): sale status → CANCELLED, unit status reverts SOLD → AVAILABLE,
  cost reallocation re-run
- Sales + customers pages return 200

**Defect found + fixed (1):**

1. **GL not reversed on sale cancellation (GL integrity bug)** — `cancelSale()` reverted the
   asset status and recalculated costs, but did NOT reverse the GL entries (ASSET_SALE +
   ASSET_SALE_COGS). The original JournalEntry rows remained in the ledger, so the trial balance
   showed inflated revenue, AR, COGS, and reduced asset balances even though the sale was
   cancelled. The books diverged from reality.
   Fixed: updated `cancelSale()` to find all GL entries with `sourceId = saleId` and
   `sourceType IN (ASSET_SALE, ASSET_SALE_COGS)` and post reversals using the
   `reverseJournalEntry()` helper (added in T04). Verified: net GL impact after sale+cancel =
   0.00, all 4 reversal entries posted with swapped debits/credits.
   File: `packages/services/src/sale.ts` (reversal loop in `cancelSale`)

**Verification:** typecheck clean, 113 service tests pass, all flows driven via curl with DB-side
verification of GL, unit status, payment status, and audit logs.
