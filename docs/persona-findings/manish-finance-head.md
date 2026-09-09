# Manish Kumar — Finance Head (FINANCE_HEAD) Persona Audit

**Role:** FINANCE_HEAD (Tier 2 — Senior Management)  
**Phone:** 7302920201  
**Reports to:** Vardaan (OWNER)  
**Permissions:** `FINANCE_VIEW`, `FINANCE_MANAGE`, `EXPENSE_CREATE`, `EXPENSE_APPROVE`, `PAYROLL_VIEW`, `PAYROLL_MANAGE`, `RA_APPROVE`, `RA_PAY`, `HR_VIEW`, `DPR_VIEW`, `PROJECT_CONTROL_VIEW`, `PROCUREMENT_VIEW`, `SALES_VIEW`, `ASSETS_VIEW`, `BOQ_VIEW`, `GATE_PASS_APPROVE`, `LEGAL_MANAGE`  
**Permission source:** `apps/web/src/lib/roles.ts` lines 433–452

---

## Journey Narrative

I am Manish Kumar, the Finance Head of SRG Realcon. I manage all finance — payments, payroll, GL, tax compliance, cost control. I report to Vardaan (OWNER). I can approve expenses, process RA payments, manage payroll, and view finance/GL.

I logged into the Nirman Inventory OS platform. Here is my step-by-step journey through the finance module.

---

## Step 1: Finance Dashboard (`/finance`)

**Files:** `apps/web/src/app/finance/page.tsx`, `apps/web/src/components/finance/finance-view.tsx`, `apps/web/src/components/finance/finance-tabs.tsx`, `apps/web/src/components/finance/outstanding-action-card.tsx`

### What I See

The Finance page is a comprehensive hub with a `PageHeader` showing 6 stat cards:

1. **Inventory** — current value of material stock at MAC
2. **Unsold Assets** — book value of unsold land parcels and built units
3. **Revenue** — total sale price across all active sales
4. **Collected** — total payments received from customers
5. **Outstanding** — revenue minus collected (warning tone if > 0)
6. **Costs + Expenses** — project costs + operating expenses (danger tone)

Below the stats is an `OutstandingActionCard` that appears when outstanding > 0, with links to "View outstanding" sales and "Record Payment".

Then a `FinanceTabs` component with 8 tabs:

- **Overview** — Project P&L, Money Flow, Audit Log (sub-tabs)
- **Supplier Invoices** — three-way matching
- **Expenses** — expense management with approval workflow
- **Claims** — expense claims
- **Petty Cash** — cash float management
- **Recurring** — recurring expense templates
- **Budgets** — expense budget variance
- **Supplier Payments** — payment records

### What Works

- **Stat cards** are computed server-side from real DB queries (`materialInventoryValue`, `unsoldAssetValue`, `AssetSale` aggregation). The data is live and accurate.
- **Tab routing** is URL-driven via `useTabParam` — deep links work (`/finance?tab=expenses`).
- **Conditional data fetching** (lines 182–262) — expense/claims/petty-cash/recurring/budget/supplier-payment data is only fetched when the corresponding tab is active, keeping the page light.
- **OutstandingActionCard** correctly links to `/sales?filter=outstanding` and `/sales`.
- **Project P&L** tab computes P&L per project using `projectPnl()` service, shows cost/revenue/profit/margin with color-coded badges.
- **Money Flow** tab merges project costs + expenses into a unified timeline with date range filter, totals row, and export.
- **Audit Log** tab shows before/after diffs with entity links.

### What's Broken or Missing

1. **No cash position / bank balance view** — the dashboard shows inventory value, unsold assets, revenue, and costs, but there is NO "Cash / Bank Balance" stat card. The GL has a `1000 Cash / Bank` account, but the dashboard doesn't surface it. As a finance head, the #1 thing I want to see is how much cash I have right now. **Missing.**
2. **No P&L statement** — there's a per-project P&L table, but no company-level consolidated P&L (total revenue vs total costs vs net profit). The dashboard shows "Costs + Expenses" as a single number but doesn't compute net profit = revenue − costs.
3. **No accounts receivable aging** — the outstanding amount is shown as a single number with no aging breakdown (0–30, 31–60, 61–90, 90+ days). For a real estate company, AR aging is critical.
4. **No accounts payable summary** — there's no "Total Payable" stat showing how much we owe suppliers/subcontractors. The `Supplier.balanceOwed` field exists but isn't aggregated on the dashboard.
5. **Audit Log tab is read-only** — no date range filter, no export to CSV for compliance. The audit log shows last 50 entries only (line 78: `take: 50`).

### What's Confusing

1. **"Costs + Expenses" stat** combines project costs (capitalised into WIP) with operating expenses (expensed). These are fundamentally different — one hits the balance sheet, the other hits the P&L. Showing them as a single number is misleading.
2. **Money Flow tab** shows costs and expenses with a "−" prefix (line 337: `−{formatCurrency(ev.amount)}`), implying all money is flowing out. But project costs are capitalised into assets (WIP), not expensed. The "−" is misleading for capitalised costs.
3. **No clear separation** between capitalised costs (balance sheet) and operating expenses (P&L). A finance head needs this distinction.

### India-Specific Gaps

1. **No RERA escrow compliance display** — RERA requires 70% of project receipts to be deposited in a separate escrow account. There's no dashboard widget or compliance check for this.
2. **No TDS compliance summary** — no view showing total TDS deducted, TDS payable, and TDS deposit status across all sections (194C, 194I, 194J, 194Q, 194IA).
3. **No GST liability summary** — no dashboard widget showing output GST collected vs input GST (ITC) available vs net GST payable for the current period.

---

## Step 2: General Ledger (`/gl`)

**Files:** `apps/web/src/app/gl/page.tsx`, `apps/web/src/components/finance/general-ledger-view.tsx`, `apps/web/src/components/finance/gst-reports-panel.tsx`, `apps/web/src/components/finance/tally-sync-panel.tsx`

### What I See

The GL page shows:

1. **Balance status banner** — green "Books are balanced" or red "Books are out of balance" with the difference amount.
2. **Trial Balance** — a DataTable with all GL accounts showing code, name, type (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE), debit, credit, and balance. Includes totals row, search, export, and a currency precision toggle (₹0 vs ₹0.00).
3. **Account ledger drill-down** — clicking a trial balance row fetches the individual journal lines for that account via `/api/gl/ledger?account=CODE`.
4. **Re-seed button** — re-seeds the chart of accounts (idempotent upsert).
5. **GST Reports panel** — GSTR-1 and GSTR-3B report generation with date range, CSV export.
6. **Tally Sync panel** — two-way sync with Tally ERP (push/pull/both), auto-sync, sync log viewer.

### What Works

- **Trial balance** is computed server-side via `trialBalance(company.id)` — correctly sums all posted journal lines per account.
- **Abnormal balance detection** (lines 54–59) — flags asset accounts with credit balances and liability accounts with debit balances with a warning icon. Excellent for catching posting errors.
- **Account ledger drill-down** — clicking an account fetches paginated journal lines with entry number, date, source type (linked to source document), memo, debit, credit. Source document links work via `entityUrl()`.
- **GL preview** — `/api/gl/preview` endpoint correctly previews journal lines for expense, projectCost, purchaseReceipt, materialIssue, assetSale, stockAdjustment, and payroll without persisting.
- **GST Reports** — GSTR-1 (outward supplies) and GSTR-3B (summary with ITC reconciliation) are properly generated from journal entries. CSV export works.
- **Tally Sync** — push/pull/both/auto-sync all wired to `/api/tally/sync` and `/api/tally/auto-sync`. Sync log fetchable via `/api/tally/log`. Configuration link to `/settings?tab=integrations`.
- **Chart of accounts** is comprehensive (38 accounts) — includes construction-industry-specific accounts: WIP, Unsold Assets (Land/Units), Input GST/ITC, Output GST, TDS Payable, Retention Payable, Customer Deposits, Advances to Subcontractors, PF Payable, ESI Payable, Profession Tax Payable, Broker Commission Payable, Reimbursements Payable.

### What's Broken or Missing

1. **No manual journal entry creation** — the GL is entirely auto-posted from business events. There's no way for an accountant to create a manual adjusting journal entry (e.g. for depreciation, accruals, year-end adjustments). The `postJournalEntry` service function exists but is not exposed via any API route for manual entry.
2. **No journal entry reversal UI** — `reverseJournalEntry` exists in the service layer but there's no UI to reverse a specific journal entry. Reversal only happens automatically when deleting an expense.
3. **No date-range filter on trial balance** — the trial balance always shows the current cumulative balance. There's no way to see the trial balance as of a specific date (e.g. "as of 31 March 2026" for year-end closing).
4. **No P&L statement or Balance Sheet** — the GL page only shows the trial balance. There's no income statement (revenue − expenses = net profit) or balance sheet (assets = liabilities + equity) view.
5. **No journal entry list/search** — there's no page to browse all journal entries with filters (by date, source type, amount). You can only drill into individual accounts.
6. **GST report entries missing CGST/SGST/IGST breakdown in API response** — the GSTR-1 API response (line 40–48 of `api/gst-reports/route.ts`) doesn't include `cgst`, `sgst`, `igst` per entry, but the UI expects them (line 93 of `gst-reports-panel.tsx`). The UI will show `undefined` for these columns.

### What's Confusing

1. **Re-seed button** is in the trial balance header — it's a maintenance operation that shouldn't be in the primary view. It should be in settings.
2. **Currency toggle** (₹0 vs ₹0.00) is useful but the icon/label is unclear — "₹0.00" means "show paise" and "₹0" means "compact". The tooltip helps but the button label is confusing.

### India-Specific Gaps

1. **No GSTR-2B reconciliation** — GSTR-1 and GSTR-3B are available, but there's no GSTR-2B (auto-drafted ITC statement) reconciliation to match vendor invoices against the GST portal's auto-drafted data.
2. **No 80:20 rule compliance check** — for works contracts, 80% of ITC is available for goods/services used in construction; 20% is restricted. No compliance check for this.
3. **No e-invoice/e-way bill integration** — the `e-invoice.ts` service exists but there's no UI to generate or track e-invoices/e-way bills from the GL page.
4. **No TDS challan generation** — TDS is deducted and posted to TDS Payable, but there's no UI to generate TDS challans or track TDS deposit dates for quarterly filing.
5. **No GST return filing status tracking** — no way to mark a GST return as "filed" with filing date, acknowledgement number, and ARN.

---

## Step 3: Expenses (`/finance?tab=expenses`)

**Files:** `apps/web/src/components/expenses/expenses-view.tsx`, `apps/web/src/components/expenses/expense-form-dialog.tsx`, `apps/web/src/components/expenses/expense-category-dialog.tsx`, `apps/web/src/app/api/expenses/route.ts`, `apps/web/src/app/api/expenses/[id]/route.ts`, `packages/services/src/expense.ts`

### What I See

The Expenses tab shows:

- **Toolbar** — project filter, category filter, refresh, "Categories" settings button, "Add Expense" button.
- **Status tabs** — All, Drafts, Pending, Approved, Rejected (with counts).
- **Expense table** — date, category (+ project), payee/vendor, payment mode, amount (with GST breakdown), status badge.
- **Row actions** — view receipt, edit (DRAFT/REJECTED), submit (DRAFT/REJECTED), approve (PENDING), reject (PENDING), delete (non-PENDING).
- **Expense form dialog** — project, category, vendor/supplier, payee, amount + GST breakdown (subtotal, CGST, SGST, IGST, TDS), payment mode (CASH/UPI/NEFT/BANK/CHEQUE/CREDIT), bank account, reference no, cheque fields (when CHEQUE), date, receipt upload, notes, "Submit for approval" checkbox.

### What Works

- **Full approval workflow** — DRAFT → PENDING → APPROVED/REJECTED. GL posts on APPROVAL, not creation. Rejected expenses can be edited and resubmitted.
- **Self-approval prevention** (expense.ts line 226–228) — the submitter cannot approve their own expense. Excellent control.
- **Budget enforcement** (expense.ts lines 232–248) — approving an expense that exceeds the category/project budget is blocked with a clear message. The UI offers an "Override & Approve" toast action (expenses-view.tsx lines 128–135).
- **GST-aware posting** — `postExpense` correctly debits the expense account (subtotal), Input GST/ITC (GST total), and credits Cash or AP, with TDS to TDS Payable.
- **Category master** — expense categories are linked to GL accounts via `glAccountCode`. When a category is selected, the expense posts to the category's GL account instead of the default 6000 Operating Expenses.
- **Receipt upload** — file upload via `/api/uploads`, linked to `receiptUrl`.
- **Cheque photo** — `chequePhotoUrl` field exists in the schema and API, but the expense form dialog does NOT have a cheque photo upload field (only cheque no + date). **See "Broken" below.**
- **Audit logging** — every create/update/submit/approve/reject/delete is logged with before/after.
- **GL reversal on delete** — deleting an APPROVED expense reverses the journal entry.
- **Category management** — create/update/deactivate categories with GL account linking.

### What's Broken or Missing

1. **No cheque photo upload in expense form** — the `ExpenseFormDialog` (expense-form-dialog.tsx) has cheque number and cheque date fields (lines 377–388), but NO cheque photo upload field. The `chequePhotoUrl` is in the API schema and service, but the UI doesn't expose it. For audit trail, cheque photos are essential.
2. **No TDS section selection** — the expense form has a "TDS Deducted" amount field but no TDS section dropdown (194C, 194I, 194J, etc.). The `tdsAmount` is posted to TDS Payable but without a section code, TDS compliance reporting is impossible.
3. **No GST auto-calculation** — the form has manual CGST/SGST/IGST fields. There's no GST rate dropdown (5%, 12%, 18%, 28%) that auto-computes the GST from the subtotal. The user must manually calculate and enter each component.
4. **No inter-state vs intra-state GST logic** — CGST+SGST is for intra-state, IGST is for inter-state. There's no toggle or auto-detection based on the supplier's GSTIN state vs the company's state.
5. **No bulk approve/reject** — expenses must be approved one by one. For a finance head with 50 pending expenses, this is tedious.
6. **No expense search by amount range** — the search is text-based (category, payee, notes). No min/max amount filter.
7. **No payment status tracking** — APPROVED expenses are "approved" but there's no "PAID" status. The GL posts the expense (Dr Expense / Cr Cash or Cr AP), but if paid via AP, there's no link to the supplier payment that settles it.

### What's Confusing

1. **Category field duplication** — when categories exist, there's a dropdown AND a free-text field (lines 280–297). The free-text is "auto-filled from master, editable" but this creates confusion — which one is the source of truth?
2. **"Submit for approval" checkbox** defaults to `false` (line 71: `useState(false)`), but the save button label changes based on it. If unchecked, it saves as DRAFT; if checked, it submits immediately. The checkbox is small and easy to miss.

### India-Specific Gaps

1. **No TDS section code** — TDS amount is captured but the section (194C, 194I, 194J, 194Q, 194H, 194IA) is not. Without the section, TDS compliance reporting and challan generation is impossible.
2. **No 194IA for property purchases** — TDS @1% on property purchases > ₹50 lakhs is a critical compliance requirement. No specific handling for this.
3. **No GST reverse charge mechanism** — for certain services (GTA, legal fees), GST is paid on reverse charge by the recipient. No support for RCM in expense posting.
4. **No HSN/SAC code on expenses** — expenses don't link to HSN/SAC codes, making GSTR-1 filing incomplete for service-based outward supplies.

---

## Step 4: Expense Claims (`/finance?tab=claims`)

**Files:** `apps/web/src/components/expenses/expense-claims-view.tsx`, `apps/web/src/components/expenses/claim-detail-dialog.tsx`, `apps/web/src/app/api/expense-claims/[id]/route.ts`, `apps/web/src/app/api/expense-claims/[id]/lines/route.ts`

### What I See

The Claims tab shows:

- **Toolbar** — refresh, "New Claim" button.
- **Claims table** — claimant, description, line count, total amount, status (DRAFT/SUBMITTED/APPROVED/REJECTED/PAID), created date.
- **Row actions** — submit (DRAFT), reject + approve (SUBMITTED), mark as paid (APPROVED).
- **Create dialog** — claimant (employee), project (optional), description.
- **Detail dialog** — shows all expense lines with category, GST rate, amount, date, receipt. Allows adding/removing lines (DRAFT only). Shows approval/rejection info and payment info.
- **Pay dialog** — payment mode (NEFT/UPI/BANK/CHEQUE/CASH), reference no.

### What Works

- **Full claim lifecycle** — DRAFT → SUBMITTED → APPROVED/REJECTED → PAID.
- **Multi-line claims** — a claim can have multiple expense lines, each with category, GST rate, amount, date, receipt.
- **Receipt upload per line** — each claim line can have its own receipt photo/bill.
- **Attachment support** — `AttachmentList` component shows attachments linked to the claim.
- **Payment recording** — APPROVED claims can be marked as PAID with payment mode and reference number.
- **Audit logging** — submit/approve/reject/pay actions are logged.
- **GL posting** — `payExpenseClaim` posts to GL (Dr Reimbursements Payable / Cr Cash).

### What's Broken or Missing

1. **No GL posting on approval** — the claim is approved but the GL entry is only posted when the claim is PAID (via `payExpenseClaim`). This means approved-but-unpaid claims don't show up as a liability on the balance sheet. The GL should post on approval (Dr Expense / Cr Reimbursements Payable) and then settle on payment (Dr Reimbursements Payable / Cr Cash).
2. **No self-approval prevention** — unlike expenses (which prevent self-approval), expense claims don't check if the approver is the claimant. A claimant could approve their own claim.
3. **No claim editing after submission** — once submitted, a claim's lines can't be modified. If an approver wants a small change, the claim must be rejected and resubmitted.
4. **No claim template** — there's no way to create a recurring claim template (e.g. monthly travel claim).
5. **No claim approval delegation** — no way to delegate claim approval when the finance head is unavailable.

### What's Confusing

1. **"Mark as paid" icon** uses `FileText` icon (line 252), which is typically associated with documents, not payments. A `DollarSign` or `Banknote` icon would be clearer.
2. **No total amount shown in create dialog** — the create dialog doesn't show the total because lines haven't been added yet, but there's no indication that the total will be computed from lines.

### India-Specific Gaps

1. **No per-line TDS** — claim lines don't support TDS deduction. For professional service reimbursements, TDS may need to be deducted.
2. **No GST ITC tracking on claims** — claim lines have GST rate and amount, but there's no tracking of whether the ITC has been claimed on the GST return.

---

## Step 5: Supplier Payments (`/finance?tab=supplier-payments`)

**Files:** `apps/web/src/components/finance/supplier-payments-view.tsx`, `apps/web/src/components/procurement/supplier-payment-form-dialog.tsx`, `apps/web/src/app/api/supplier-payments/route.ts`, `packages/services/src/supplier-payment.ts`

### What I See

The Supplier Payments tab shows:

- **Toolbar** — search (supplier, payment #, reference, PO, invoice), payment mode filter, print, "Record Payment" button.
- **Payments table** — payment #, date, supplier (with PO/invoice), mode (color-coded badge), reference, amount, TDS (with section), net paid.
- **Payment form dialog** — supplier (with outstanding balance display), amount (with "Pay full outstanding" shortcut), payment date, payment mode (Bank/NEFT/RTGS/UPI/Cheque/Cash), reference no, cheque photo upload (CHEQUE only), TDS amount + section (194C/194I/194J/194Q/194H), notes, outstanding balance display.

### What Works

- **Full payment recording** — creates a `SupplierPayment` record, posts GL (Dr AP / Cr Cash / Cr TDS Payable), and updates `Supplier.balanceOwed`.
- **TDS support** — TDS amount and section are captured. TDS is posted to TDS Payable (2400).
- **Cheque photo upload** — when payment mode is CHEQUE, a file upload field appears for the cheque photo. The photo URL is stored in `chequePhotoUrl`.
- **Outstanding balance display** — shows the supplier's current balance owed, with "Pay full outstanding" shortcut and "After payment" projection.
- **Overpayment warning** — if the payment exceeds the balance owed, a warning toast is shown (but payment is allowed).
- **Payment modes** — comprehensive: Bank Transfer, NEFT, RTGS, UPI, Cheque, Cash.
- **Print** — `window.print()` for payment records.
- **Color-coded payment mode badges** — each mode has a distinct color.

### What's Broken or Missing

1. **No payment against specific PO/invoice from this tab** — the `SupplierPaymentFormDialog` accepts `purchaseOrderId` and `defaultAmount` props, but the Supplier Payments tab view doesn't pass them. You can only record a generic payment, not link it to a specific PO or invoice from this tab. (Linking happens from the Supplier Invoices tab.)
2. **No payment edit or void** — once recorded, a payment can't be edited or voided. If a mistake is made (wrong amount, wrong supplier), there's no way to correct it.
3. **No payment approval workflow** — payments are recorded directly without approval. For large payments, a two-step approval (create → approve → execute) would be a better control.
4. **No cheque clearing status** — cheque payments are recorded but there's no "cleared" / "bounced" status tracking.
5. **No bank reconciliation** — no way to match recorded payments against bank statements.
6. **No RTGS minimum amount check** — RTGS has a minimum of ₹2 lakhs in India. The form doesn't validate this.
7. **No NEFT/RTGS settlement time tracking** — no field to record when the payment actually settled in the beneficiary's account.
8. **No 194IA section** — the TDS section dropdown includes 194C, 194I, 194J, 194Q, 194H but NOT 194IA (TDS on property purchases @ 1% for amounts > ₹50 lakhs).

### What's Confusing

1. **"BANK" vs "NEFT" vs "RTGS"** — "Bank Transfer" is a generic mode, while NEFT and RTGS are specific bank transfer types. Having both "Bank Transfer" and "NEFT/RTGS" as separate options is redundant and confusing.
2. **Payment number** is shown as `font-mono text-xs` — very small and hard to read.

### India-Specific Gaps

1. **No 194IA TDS section** — critical for property purchases.
2. **No TDS threshold checks** — no validation that TDS is deducted when the payment exceeds the threshold limit for the selected section (e.g. 194C: ₹30,000 single payment / ₹1,00,000 annual).
3. **No TDS rate auto-calculation** — TDS amount is manually entered. The system should auto-calculate based on the section and rate (194C: 1%/2%, 194I: 10%, 194J: 10%, 194Q: 0.1%).
4. **No PAN validation** — no validation that the supplier's PAN is valid and linked to their GSTIN for TDS purposes.
5. **No Form 26AS tracking** — no tracking of whether the TDS deducted appears in the supplier's Form 26AS.

---

## Step 6: Payroll (`/hr/payroll`)

**Files:** `apps/web/src/app/hr/payroll/page.tsx`, `apps/web/src/components/hr/payroll-view.tsx`, `apps/web/src/app/api/payroll/route.ts`, `apps/web/src/app/api/payroll/[id]/route.ts`, `packages/services/src/hr.ts`

### What I See

The Payroll page shows:

- **Summary stats bar** — total periods, avg net/period, total paid out, pending action count.
- **Net pay trend** — sparkline of last 6 periods' net pay.
- **Periods table** — period (month/year with date range), status (DRAFT/PROCESSED/PAID with progress steps), employee count, gross, deductions, net pay.
- **Row actions** — View Lines, Process (DRAFT), Mark Paid (PROCESSED).
- **Generate dialog** — month + year selector.
- **Summary dialog** (row click) — status, progress steps, financial breakdown (gross/overtime/deductions/net), composition bar, processed-by info, GL impact preview, action buttons.
- **Detail dialog** (View Lines) — per-employee table with days worked, basic, OT, allowance, bonus, PF, employer PF, ESI, profession tax, tax, deductions, net pay. Editable when DRAFT.

### What Works

- **Payroll generation from attendance** — `generatePayroll` fetches all active employees, batch-fetches their attendance for the month, and computes: days worked (with half-day/late rules), basic amount (wage-type formula), overtime (hours > 8 × hourlyRate × 1.5), and deductions.
- **Wage type support** — DAILY (dailyRate × daysWorked), MONTHLY (monthlySalary prorated), FIXED (full monthly salary regardless of attendance).
- **Late half-day deduction** — 4 lates = 1 half-day deduction (owner's explicit policy).
- **Payroll line editing** — DRAFT period lines can be edited (overtime, allowance, bonus, PF, employer PF, ESI, profession tax, tax, deductions).
- **GL posting on process** — `processPayroll` posts Dr Salaries Expense / Cr Salaries Payable (with PF, ESI, Profession Tax, TDS breakdown).
- **GL posting on pay** — `payPayroll` posts Dr Salaries Payable / Cr Cash.
- **GL impact preview** — before processing, the finance head can preview the exact journal lines that will be posted.
- **Duplicate prevention** — generating payroll for an already-processed period throws an error.
- **DAILY workers skipped** if no attendance (line 1122: `if (attendances.length === 0 && emp.wageType === "DAILY") continue`).
- **MONTHLY/FIXED workers** get full salary even without attendance (lines 1126–1127).

### What's Broken or Missing

1. **PF/ESI/Profession Tax/TDS default to 0 on generation** — lines 1140–1144: all statutory deductions are initialized to 0. The finance head must manually enter PF, ESI, profession tax, and TDS for each employee. There's no auto-calculation:
   - PF: 12% of basic (employee) + 12% of basic (employer)
   - ESI: 0.75% of gross (employee) + 3.25% of gross (employer)
   - Profession tax: state-specific slab
   - TDS: based on estimated annual income
2. **No payslip generation** — there's no way to generate or download individual employee payslips (PDF).
3. **No bank transfer file export** — no way to export a bank transfer file (NEFT/RTGS format) for bulk salary disbursement.
4. **No payroll revision/arrears** — no support for salary revisions, arrears payment, or bonus adjustments after processing.
5. **No leave encashment** — no calculation for leave encashment in final settlement.
6. **No PF/ESI compliance reports** — no ECR (Electronic Challan cum Return) file generation for PF, no ESI return generation.
7. **No payroll lock** — once processed, a payroll period can't be reversed or adjusted. But there's no explicit "lock" indicator or warning.
8. **No payroll cost allocation** — payroll costs are posted to a single Salaries Expense account. There's no allocation to projects (which employees worked on which projects).

### What's Confusing

1. **"Process" vs "Mark Paid"** — the two-step workflow (Process → Mark Paid) is not immediately clear. "Process" posts the salary expense to GL, and "Mark Paid" settles the payable. Better labels: "Approve & Post to GL" and "Record Salary Payment".
2. **No indication of what "Process" does** — the summary dialog has a "Preview GL" button but it's only visible after clicking it once. The first-time user doesn't know GL will be posted.

### India-Specific Gaps

1. **No PF auto-calculation** — PF @ 12% of basic (employee + employer) is not auto-computed. Must be manually entered per employee.
2. **No ESI auto-calculation** — ESI @ 0.75% (employee) + 3.25% (employer) on gross up to ₹21,000/month is not auto-computed.
3. **No profession tax slab** — profession tax is state-specific (₹200/month in most states). No slab-based auto-calculation.
4. **No TDS on salary calculation** — TDS is not auto-computed based on the employee's estimated annual income, tax regime, and exemptions.
5. **No Form 16 generation** — no annual TDS certificate (Form 16) generation for employees.
6. **No PF/ESI registration number tracking** — no company-level PF/ESI registration numbers stored for compliance.
7. **No minimum wage check** — no validation that the daily rate meets the state's minimum wage for the trade.

---

## Step 7: Work Orders & RA Bills (`/work-orders`)

**Files:** `apps/web/src/app/work-orders/page.tsx`, `apps/web/src/app/work-orders/content.tsx`, `apps/web/src/components/work-orders/work-orders-view.tsx`

### What I See

The Work Orders page shows:

- **Page header** — "Work Orders" with project count stat.
- **Work orders view** — client-side component that fetches work orders, RA bills, and details via API.
- **Work order fields** — work order number, work title, status (DRAFT/ISSUED/ACTIVE/COMPLETED/CLOSED/CANCELLED), retention %, TDS %, TDS category, advance amount, advance recovery %, total work done, total deductions, total paid, retention balance.
- **RA bill fields** — RA bill number, bill date, status (DRAFT/SUBMITTED/APPROVED/PAID/REJECTED), gross amount, net payable, period from/to.
- **Permissions** — `canManage` (WO_MANAGE), `canSubmit` (RA_SUBMIT), `canApprove` (RA_APPROVE), `canPay` (RA_PAY).

### What Works

- **RA bill approval posts to GL** — `postRaBillApproval` correctly posts: Dr WIP (grossAmount), Cr AP (netPayable + otherDeductions), Cr TDS Payable (tdsAmount), Cr Retention Payable (retentionAmount), Cr Advances to Subcontractors (advanceRecovery).
- **RA bill payment** — RA bills can be marked as PAID.
- **Print certificate** — RA bill payment certificates can be printed.
- **Retention tracking** — retention % is tracked per work order, and retention balance is computed.
- **TDS on RA bills** — TDS % and TDS category are captured per work order.
- **Advance recovery** — advance amount and recovery % are tracked, with advance recovery deducted from RA bills.

### What's Broken or Missing

1. **No RA bill payment from this page** — while RA bills can be marked as PAID, there's no direct link to record a supplier payment from the RA bill. The payment is recorded as a status change, not a `SupplierPayment` record with GL posting.
2. **No retention release workflow** — retention is held in Retention Payable (2600), but there's no workflow to release retention after the defect liability period. No UI to track defect liability expiry and initiate retention release.
3. **No RA bill aging** — no view showing how long RA bills have been pending approval or payment.
4. **No work order vs RA bill reconciliation** — no view comparing total work done vs total RA bills submitted to identify gaps.
5. **No subcontractor ledger** — no view showing all transactions with a subcontractor (advances, RA bills, payments, retention) in one place.

### What's Confusing

1. **Permission check uses `ASSETS_VIEW`** (content.tsx line 15) — work orders are accessed with `ASSETS_VIEW` permission, not a finance permission. This is confusing — work orders are a finance/procurement function, not an asset management function.
2. **RA bill status "PAID"** — it's unclear whether "PAID" means the payment was recorded in the system (SupplierPayment created) or just manually marked. Based on the code, it appears to be a status change without a linked SupplierPayment.

### India-Specific Gaps

1. **No 194C TDS rate validation** — TDS % is manually entered. The system should validate that the TDS rate matches the section (194C: 1% individual, 2% HUF/firm/company for contract payments).
2. **No RERA 70% rule compliance** — RERA mandates that 70% of project receipts be deposited in a separate escrow account and used only for project construction. No compliance check or escrow tracking.
3. **No retention release TDS** — when retention is released after defect liability, TDS may need to be deducted. No handling for this.
4. **No GST on subcontractor bills** — subcontractor RA bills don't capture GST. For works contracts, GST @ 18% (12% for affordable housing) applies. The RA bill should capture GST and post it to Input GST/ITC.

---

## Step 8: Petty Cash (`/finance?tab=petty-cash`)

**Files:** `apps/web/src/components/expenses/petty-cash-view.tsx`, `apps/web/src/app/api/petty-cash/route.ts`, `apps/web/src/app/api/petty-cash/[id]/topups/route.ts`, `apps/web/src/app/api/petty-cash/[id]/spend/route.ts`

### What I See

The Petty Cash tab shows:

- **Toolbar** — refresh, "New Float" button.
- **Float cards** (expandable) — name, project badge, custodian, top-up count, balance, "Low" badge if balance < 20% of top-ups.
- **Expanded view** — total top-ups, total spent, current balance, recent top-ups list.
- **Actions** — Spend (record expense), Top Up (add cash).
- **Create float dialog** — name, initial float amount, custodian (employee), project.
- **Top-up dialog** — amount, payment mode (NEFT/UPI/BANK/CASH), reference no, notes.
- **Spend dialog** — category (from master or free text), amount (max = balance), notes. Creates an approved expense + GL entry.

### What Works

- **Float lifecycle** — create float → top up → spend → balance tracks automatically.
- **Spend creates an expense** — petty cash spend creates an APPROVED expense with GL posting (Dr Expense / Cr Petty Cash 1050).
- **Low balance alert** — "Low" badge when balance < 20% of total top-ups.
- **Custodian assignment** — each float can have a custodian.
- **Project linking** — floats can be linked to a project.
- **Top-up with payment mode** — tracks how the float was topped up (NEFT/UPI/BANK/CASH).

### What's Broken or Missing

1. **No spend history** — the expanded view shows top-ups but NOT spends. You can see how much was topped up and the total spent, but not the individual spend transactions. To see spends, you'd need to go to the Expenses tab and filter by petty cash.
2. **No float reconciliation** — no way to reconcile the physical cash count with the system balance.
3. **No float transfer** — no way to transfer balance between floats.
4. **No float close/retire** — no way to close a float and return the remaining balance to the bank.
5. **No spend approval** — spends are immediately approved (bypassing the expense approval workflow). For larger spends, an approval step would be better.

### What's Confusing

1. **"Low" badge threshold** — `f.floatAmount < f.topUpTotal * 0.2` (line 182) uses 20% of total top-ups, not 20% of the initial float. This is an unusual metric — if a float was topped up many times, the "low" threshold keeps increasing.

### India-Specific Gaps

1. **No cash transaction limit** — no validation against the ₹10,000/day cash transaction limit (Section 269ST) or the ₹10,000 cash payment limit for expenses (Section 40A(3)).
2. **No cash denomination tracking** — no tracking of cash denominations for physical reconciliation.

---

## Step 9: Recurring Expenses (`/finance?tab=recurring`)

**Files:** `apps/web/src/components/expenses/recurring-expenses-view.tsx`, `apps/web/src/app/api/recurring-expenses/route.ts`, `packages/services/src/recurring-expense.ts`

### What I See

The Recurring Expenses tab shows:

- **Toolbar** — refresh, "Generate Due" button, "New Recurring" button.
- **Recurring expenses table** — category (+ project), payee/vendor, amount, frequency (Weekly/Monthly/Quarterly/Yearly), next run date (highlighted if due), status (Active/Paused).
- **Row actions** — pause/activate, delete.
- **Create dialog** — category (from master or free text), amount, frequency, start date, end date, project, vendor, payee, payment mode, notes.

### What Works

- **Template creation** — recurring expense templates with frequency, start/end dates, project/vendor linking.
- **Generate due** — "Generate Due" button calls `generateDueRecurringExpenses` which creates DRAFT expenses for all active recurring expenses whose `nextRunDate` has passed.
- **Pause/activate** — toggle active status without deleting.
- **Next run date tracking** — `nextRunDate` is updated after each generation.
- **Due date highlighting** — next run date is highlighted in warning color if it's past due.

### What's Broken or Missing

1. **No automatic generation** — recurring expenses are not auto-generated. The finance head must manually click "Generate Due". There's no cron job or scheduled task to auto-generate drafts.
2. **No recurring expense history** — no view showing which expenses were generated from each recurring template and when.
3. **No edit** — recurring expense templates can be created, paused, and deleted, but NOT edited. If the amount or frequency changes, the template must be deleted and recreated.
4. **No GST/TDS on recurring expenses** — recurring expense templates don't capture GST or TDS. The generated drafts will have 0 GST and 0 TDS, requiring manual editing after generation.
5. **No recurring payment execution** — recurring expenses generate DRAFT expenses, but don't actually make payments. For fixed recurring payments (rent, salaries), auto-payment would be useful.

### What's Confusing

1. **"Generate Due" is manual** — the name "recurring" implies automatic, but the user must manually trigger generation. This is confusing for first-time users.

### India-Specific Gaps

1. **No GST/TDS on recurring templates** — rent payments need TDS @ 10% (194I). The template doesn't capture this, so the generated draft will have 0 TDS.
2. **No recurring GST compliance** — for recurring service contracts, GST returns must be filed monthly/quarterly. No tracking of GST compliance for recurring expenses.

---

## Step 10: Expense Budgets (`/finance?tab=budgets`)

**Files:** `apps/web/src/components/expenses/expense-budgets-view.tsx`, `packages/services/src/expense-budget.ts`

### What I See

The Budgets tab shows:

- **Toolbar** — refresh, "New Budget" button.
- **Budgets table** — category (+ project), amount, period, actual amount, variance, utilization %.
- **Create dialog** — category (from master or free text), amount, period start/end, project, notes.

### What Works

- **Budget setting** — set budgets per category (optionally per project) for a period.
- **Variance computation** — `getExpenseBudgetVariance` computes actual spend from APPROVED expenses in the period and calculates variance and utilization %.
- **Budget enforcement** — `checkExpenseBudget` is called during expense approval. If the expense would exceed the budget, approval is blocked with an override option.
- **Upsert** — setting a budget for the same category/project/period updates the existing budget instead of creating a duplicate.

### What's Broken or Missing

1. **No budget vs actual chart** — the table shows numbers but no visual chart (bar/pie) for budget utilization.
2. **No budget alerts/notifications** — no automatic notification when a budget is approaching its limit (e.g. 80% utilization).
3. **No annual budget roll-forward** — no way to copy budgets from one period to the next.
4. **No budget approval workflow** — budgets are set directly without approval. For better control, budget changes should require approval.

### What's Confusing

1. **Utilization % calculation** — `computeUtilizationPct` rounds to 1 decimal place, but the display doesn't show the % sign consistently.

---

## Step 11: Supplier Invoices (`/finance?tab=invoices`)

**Files:** `apps/web/src/components/finance/supplier-invoices-view.tsx`

### What I See

The Supplier Invoices tab shows:

- **Toolbar** — refresh, "New Invoice" button.
- **Invoices table** — invoice #, date, supplier, PO #, amount, status (PENDING/MATCHED/DISPUTED/APPROVED/PAID), match status (3-Way/2-Way/Manual/Unmatched).
- **Detail dialog** — summary (subtotal/GST/total/status), three-way match results (with variances), PO + GRN details (ordered vs received), approval info, original bill document upload, actions (Print, Dispute, Approve, Record Payment).

### What Works

- **Three-way matching** — invoices are matched against POs and goods receipts. Variances (quantity, unit price, line total) are shown with expected vs actual.
- **Invoice document upload** — original bill can be uploaded and viewed.
- **Approval workflow** — PENDING/MATCHED → APPROVED or DISPUTED.
- **Payment from invoice** — APPROVED invoices have a "Record Payment" button that opens the SupplierPaymentFormDialog with the supplier and amount pre-filled.
- **Print invoice** — link to `/print/supplier-invoice/[id]`.
- **Match status badges** — 3-Way Match (green), 2-Way Match (warning), Manual (info), Unmatched (danger).

### What's Broken or Missing

1. **No invoice due date tracking** — `dueDate` is in the schema and fetched, but there's no aging report or overdue alert based on it.
2. **No invoice matching automation** — matching appears to be manual or triggered on creation. There's no "Re-run Match" button for invoices that were initially unmatched.
3. **No invoice dispute resolution workflow** — disputed invoices can be created but there's no workflow to resolve disputes (negotiate with supplier, adjust, re-approve).

### What's Confusing

1. **"Dispute" vs "Reject"** — the action button says "Dispute" but the status becomes "DISPUTED". It's unclear what happens next — can a disputed invoice be re-approved?

---

## Step 12: Cost Control (`/cost-control`)

**Files:** `apps/web/src/app/cost-control/page.tsx`, `apps/web/src/components/cost-control/cost-control-tabs.tsx`, `apps/web/src/components/budget-variance/budget-variance-view.tsx`, `apps/web/src/components/project-control/project-control-view.tsx`, `apps/web/src/components/profit-center/profit-center-view.tsx`

### What I See

The Cost Control page has 3 tabs:

1. **Project Control** — EVM (Earned Value Management) analysis.
2. **Budget Variance** — budget vs actual analysis.
3. **Profit Center** — profit center analysis.

### What Works

- **Tab routing** is URL-driven.
- **Permission gating** — Project Control requires `PROJECT_CONTROL_VIEW`, Budget Variance and Profit Center require `FINANCE_VIEW`.
- **FINANCE_HEAD has all required permissions** — can see all 3 tabs.

### What's Broken or Missing

1. **No cost overrun alerts** — no automatic alerts when project costs exceed budget.
2. **No cost forecast** — no ETC (Estimate to Complete) or EAC (Estimate at Completion) projections.

---

## Step 13: Finance Audit Trail (`/finance/audit`)

**Files:** `apps/web/src/app/finance/audit/page.tsx`, `apps/web/src/app/finance/audit/audit-view.tsx`

### What I See

- **Page header** — "Audit Trail" with description.
- **Audit trail view** — client-side component with user filter.

### What Works

- **RBAC** — only OWNER/ADMIN can access. FINANCE_HEAD CANNOT access this page (line 29: `if (!isSuperuser) return <NoAccess>`). This is a significant limitation — as the finance head, I need to see the audit trail for compliance.

### What's Broken or Missing

1. **FINANCE_HEAD cannot access** — the audit trail is restricted to OWNER/ADMIN only. As the finance head responsible for compliance, I should be able to view (if not manage) the audit trail.
2. **No export** — no CSV/PDF export of the audit trail for compliance purposes.

---

## Step 14: DPR-Finance Reconciliation (`/finance/dpr-reconciliation`)

**Files:** `apps/web/src/app/finance/dpr-reconciliation/page.tsx`, `apps/web/src/components/dpr/dpr-finance-reconciliation-view.tsx`

### What I See

- **Page header** — "DPR-Finance Reconciliation" with description comparing DPR-recorded costs against GL-posted costs.

### What Works

- **FINANCE_HEAD has access** — requires `FINANCE_VIEW` which FINANCE_HEAD has.
- **Reconciliation view** — compares DPR material + labor costs against GL-posted Material Issues + Project Costs linked via `sourceDprId`.

### What's Broken or Missing

1. **No variance auto-resolution** — variances are shown but there's no workflow to investigate and resolve them.

---

## Summary of Issues

### Broken

1. **GSTR-1 API response missing CGST/SGST/IGST per entry** — `api/gst-reports/route.ts` lines 40–48 don't include `cgst`, `sgst`, `igst` in the entry response, but `gst-reports-panel.tsx` line 93 expects them. UI will show `undefined`.
2. **No cheque photo upload in expense form** — `ExpenseFormDialog` has cheque no/date but no cheque photo upload, despite `chequePhotoUrl` being in the schema and API.
3. **Petty cash spend history not visible** — expanded float view shows top-ups but not individual spends.
4. **Recurring expenses not auto-generated** — "Generate Due" is manual, no cron job.
5. **Recurring expense templates cannot be edited** — only create/pause/delete.
6. **Expense claims don't post GL on approval** — GL posts only on payment, not approval. Approved-but-unpaid claims don't appear as liabilities.
7. **No self-approval prevention for expense claims** — claimants can approve their own claims.
8. **RA bill "PAID" status not linked to SupplierPayment** — marking an RA bill as PAID doesn't create a SupplierPayment record with GL posting.
9. **FINANCE_HEAD cannot access audit trail** — restricted to OWNER/ADMIN only.

### Missing

1. **Cash/bank balance on dashboard** — no stat card showing current cash position.
2. **Company-level P&L statement** — no consolidated income statement.
3. **Balance sheet** — no assets = liabilities + equity view.
4. **AR aging report** — no aging breakdown of outstanding receivables.
5. **AP aging report** — no aging breakdown of outstanding payables.
6. **Manual journal entry creation** — no UI for accountants to create adjusting entries.
7. **Journal entry reversal UI** — service exists but no UI.
8. **Journal entry list/search** — no page to browse all journal entries.
9. **Trial balance as-of-date filter** — always shows cumulative, no date filter.
10. **Payslip generation** — no PDF payslip for employees.
11. **Bank transfer file export** — no NEFT/RTGS file for bulk salary disbursement.
12. **PF/ESI/PT/TDS auto-calculation in payroll** — all statutory deductions default to 0.
13. **PF/ESI compliance reports** — no ECR file, no ESI return.
14. **Form 16 generation** — no annual TDS certificate.
15. **TDS section on expenses** — TDS amount captured but section code not.
16. **TDS challan generation** — no challan creation or deposit tracking.
17. **GST return filing status tracking** — no way to mark returns as filed.
18. **GSTR-2B reconciliation** — no auto-drafted ITC reconciliation.
19. **E-invoice/e-way bill integration UI** — service exists but no UI.
20. **Retention release workflow** — no defect liability expiry tracking or retention release.
21. **Subcontractor ledger** — no consolidated view of all subcontractor transactions.
22. **Payment void/edit** — supplier payments can't be corrected after recording.
23. **Payment approval workflow** — no two-step approval for large payments.
24. **Cheque clearing status** — no cleared/bounced tracking.
25. **Bank reconciliation** — no matching against bank statements.
26. **Bulk expense approve/reject** — must be done one by one.
27. **Budget vs actual charts** — no visual representation.
28. **Budget alerts** — no notification at 80% utilization.
29. **Cost overrun alerts** — no automatic alerts.
30. **Cost forecast (ETC/EAC)** — no projections.

### Confusing

1. **"Costs + Expenses" dashboard stat** combines capitalised costs with expensed costs.
2. **Money Flow "−" prefix** on capitalised costs implies expense, not capitalisation.
3. **Category field duplication** in expense form (dropdown + free text).
4. **"Submit for approval" checkbox** is small and easy to miss.
5. **"BANK" vs "NEFT" vs "RTGS"** as separate payment modes is redundant.
6. **"Mark as paid" icon** uses `FileText` instead of a payment icon.
7. **"Process" vs "Mark Paid"** payroll labels are unclear.
8. **"Low" petty cash badge** uses 20% of top-ups, not 20% of initial float.
9. **"Generate Due" is manual** despite being called "recurring".
10. **"Dispute" vs "Reject"** on supplier invoices — unclear resolution path.
11. **Work orders use `ASSETS_VIEW` permission** instead of a finance permission.
12. **Re-seed chart of accounts** button in the trial balance header (maintenance operation in primary view).
13. **Currency toggle** button label (₹0.00 vs ₹0) is unclear.

### India-Specific Gaps

1. **No RERA 70% escrow compliance** — no tracking of project receipts deposited in escrow.
2. **No TDS section code on expenses** — TDS amount without section makes compliance reporting impossible.
3. **No 194IA TDS** — TDS @ 1% on property purchases > ₹50 lakhs not supported.
4. **No TDS threshold validation** — no check that TDS is deducted when payment exceeds section threshold.
5. **No TDS rate auto-calculation** — TDS amount is manual, should auto-calculate from section + rate.
6. **No GST auto-calculation** — CGST/SGST/IGST are manual, no rate-based auto-computation.
7. **No inter-state vs intra-state GST logic** — no auto-detection based on GSTIN state.
8. **No GST reverse charge mechanism (RCM)** — no support for RCM on GTA, legal fees, etc.
9. **No HSN/SAC code on expenses** — makes GSTR-1 incomplete.
10. **No GSTR-2B reconciliation** — no matching against GST portal auto-drafted data.
11. **No 80:20 ITC rule** — no compliance check for works contract ITC restriction.
12. **No e-invoice/e-way bill UI** — service exists but no user interface.
13. **No TDS challan generation** — no challan creation or deposit date tracking.
14. **No GST return filing status** — no tracking of filed returns with ARN.
15. **No PF auto-calculation** — 12% of basic (employee + employer) not computed.
16. **No ESI auto-calculation** — 0.75% + 3.25% on gross not computed.
17. **No profession tax slab** — state-specific slab not applied.
18. **No TDS on salary calculation** — not auto-computed from annual income + tax regime.
19. **No Form 16** — no annual TDS certificate generation.
20. **No PF/ESI registration tracking** — no company-level registration numbers.
21. **No minimum wage validation** — no check against state minimum wage for trade.
22. **No RTGS minimum amount check** — ₹2 lakh minimum not validated.
23. **No cash transaction limit** — ₹10,000/day (269ST) and ₹10,000 payment (40A(3)) not enforced.
24. **No GST on subcontractor RA bills** — 18% GST on works contracts not captured.
25. **No PAN validation** — no validation of supplier PAN for TDS.
26. **No Form 26AS tracking** — no tracking of TDS appearance in supplier's 26AS.
27. **No retention release TDS** — TDS on retention release not handled.
28. **No GST on recurring expense templates** — generated drafts have 0 GST.
29. **No TDS on recurring expense templates** — generated drafts have 0 TDS.
30. **No cheque clearing tracking** — no cleared/bounced status for cheque payments.
