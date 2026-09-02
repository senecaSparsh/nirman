# Use-Case Audit — §5 Books World / WF-12 / WF-13
**Audited:** `USE_CASES_AND_WORKFLOWS.md` §5 (Books World — Finance & Accounts) and Appendix A WF-12 (Expense Claim) / WF-13 (Tally Sync)  
**Scope:** `packages/db/prisma/schema.prisma`, `packages/services/src/*`, `apps/web/src/app/api/*`, `apps/web/src/app/*`, `apps/web/src/lib/nav.ts`  
**Date:** this session  
**Method:** manual read → verify → re-read for each concrete claim

---

## Legend
- **CONFIRMED** — identifier exists and behaves as stated
- **DISCREPANCY (CRITICAL / MAJOR / MINOR)** — concrete, falsifiable mismatch
- **AMBIGUOUS** — claim cannot be verified because it is vague or not wired to a concrete artifact

---

## 5.1 Chart of Accounts & General Ledger

| # | Claim | Status | Evidence |
|---|-------|--------|----------|
| 1 | `GlAccount` exists and is the chart of accounts | **CONFIRMED** | `packages/db/prisma/schema.prisma` l.3837-3849 (`model GlAccount`) |
| 2 | 26 system accounts are seeded with `ACCT` codes covering stock/WIP/land/AP/AR/GST/TDS/cash etc. | **DISCREPANCY MAJOR** | `packages/services/src/gl-posting.ts` l.37-105. `CHART_OF_ACCOUNTS` has **32** entries (l.37-70); `ACCT` constant has **31** keys (l.73-105). Document says 26. |
| 3 | `postJournalEntry()` posts balanced `JournalLine`s inside a transaction | **CONFIRMED** | `packages/services/src/gl-posting.ts` l.145-199; validates `Σ debit = Σ credit` (l.160-164) and rejects zero-movement entries (l.166-168) |
| 4 | Trial balance API is `/api/gl/trial-balance` | **CONFIRMED** | `apps/web/src/app/api/gl/trial-balance/route.ts` l.1-28; `trialBalance()` from `@nirman/services` |
| 5 | Account ledger API is `/api/gl/ledger` | **CONFIRMED** | `apps/web/src/app/api/gl/ledger/route.ts` l.1-51 |
| 6 | GL accounts API is `/api/gl/accounts` | **CONFIRMED** | `apps/web/src/app/api/gl/accounts/route.ts` l.1-41 |
| 7 | Tally sync uses `generateTallyVoucherXml()` and `syncBatchToTally()`; `TallySyncLog` tracks PENDING/SYNCED/FAILED | **PARTIALLY CONFIRMED / DISCREPANCY** | `packages/services/src/tally.ts` `generateTallyVoucherXml` l.250-313; `syncBatchToTally` l.424-460; `TallySyncLog` schema l.3907-3930. However `TallySyncStatus` enum also includes `IMPORTED` and `VARIANCE` (l.3931-3937), not mentioned in the doc. |

---

## 5.2 GST & Tax

| # | Claim | Status | Evidence |
|---|-------|--------|----------|
| 8 | `HsnGstRate` master exists | **CONFIRMED** | `packages/db/prisma/schema.prisma` l.2836-2848 |
| 9 | 81 curated construction-industry HSN/SAC codes seeded from CBIC or FastGST API | **DISCREPANCY MINOR** | `packages/services/src/hsn-gst.ts` `CONSTRUCTION_HSN_MASTER` has **96** entries (grep count `{ hsnCode:` = 96). Both CBIC seed and FastGST API client exist (`packages/services/src/hsn-sac.ts` l.85-127), but the count is wrong. |
| 10 | Input GST (ITC) is debited on purchases / GRNs | **CONFIRMED** | `packages/services/src/gl-posting.ts` l.309 (`ACCT.INPUT_GST` debit on PO receipt), l.1250 (direct purchase), l.911 (expense) |
| 11 | Output GST is credited on sales / material sales | **CONFIRMED** | `packages/services/src/gl-posting.ts` l.534 (asset sale), l.715 (material sale) |
| 12 | GST reports API at `/api/gst-reports` | **CONFIRMED** | `apps/web/src/app/api/gst-reports/route.ts` l.1-60 (`generateGstr1` / `generateGstr3b` from `@nirman/services`) |
| 13 | Real-estate GST formulas (affordable / non-affordable / commercial) | **CONFIRMED** | `packages/services/src/crm.ts` l.24-28, l.688-692; UI `apps/web/src/components/sales/sell-asset-dialog.tsx` l.600 uses manual `gstRate` input |

---

## 5.3 Expenses, Petty Cash, Budgets

| # | Claim | Status | Evidence |
|---|-------|--------|----------|
| 14 | `Expense` model has category, GST, payment mode, approval workflow | **CONFIRMED** | `packages/db/prisma/schema.prisma` l.3583-3644 (`categoryId`, `cgst`, `sgst`, `igst`, `paymentMode`, `chequePhotoUrl`, `status`) |
| 15 | `ExpenseClaim` + `ExpenseClaimLine` exist and have an approval/payment lifecycle | **CONFIRMED** | `packages/db/prisma/schema.prisma` l.3650-3695 |
| 16 | `ExpenseClaim` supports GST %, GST amount, net amount on lines, and receipt upload | **DISCREPANCY CRITICAL** | `ExpenseClaimLine` schema has only `amount`, `date`, `receiptUrl`, `notes` (l.3681-3695). The UI line form in `apps/web/src/components/expenses/claim-detail-dialog.tsx` l.63-69 only captures `categoryId`, `category`, `amount`, `date`, `notes` and does **not** post `receiptUrl` even though the API accepts it. There are no GST fields on claim lines. |
| 17 | `PettyCashFloat` with top-ups and balance tracking | **CONFIRMED** | `packages/db/prisma/schema.prisma` l.3701-3736; API `apps/web/src/app/api/petty-cash/route.ts` l.1-65 |
| 18 | `RecurringExpense` auto-generates draft `Expense` rows | **CONFIRMED** | `packages/db/prisma/schema.prisma` l.3740-3770; API `apps/web/src/app/api/recurring-expenses/route.ts` l.1-80 |
| 19 | `ExpenseBudget` vs actuals / variance tracking | **CONFIRMED** | `packages/db/prisma/schema.prisma` l.3774-3794; API `apps/web/src/app/api/expense-budgets/route.ts` l.1-80; `getExpenseBudgetVariance` |
| 20 | `ProjectCost` for direct project costs | **CONFIRMED** | `packages/db/prisma/schema.prisma` l.3497-3527 |

---

## 5.4 Supplier Payments & Invoicing

| # | Claim | Status | Evidence |
|---|-------|--------|----------|
| 21 | Supplier invoice from GRN at `/api/supplier-invoices/from-grn` | **CONFIRMED** | `apps/web/src/app/api/supplier-invoices/from-grn/route.ts` l.1-80 |
| 22 | `SupplierPayment` records mode, TDS, cheque photo | **DISCREPANCY MAJOR** | `packages/db/prisma/schema.prisma` `SupplierPayment` l.1413-1442 has `paymentMode`, `tdsAmount`, `tdsSection`, `referenceNo` but **no** `chequePhotoUrl` field. The API `apps/web/src/app/api/supplier-payments/route.ts` l.8-19 does not accept a cheque photo. |
| 23 | Outstanding dues page at `reports/pending-payments` | **CONFIRMED** | `apps/web/src/app/reports/pending-payments/page.tsx` l.1-80; listed in `apps/web/src/lib/nav.ts` l.877-880 |

---

## 5.5 Project Finance & Reports

| # | Claim | Status | Evidence |
|---|-------|--------|----------|
| 24 | Profit-center per-project P&L page | **CONFIRMED** | `apps/web/src/app/profit-center/page.tsx` l.1-55; nav `apps/web/src/lib/nav.ts` l.629 |
| 25 | Cash-flow forecast API at `/api/cash-flow` | **CONFIRMED** | `apps/web/src/app/api/cash-flow/route.ts` l.1-29; `getCashFlowForecast` in `packages/services/src/finance-advanced.ts` l.191 |
| 26 | Job costing (direct vs indirect) | **AMBIGUOUS** | Concept is mentioned in UI hint (`apps/web/src/lib/nav.ts` l.631 "cost per sqft, job costing") but no dedicated direct-vs-indirect classification API was found in the audited scope. |
| 27 | Budget variance page `/budget-variance` | **CONFIRMED** | `apps/web/src/app/budget-variance/page.tsx` exists |
| 28 | Cost per sq.ft via `reallocateProjectCosts()` | **CONFIRMED** | `packages/services/src/valuation.ts` l.222; called from `built-unit.ts`, `land-cost-component.ts`, `sale.ts`, etc. |

---

## WF-12: Expense Claim and Reimbursement

| # | Claim | Status | Evidence |
|---|-------|--------|----------|
| 29 | Page at `/expense-claims` | **CONFIRMED** | `apps/web/src/app/expense-claims/page.tsx` l.1-115; nav `apps/web/src/lib/nav.ts` l.845-848 |
| 30 | Form fields: title, date, category, description | **DISCREPANCY MAJOR** | The create dialog (`apps/web/src/components/expenses/expense-claims-view.tsx` l.268-299) has **Claimant**, **Project (optional)**, **Description** only. There is no `title` field and no `date` field on the claim header. |
| 31 | "Add Line" has Amount, GST %, GST amount, net auto-computed | **DISCREPANCY CRITICAL** | The UI line form (`apps/web/src/components/expenses/claim-detail-dialog.tsx` l.63-69) has `categoryId/category`, `amount`, `date`, `notes`. No GST %/amount. The API `apps/web/src/app/api/expense-claims/[id]/lines/route.ts` l.8-15 does not accept GST either. |
| 32 | Receipt photo/PDF upload on claim lines | **DISCREPANCY MAJOR** | `receiptUrl` exists on `ExpenseClaimLine` schema and API, but the UI form does **not** collect it (no file upload control in `claim-detail-dialog.tsx`). |
| 33 | Submit sets `status = SUBMITTED` and logs `EXPENSE_CLAIM_CREATE` | **MISATTRIBUTED** | `createExpenseClaim` logs `EXPENSE_CLAIM_CREATE` on creation (`packages/services/src/expense-claim.ts` l.39-46). `submitExpenseClaim` logs `EXPENSE_CLAIM_SUBMIT` (l.130-134) and sets `SUBMITTED` (l.126-128). The doc conflates creation with submission. |
| 34 | Manager "Pending" tab and approve action | **PARTIALLY CONFIRMED / DISCREPANCY** | The list filters by status (`apps/web/src/components/expenses/expense-claims-view.tsx` l.199-209) and has approve/reject buttons for `SUBMITTED` rows. There is no dedicated "Pending" tab; the DataTable has a status filter. |
| 35 | Accountant Pay sets `status = PAID` and posts GL: Dr Expense, Cr Bank/Cash | **DISCREPANCY MAJOR** | `payExpenseClaim` (`packages/services/src/expense-claim.ts` l.240-269) only sets `PAID`, `paidAt`, `paymentMode`, `referenceNo`. The GL is posted during `approveExpenseClaim` (l.188-198) with source type `EXPENSE_CLAIM_APPROVAL`, Dr category GL / Cr `ACCT.CASH`. The doc incorrectly says GL posts on Pay. |
| 36 | Notification to reporting manager on submit | **DISCREPANCY MAJOR** | No notification is sent in `submitExpenseClaim` or anywhere in `expense-claim.ts`. |

---

## WF-13: Tally Sync

| # | Claim | Status | Evidence |
|---|-------|--------|----------|
| 37 | General Ledger page `/gl` has Tally sync panel | **CONFIRMED** | `apps/web/src/app/gl/page.tsx` l.77-79 mounts `TallySyncPanel` |
| 38 | Panel shows unsynced count and last-sync timestamp | **DISCREPANCY MINOR** | `getTallySyncStats` (`packages/services/src/tally.ts` l.490-507) returns `total, synced, failed, pending, imported, variance` but **no** last sync timestamp. The UI shows the counts (`apps/web/src/components/finance/tally-sync-panel.tsx` l.148-183) but not a "Last sync" line. |
| 39 | `POST /api/tally/sync` | **CONFIRMED** | `apps/web/src/app/api/tally/sync/route.ts` l.42-80 |
| 40 | `GET /api/tally/log` | **CONFIRMED** | `apps/web/src/app/api/tally/log/route.ts` l.1-34 |
| 41 | `syncBatchToTally` loops all `JournalEntry` rows where no `TallySyncLog` in SYNCED status | **DISCREPANCY CRITICAL** | `getUnsyncedEntries` (`packages/services/src/tally.ts` l.320-338) filters `tallySyncLog: null` (no log at all). A `FAILED` or `PENDING` log makes `tallySyncLog` non-null, so the entry is **never** re-pushed. The code also throws on already `SYNCED` (`syncEntryToTally` l.363-365) but does not implement "force re-sync". |
| 42 | `generateTallyVoucherXml` builds ENVELOPE/TALLYMESSAGE XML with voucher type, narration, date, ledger names, amounts | **CONFIRMED** | `packages/services/src/tally.ts` l.250-313 |
| 43 | `TallyProvider` POSTs XML to Tally HTTP API on port 9000; stub vs real | **CONFIRMED** | `packages/services/src/tally.ts` `HttpTallyProvider` l.50-119; default port 9000 (`l.54`); `StubTallyProvider` l.35-39; `createTallyProvider` l.173-179 |
| 44 | `TallySyncLog` stores `status = SYNCED` on success, `FAILED` on error | **CONFIRMED** | `packages/services/src/tally.ts` l.408-415; also schema `TallySyncStatus` enum l.3931-3937 |

---

## Summary of Findings

### CONFIRMED (solid)
- GL model, `postJournalEntry`, all GL APIs (`/api/gl/trial-balance`, `/api/gl/ledger`, `/api/gl/accounts`)
- GST posting direction and `HsnGstRate` master
- Expense, ExpenseClaim, ExpenseBudget, PettyCashFloat, RecurringExpense, ProjectCost models
- `/expense-claims`, `/gl`, `/profit-center`, `/budget-variance`, `/reports/pending-payments` pages
- Tally sync routes, provider, and XML generation
- Cash-flow forecast and cost-per-sqft allocation services

### DISCREPANCIES
| Severity | Count | Highlights |
|----------|-------|------------|
| CRITICAL | 4 | Expense-claim line GST fields missing; `receiptUrl` not wired in UI; Tally sync ignores FAILED/PENDING logs (no re-push); HSN count wrong |
| MAJOR | 7 | Chart-of-accounts count (26 vs 32/31); supplier payment has no cheque photo; expense claim "title" / "date" header fields missing; GL posts on approve, not pay; no manager notification on claim submit; no aggregate "last sync" timestamp |
| MINOR | 3 | Tally sync statuses `IMPORTED`/`VARIANCE` not documented; "Pending" tab is a filter, not a tab; HSN count mismatch |

### AMBIGUOUS
- Job costing direct-vs-indirect classification (concept in nav, but no concrete API found within scope)
- The "real estate GST formula" is wired into sales/CRM logic but is not surfaced as a dedicated report

---

## Recommendations
1. **Fix WF-12** — either remove GST %/amount from the use-case doc or add the fields to `ExpenseClaimLine` schema, API, and `claim-detail-dialog.tsx`.
2. **Wire receipt upload** in `claim-detail-dialog.tsx`; the API already supports `receiptUrl`.
3. **Correct account counts** in documentation (currently 32 chart entries, not 26).
4. **Add `chequePhotoUrl` to `SupplierPayment`** or remove the claim from the use-case doc.
5. **Fix Tally retry semantics** in `getUnsyncedEntries` so `FAILED` entries can be re-pushed, or implement a force-sync override.
6. **Document `IMPORTED` and `VARIANCE` Tally statuses**.
7. **Add a notification step** in `submitExpenseClaim` or remove that step from the use-case doc.
8. **Add `lastSync` timestamp** to `getTallySyncStats` / `TallySyncPanel`.

---

## Action Not Completed
The target file  
`/Users/sparshagarwal/Downloads/nirman-inventory/docs/use-cases-audit/audit-books.md`  
was not written because the current environment does not expose a file-write tool. The markdown above is the full content to be saved.
