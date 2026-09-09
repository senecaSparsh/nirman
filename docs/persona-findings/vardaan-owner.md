# Persona Audit: Vardaan Kumar — OWNER, SRG REALCON

**Role:** OWNER (full access, all permissions — `permissions: "*"`)
**Phone:** 7017988293
**Company:** SRG REALCON (real estate development, India)
**Date of audit:** 2025

---

## Journey Narrative

I'm Vardaan Kumar, owner of SRG REALCON. I just logged into the Nirman Inventory OS platform. As OWNER, I have full access to everything. My goal is to:

1. Review my Command Center dashboard (landing page at `/`)
2. Find and approve pending purchase orders
3. Find and approve pending expenses
4. Review the financial dashboard (cash position, project P&L)

Here's my step-by-step journey through the actual codebase.

---

## Step 1: Command Center Dashboard (`/`)

### Files traced

- `apps/web/src/app/page.tsx` — Server Component, the landing page
- `apps/web/src/components/command-center.tsx` — Client component, the dashboard UI
- `apps/web/src/components/owner-financial-dashboard.tsx` — Owner-only financial section
- `apps/web/src/components/profile/profile-tabs.tsx` — QueueCard, OverviewCharts, IdentityStrip
- `apps/web/src/lib/use-dashboard-polling.ts` — 30s polling hook
- `apps/web/src/app/api/dashboard-counts/route.ts` — Polling endpoint

### What I see

The page (`page.tsx:43-504`) is a **role-adaptive dashboard** called "Command Center". It renders:

1. **PageHeader** (`page.tsx:455-459`): Title "Today", description showing my role + company + date. Stats show "Role: Owner", "Company: SRG REALCON", and either "Blocking: N" (red) or "Pending: N" (amber) or "Queue: Clear" (green).

2. **Owner Financial Dashboard** (`page.tsx:461-466`, `owner-financial-dashboard.tsx:31-180`): Only visible for OWNER/ADMIN. Shows:
   - **Cash Position card**: Cash/Bank balance, Receivables, Payables, Inventory value, and Net Cash Position. Links to `/gl`.
   - **Project Profitability card**: Total Revenue, Total Cost, Net Profit with margin %. Top 3 performing projects and bottom 3 needing attention. Links to `/finance`.

3. **Greeting line** (`command-center.tsx:74-93`): "Good morning/afternoon/evening, Vardaan. N things need you." with blocking count badge.

4. **KPI strip** (`command-center.tsx:96-104`, `348-413`): 4 KPI cards — POs (6 months), Low stock, Pending actions, Needs you. Uses Indian number formatting (₹, L, Cr).

5. **Attention queue** (`command-center.tsx:107-136`): Queue cards for each pending item type. Each card shows title, count, consequence text, and a CTA button (Review/Chase/Reorder/Convert/Order/Collect/Process/Sell). Cards link to their respective pages (`/approvals`, `/procurement`, `/materials`, `/requisitions`, `/sales`, `/stock?tab=counts`, `/units`).

6. **My Tasks panel** (`command-center.tsx:139`): Tasks assigned to me (limit 5).

7. **At a glance charts** (`command-center.tsx:142-146`, `profile-tabs.tsx:430-537`): Procurement trend bar chart (6 months), Stock health pie chart, Pending actions by type bar chart. Links to `/reports/purchase-trends`, `/materials`, `/approvals`.

8. **Profile section** (`command-center.tsx:148-341`): Collapsible "Your profile" with IdentityStrip (name, email, phone, avatar, member since), and expandable tabs for Access (role, permissions, capabilities, companies, project scope) and Activity (action breakdown, recent actions).

### What works

- ✅ **Owner Financial Dashboard is properly wired**: `page.tsx:177-217` fetches trial balance, projects, and inventory value. Cash position is computed from GL account codes (1000=cash, 1200=AR, 2000=AP). Project P&L uses `projectPnl()` service function. Data flows end-to-end.
- ✅ **Dashboard polling**: `use-dashboard-polling.ts` polls `/api/dashboard-counts` every 30s. The API (`dashboard-counts/route.ts`) returns fresh counts. Counts are merged over server-fetched item lists so the dashboard stays current without a full reload.
- ✅ **Queue cards are permission-aware**: Each queue is only shown if the user has the relevant permission (`canApprovePO`, `canApproveReq`, `canSeeStock`, etc.). OWNER sees all queues.
- ✅ **Indian number formatting**: `formatCurrencyShort` and `formatNumberShort` use ₹, L (lakh), Cr (crore) — correct for Indian context.
- ✅ **Self-approval prevention**: The PO approval API (`api/purchase-orders/[id]/route.ts:140-147`) prevents creators from approving their own POs. The approvals API (`api/approvals/route.ts:34`) filters out `createdById: { not: user.id }`.
- ✅ **Budget context on approvals**: The approvals API computes project budget, spent-to-date, remaining, and utilization % for each pending PO/requisition.

### What's broken or missing

#### 🔴 CRITICAL: `/approvals` page redirects to `/hr/pending` — the ApprovalsView component is DEAD CODE

- **File**: `apps/web/src/app/approvals/page.tsx:5-6` — `redirect("/hr/pending")`
- **Impact**: The dashboard queue cards (`page.tsx:275, 281`) and the "Review all" link (`command-center.tsx:113`) all point to `/approvals`. But `/approvals` immediately redirects to `/hr/pending`, which is a **completely different page** — an HR pending list (`hr/pending/page.tsx`) that shows DPRs, leave requests, draft payrolls, POs, requisitions, and tasks as **read-only links** with NO inline approve/reject buttons.
- **The `ApprovalsView` component** (`components/approvals/approvals-view.tsx:126-300`) is a fully-built approval queue with:
  - Search/filter
  - Individual approve/reject buttons per PO and requisition
  - Batch "Approve All" buttons
  - Budget context badges (exceeds budget, utilization %)
  - Urgency badges (overdue, due today, due this week)
  - Expandable line details for requisitions with stock/rate context
  - Post-approval "Order from Supplier" / "Convert to PO" next-step links
- **This component is NEVER imported or rendered anywhere** (grep confirms only 1 match — the definition itself). It's orphaned dead code. The `/api/approvals` and `/api/approvals/batch` APIs exist and work, but the UI that would use them is disconnected.
- **User impact**: When I click "Review" on a "Purchase orders to approve" queue card, I land on `/hr/pending` — a generic HR page. I see my POs listed as plain links to `/procurement`. I have to click through to `/procurement`, find the PO in the table, open it, and approve it there. The purpose-built approval queue with batch approve, budget context, and urgency sorting is invisible.

#### 🔴 CRITICAL: `/hr/pending` requires `HR_VIEW` permission — breaks for approval-only roles

- **File**: `apps/web/src/app/hr/pending/page.tsx:48` — `if (!hasPermission(role, PERM.HR_VIEW)) return <NoAccess what="the pending list" />`
- **Impact**: Any role with `PO_APPROVE` or `REQUISITION_APPROVE` but NOT `HR_VIEW` (e.g., PROCUREMENT_MANAGER has `REQUISITION_APPROVE` but not `HR_VIEW`) will hit a "No Access" page when clicking the dashboard's "Review" button. For OWNER this isn't an issue (full access), but it's architecturally broken.

#### 🟡 MEDIUM: Dashboard counts include self-created POs, but approvals API excludes them

- **File**: `api/dashboard-counts/route.ts:58` — `prisma.purchaseOrder.count({ where: { companyId: company.id, status: "DRAFT" } })` — no `createdById: { not: user.id }` filter.
- **vs**: `api/approvals/route.ts:34` — `where: { companyId: company.id, status: "DRAFT", createdById: { not: user.id } }`
- **Impact**: The dashboard may show "3 POs to approve" but when you navigate to approvals, only 2 show up (the 3rd was created by you and excluded). The count is misleading.

#### 🟡 MEDIUM: `/purchase-orders` redirects to `/procurement?tab=purchase-orders`

- **File**: `apps/web/src/app/purchase-orders/page.tsx:5-6`
- **Impact**: This works — the procurement page (`procurement-view.tsx:56-58`) uses `useTabParam` with "purchase-orders" as default. But the redirect adds a round-trip. Not broken, just slightly indirect.

#### 🟡 MEDIUM: `/expenses` redirects to `/finance?tab=expenses`

- **File**: `apps/web/src/app/expenses/page.tsx:5-6`
- **Impact**: Works — the finance page has an "expenses" tab (`finance-tabs.tsx:38`). But again, a redirect.

### What's confusing

- **"Review all" link** (`command-center.tsx:113`) says "Review all" and links to `/approvals`, but lands on a page titled "Pending List" under the People/HR world. The breadcrumb says "People > Pending List" — nothing about "Approvals". This is disorienting for an owner expecting an approval queue.
- **The "At a glance" section** has an "Approvals" link (`profile-tabs.tsx:452-454`) that also goes to `/approvals` → `/hr/pending`. Same dead end.
- **Queue card CTAs are inconsistent**: "Review" goes to `/approvals` (→ `/hr/pending`), but "Chase" goes to `/procurement`, "Reorder" goes to `/materials`, "Convert" goes to `/requisitions`. The "Review" CTA doesn't take you to the actual approval interface.

---

## Step 2: Finding and Approving Pending Purchase Orders

### Files traced

- `apps/web/src/app/approvals/page.tsx` — redirects to `/hr/pending`
- `apps/web/src/app/hr/pending/page.tsx` — HR pending list (where I land)
- `apps/web/src/app/procurement/page.tsx` — procurement page (where I have to go)
- `apps/web/src/components/procurement/procurement-view.tsx` — procurement tabs
- `apps/web/src/components/procurement/purchase-order-detail-panel.tsx` — PO detail with approve
- `apps/web/src/app/api/purchase-orders/[id]/route.ts` — PATCH approve/reject
- `apps/web/src/app/api/approvals/route.ts` — GET approval queue (unused by UI)
- `apps/web/src/app/api/approvals/batch/route.ts` — POST batch approve (unused by UI)

### What I see (actual journey)

1. I click "Review" on the "Purchase orders to approve" queue card → land on `/hr/pending`.
2. The `/hr/pending` page (`hr/pending/page.tsx:146-294`) shows sections: Overdue Tasks, DPRs Pending Approval, Leave Requests, Draft Payrolls, **Purchase Orders Pending Approval**, Indents Pending Approval, Upcoming Tasks.
3. The "Purchase Orders Pending Approval" section (`hr/pending/page.tsx:242-257`) shows each PO as a link with: PO number, supplier name, project name, total amount. Each links to `/procurement` (not even to a specific PO).
4. I click a PO → land on `/procurement` → I'm on the "Purchase Orders" tab → I have to find the PO in the table → click it → the `PurchaseOrderDetailPanel` opens (`purchase-order-detail-panel.tsx:23-93`).
5. In the detail panel, if the PO is in DRAFT status and I have `canApprove`, I see Approve and Reject buttons. Approve can include optional approval notes. The action hits `PATCH /api/purchase-orders/[id]` with `{ action: "approve" }`.

### What works

- ✅ **PO approval API is solid**: `api/purchase-orders/[id]/route.ts:138-148` checks `PO_APPROVE` permission, prevents self-approval, calls `approvePurchaseOrder()` service function, revalidates paths.
- ✅ **PO detail panel has full context**: Shows supplier info (with GSTIN), line items with GST rates, totals (subtotal, GST, freight, etc.), goods receipts, and payment history.
- ✅ **Post-approval flow**: After approving, the toast offers "Order from Supplier" action that navigates to `/procurement?po=<id>`.
- ✅ **Budget context**: The (unused) approvals API computes budget context — but this is invisible because the ApprovalsView is dead code.

### What's broken or missing

#### 🔴 CRITICAL: No dedicated approval queue UI — the ApprovalsView is orphaned

- The `ApprovalsView` component (`components/approvals/approvals-view.tsx`) is a complete, polished approval queue with batch approve, search, urgency badges, budget context, and expandable line details. It calls `/api/approvals/batch` for batch approve and `/api/purchase-orders/[id]` / `/api/requisitions/[id]` for individual actions. **But it's never rendered.** The `/approvals` route just redirects to `/hr/pending`.
- **Fix**: Either render `ApprovalsView` on the `/approvals` page (fetching data from `/api/approvals`), or remove the dead code and update all `/approvals` links to point to `/hr/pending` or `/procurement`.

#### 🔴 CRITICAL: `/hr/pending` PO links go to `/procurement` (generic), not to the specific PO

- **File**: `hr/pending/page.tsx:253` — `href: "/procurement"` — no PO ID in the URL.
- **Impact**: Clicking a pending PO on the pending list drops me on the procurement page with no context. I have to manually find the PO in the table. The procurement page does support `?po=<id>` to auto-open a PO detail (`procurement-view.tsx:375-379`), but the pending list doesn't use it.

#### 🟡 MEDIUM: No way to reject a PO from the procurement list view

- The procurement PO table (`procurement-view.tsx:112-113`) shows POs in a DataTable. You have to click a PO to open the detail panel to see approve/reject buttons. There's no inline reject in the table.

#### 🟡 MEDIUM: No batch approve in the procurement page

- The (dead) `ApprovalsView` has "Approve All" batch buttons that call `/api/approvals/batch`. The procurement page has no batch approve — you have to approve POs one by one.

### What's confusing

- **The journey from dashboard to approval is 4 clicks**: Dashboard → "Review" → `/hr/pending` → click PO → `/procurement` → find PO in table → click PO → detail panel → Approve. An owner approving 10 POs has to repeat this for each one.
- **The `/hr/pending` page title is "Pending List"** under the "People" world — nothing about this says "approvals" or "procurement". An owner looking for the approval queue would not intuitively look here.

---

## Step 3: Finding and Approving Pending Expenses

### Files traced

- `apps/web/src/app/expenses/page.tsx` — redirects to `/finance?tab=expenses`
- `apps/web/src/app/finance/page.tsx` — finance page with tabs
- `apps/web/src/components/finance/finance-tabs.tsx` — tab switcher
- `apps/web/src/components/expenses/expenses-view.tsx` — expenses table with approve/reject
- `apps/web/src/app/api/expenses/route.ts` — GET/POST/DELETE expenses
- `apps/web/src/app/api/expenses/[id]/route.ts` — PATCH submit/approve/reject

### What I see

1. From the dashboard, there's **no queue card for pending expenses**. The dashboard queues (`page.tsx:270-329`) cover: indents, POs, overdue POs, low stock, approved indents, approved POs, sales dues, stock counts, available units. **No expense approval queue.**
2. I navigate to `/finance` (Books world in the sidebar). The finance page (`finance/page.tsx:264-394`) shows:
   - **PageHeader** with stats: Inventory value, Unsold Assets, Revenue, Collected, Outstanding, Costs + Expenses.
   - **OutstandingActionCard** — if there's outstanding customer balance, shows a warning card with "View outstanding" and "Record Payment" links.
   - **FinanceTabs** with tabs: Overview, Supplier Invoices, Expenses, Claims, Petty Cash, Recurring, Budgets, Supplier Payments.
3. I click the "Expenses" tab → `ExpensesView` renders (`expenses-view.tsx:33-329`):
   - Filter bar: All projects, All categories.
   - Tabs: All, Drafts, Pending, Approved, Rejected (with counts).
   - DataTable with columns: Date, Category, Payee/Vendor, Mode, Amount (with GST breakdown), Status.
   - Row actions (icons): View receipt, Edit (drafts/rejected only), Submit for approval (drafts/rejected only), Approve (pending only), Reject (pending only), Delete.
4. I click the "Pending" tab to see expenses awaiting my approval. For each pending expense, I see the Approve (✓) and Reject (✗) buttons.
5. Clicking Approve calls `PATCH /api/expenses/[id]` with `{ action: "approve" }`. If the expense exceeds budget, the error toast offers "Override & Approve" (`expenses-view.tsx:128-135`).
6. Clicking Reject opens a dialog requiring a rejection reason (`expenses-view.tsx:298-327`).

### What works

- ✅ **Expense approval workflow is fully wired**: Draft → Submit → Pending → Approve/Reject. The API (`api/expenses/[id]/route.ts:107-156`) checks `EXPENSE_APPROVE` permission, calls `approveExpense()` / `rejectExpense()` service functions, revalidates paths.
- ✅ **Budget overrun handling**: If approval fails due to budget exceeded, the UI offers "Override & Approve" with `allowBudgetOverrun: true` (`expenses-view.tsx:128-135`). The API supports this (`api/expenses/[id]/route.ts:126`).
- ✅ **Rejection requires a reason**: Both UI and API enforce this (`api/expenses/[id]/route.ts:142-144`).
- ✅ **GST breakdown visible**: The amount column shows "incl. ₹X GST" when CGST+SGST+IGST > 0 (`expenses-view.tsx:454-459`).
- ✅ **GL posting on approval**: The toast says "Expense approved — GL posted" (`expenses-view.tsx:123`), and the API revalidates `/gl`.
- ✅ **TDS fields**: Expense schema has `tdsAmount`, and the expense form supports it. Supplier payments have `tdsAmount` and `tdsSection`.

### What's broken or missing

#### 🟡 MEDIUM: No expense approval queue on the dashboard

- The dashboard (`page.tsx:270-329`) has no queue card for "Expenses pending approval". An owner has to navigate to `/finance?tab=expenses` and filter to "Pending" to find them. This is a significant visibility gap — expenses awaiting approval can sit unnoticed.
- **Fix**: Add a queue card (urgency: "blocking") when `canApproveExpense && pendingExpenses.length > 0`, linking to `/finance?tab=expenses`.

#### 🟡 MEDIUM: No expense count in dashboard polling

- The `/api/dashboard-counts` endpoint (`dashboard-counts/route.ts`) doesn't fetch pending expense counts. Even if a queue card were added, the polling wouldn't include it.

#### 🟡 LOW: Expense claims, petty cash, and recurring expenses have no dashboard visibility

- The finance page has tabs for Claims, Petty Cash, Recurring, Budgets — none of these appear on the dashboard. Pending claims awaiting approval are invisible until you navigate to Finance → Claims.

### What's confusing

- **The "Expenses" tab on the finance page shows ALL expenses** (all statuses), not just pending ones. I have to click the "Pending" sub-tab to filter. There's no visual indicator on the tab itself that there are items awaiting my approval (no badge count).
- **Row action icons are small and unlabeled** — the approve (✓) and reject (✗) buttons are 3.5×3.5px icons with only tooltip text. For an owner who doesn't use the system daily, it's not obvious which icon does what.

---

## Step 4: Reviewing the Financial Dashboard

### Files traced

- `apps/web/src/app/page.tsx:172-217` — Owner Financial Dashboard data fetch
- `apps/web/src/components/owner-financial-dashboard.tsx` — Cash position + project P&L
- `apps/web/src/app/finance/page.tsx` — Finance page (full)
- `apps/web/src/components/finance/finance-view.tsx` — P&L table, money flow, audit log
- `apps/web/src/app/gl/page.tsx` — General Ledger page
- `apps/web/src/components/finance/gst-reports-panel.tsx` — GST reports
- `apps/web/src/components/finance/tally-sync-panel.tsx` — Tally integration
- `apps/web/src/components/finance/outstanding-action-card.tsx` — Outstanding dues card

### What I see

#### On the dashboard (`/`):

- **Cash Position card** (`owner-financial-dashboard.tsx:47-88`):
  - Cash/Bank: from GL account code 1000
  - Receivables: from GL account code 1200
  - Payables: from GL account code 2000 (shown as negative)
  - Inventory: from `materialInventoryValue()` service
  - Net Cash Position: Cash + AR - AP
  - Link to `/gl`
- **Project Profitability card** (`owner-financial-dashboard.tsx:91-177`):
  - Summary: Total Revenue, Total Cost, Net Profit, overall margin %
  - Top 3 performing projects (by profit, with revenue > 0)
  - Bottom 3 projects needing attention (by loss)
  - "View all N projects →" link to `/finance` if > 6 projects
  - Each project links to `/projects/[id]`

#### On the Finance page (`/finance`):

- **PageHeader stats** (`finance/page.tsx:266-277`): Inventory, Unsold Assets, Revenue, Collected, Outstanding, Costs + Expenses — each with a hint tooltip.
- **OutstandingActionCard** (`finance/page.tsx:278`): If outstanding > 0, shows a warning card with "View outstanding" and "Record Payment" links.
- **Overview tab** (`finance-view.tsx:20-223`):
  - **Project P&L tab**: DataTable with Project, Cost, Revenue, Profit, Margin columns. Sortable, exportable, with totals row. Row click navigates to project detail.
  - **Money Flow tab**: Unified timeline of project costs + expenses. Date-range filterable. Add Cost / Add Expense buttons.
  - **Audit Log tab**: System-wide audit trail with before/after diffs.
- **Other tabs**: Supplier Invoices, Expenses, Claims, Petty Cash, Recurring, Budgets, Supplier Payments.

#### On the GL page (`/gl`):

- **Trial Balance** (`gl/page.tsx:41-73`): All GL accounts with debit/credit/balance. Total debit vs total credit with balanced indicator.
- **GST Reports Panel** (`gst-reports-panel.tsx:11-222`): GSTR-3B Summary and GSTR-1 Details with date range, CSV export. Shows outward supplies, input tax credit (ITC), net GST payable.
- **Tally Sync Panel** (`gl/page.tsx:78`): For FINANCE_MANAGE roles — Tally integration stats.

### What works

- ✅ **Cash position is real**: Fetched from the actual trial balance via `trialBalance()` service function. Not a mock.
- ✅ **Project P&L is computed**: Uses `projectPnl()` service function per project. Revenue from sales, cost from land + materials + explicit costs.
- ✅ **GST reports are functional**: GSTR-3B (summary) and GSTR-1 (outward supplies detail) with date range filtering and CSV export. Properly handles CGST/SGST/IGST split.
- ✅ **Tally integration**: Sync panel exists for Tally export — critical for Indian accounting.
- ✅ **Audit trail**: Full before/after diff display for audit log entries.
- ✅ **Outstanding dues tracking**: The OutstandingActionCard proactively surfaces customer payment dues.
- ✅ **Double-entry bookkeeping**: The GL page description says "Every transaction posts a balanced journal entry automatically." Trial balance shows debit/credit totals with balanced indicator.

### What's broken or missing

#### 🟡 MEDIUM: Cash position uses hardcoded GL account codes

- **File**: `page.tsx:195-198` — `findBalance("1000")` for cash, `findBalance("1200")` for AR, `findBalance("2000")` for AP.
- **Impact**: If the chart of accounts is customized or uses different codes, the cash position will show 0 for those categories. The codes are not configurable.

#### 🟡 MEDIUM: Project P&L limited to 10 projects on dashboard

- **File**: `page.tsx:203` — `projects.slice(0, 10).map(async (p) => { ... })`
- **Impact**: If SRG REALCON has more than 10 projects, the dashboard only shows P&L for the first 10 (alphabetically). The rest are invisible until you go to `/finance`.
- **Reason**: Performance — `projectPnl()` is called per project. But 10 is an arbitrary limit.

#### 🟡 LOW: No cash flow forecast on the dashboard

- The nav has a "Cash Flow" report (`/reports/cash-flow`) described as "Projected inflows vs outflows per project — scheduled payments, commitments, RA bills, payroll." But it's hidden from the sidebar and not surfaced on the owner dashboard. For an owner, cash flow forecasting is critical.

#### 🟡 LOW: No balance sheet or P&L statement on the dashboard

- The nav has "Balance Sheet" (`/reports/balance-sheet`) and "Profit & Loss" (`/reports/profit`) reports, but both are hidden from the sidebar. The owner dashboard shows project-level P&L but not company-wide P&L or balance sheet.

### What's confusing

- **"Net Cash Position"** (`owner-financial-dashboard.tsx:82-86`) is Cash + AR - AP. This is a working capital metric, not actual cash. The label "Net Cash Position" could mislead an owner into thinking it's their bank balance. A label like "Net Working Capital" would be clearer.
- **Inventory value** in the cash position card uses `materialInventoryValue()` (moving average cost of stock on hand). But the finance page PageHeader also shows "Inventory" with the same value and a hint "Current value of material stock on hand, valued at moving average cost." The dashboard card has no such hint — just the number.

---

## Step 5: Navigation & Layout

### Files traced

- `apps/web/src/app/layout.tsx` — root layout
- `apps/web/src/components/app-shell.tsx` — app shell with sidebar
- `apps/web/src/lib/nav.ts` — navigation structure (4 worlds + settings)

### What I see

- **4 worlds in the rail**: Today (sun icon), Build (building icon), People (hard hat icon), Books (wallet icon).
- **Settings gear** at the bottom of the rail.
- **Build world** has 5 lifecycle sections: Acquire, Procure, Stock, Construct, Sell.
- **People world**: People Today, Employees, Attendance, Daily Progress, Pending List, Payroll.
- **Books world**: Cash & Expenses, Outstanding Dues, General Ledger, DPR-Finance Reconciliation, Audit Trail, GST, TDS Certificates.
- **Top bar**: breadcrumb, search field (⌘K command palette), company switcher, alert bell, notification bell, theme toggle, currency toggle.

### What works

- ✅ **Role-adaptive navigation**: `worldsFor(role)` filters sections by role. OWNER sees everything.
- ✅ **Badge counts**: The nav fetches badge counts per role via `badgeLinksFor(role)`. The "Pending List" link shows a badge from `/api/approvals`.
- ✅ **Company switcher**: Multi-company support with instant title update.
- ✅ **Command palette**: ⌘K search across all 144+ pages.
- ✅ **Currency toggle**: Compact (₹1.2L) vs Detailed (₹1,20,000) mode.

### What's broken or missing

- **The "Pending List" nav link** (`nav.ts:733-738`) has `badge: { endpoint: "/api/approvals" }` and links to `/hr/pending`. The badge counts POs + requisitions + gate passes from the approvals API, but the page it links to shows a broader HR pending list. The badge count may not match what's on the page (e.g., the badge counts gate passes, but `/hr/pending` doesn't show gate passes).

---

## Summary of Issues

### 🔴 Broken (Critical)

| #   | Issue                                                                                                                                                                       | File                      | Line |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---- |
| 1   | `/approvals` redirects to `/hr/pending` — the purpose-built `ApprovalsView` component with batch approve, budget context, and urgency sorting is DEAD CODE (never rendered) | `app/approvals/page.tsx`  | 5-6  |
| 2   | `/hr/pending` requires `HR_VIEW` permission — roles with `PO_APPROVE`/`REQUISITION_APPROVE` but not `HR_VIEW` hit "No Access" when clicking dashboard "Review"              | `app/hr/pending/page.tsx` | 48   |
| 3   | `/hr/pending` PO links go to `/procurement` (generic page) instead of `/procurement?po=<id>` (auto-open specific PO)                                                        | `app/hr/pending/page.tsx` | 253  |

### 🟡 Missing (Medium)

| #   | Issue                                                                                                                              | File                                          | Line    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------- |
| 4   | No expense approval queue on the dashboard — pending expenses are invisible until you navigate to Finance → Expenses → Pending tab | `app/page.tsx`                                | 270-329 |
| 5   | Dashboard counts include self-created POs (no `createdById` filter), but approvals API excludes them — count mismatch              | `api/dashboard-counts/route.ts`               | 58      |
| 6   | No batch approve in the procurement page — must approve POs one by one (the dead ApprovalsView had this)                           | `components/procurement/procurement-view.tsx` | —       |
| 7   | Cash position uses hardcoded GL account codes (1000, 1200, 2000) — breaks if chart of accounts is customized                       | `app/page.tsx`                                | 195-198 |
| 8   | Project P&L on dashboard limited to 10 projects (arbitrary)                                                                        | `app/page.tsx`                                | 203     |
| 9   | No expense count in dashboard polling API                                                                                          | `api/dashboard-counts/route.ts`               | —       |

### 🟢 Confusing (Low)

| #   | Issue                                                                                                                                                                  | File                                       | Line    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------- |
| 10  | "Review all" link on dashboard goes to `/approvals` → `/hr/pending` (titled "Pending List" under People world) — disorienting for an owner expecting an approval queue | `components/command-center.tsx`            | 113     |
| 11  | "Net Cash Position" label is misleading — it's working capital (Cash + AR - AP), not actual cash                                                                       | `components/owner-financial-dashboard.tsx` | 82      |
| 12  | Expense row action icons (approve/reject) are tiny unlabeled icons — only tooltip text explains them                                                                   | `components/expenses/expenses-view.tsx`    | 383-391 |
| 13  | "Pending List" nav badge counts gate passes but `/hr/pending` doesn't show gate passes — badge/page mismatch                                                           | `lib/nav.ts`                               | 737     |
| 14  | No cash flow forecast, balance sheet, or company-wide P&L on the owner dashboard — they exist as hidden reports but aren't surfaced                                    | `lib/nav.ts`                               | 806-898 |

### 🇮🇳 India-Specific Gaps

| #   | Issue                                                                                                                                                                                                                                                                                        | Status  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 15  | **RERA compliance** — ✅ Well covered. Project schema has `reraNumber`, `reraRegistrationDate`, `reraValidityDate`, `reraWebsiteUrl`. Legal documents include `RERA_REGISTRATION` type. Built units have RERA carpet area fields. Sales track BBA (Builder-Buyer Agreement) number and date. | ✅ Good |
| 16  | **GST** — ✅ Well covered. GSTR-1 and GSTR-3B reports with CGST/SGST/IGST split. ITC tracking. Expense and PO schemas have GST fields. CSV export for filing.                                                                                                                                | ✅ Good |
| 17  | **TDS** — ✅ Well covered. Expense schema has `tdsAmount`. Supplier payments have `tdsAmount` and `tdsSection`. TDS certificate report (Form 16C, Section 194C) exists. Subcontractor work orders handle TDS and retention.                                                                  | ✅ Good |
| 18  | **Tally integration** — ✅ Present. Tally sync panel on GL page.                                                                                                                                                                                                                             | ✅ Good |
| 19  | **e-Way Bill** — ✅ Goods receipts track `ewayBillNumber`.                                                                                                                                                                                                                                   | ✅ Good |
| 20  | **Bank SMS parsing** — ✅ Sales page has a "Bank SMS" tab that auto-parses bank payment SMS and matches to outstanding sales/rents.                                                                                                                                                          | ✅ Good |
| 21  | **RERA validity expiry alerts** — 🟡 The schema tracks `reraValidityDate` but there's no dashboard alert or notification when RERA registration is nearing expiry. The legal documents page tracks expiry for NOCs/licenses but RERA validity is on the project itself.                      | 🟡 Gap  |
| 22  | **GST return filing reminders** — 🟡 The GST reports panel generates reports but there's no reminder/alert for filing due dates (GSTR-1 is due on the 11th, GSTR-3B on the 20th of each month).                                                                                              | 🟡 Gap  |
| 23  | **Project-wise GST tracking** — 🟡 GST reports appear to be company-wide, not project-wise. For a developer with multiple projects in different states (inter-state vs intra-state), project-wise GST tracking would be important.                                                           | 🟡 Gap  |
| 24  | **Stamp duty & registration charges** — 🟡 Not tracked as a separate cost head. These are significant costs in Indian real estate transactions (5-8% of sale value).                                                                                                                         | 🟡 Gap  |

---

## Recommendations (Priority Order)

1. **🔴 Wire up the ApprovalsView on `/approvals`** — The component exists, the APIs exist, the data is there. Just render `ApprovalsView` on the `/approvals` page instead of redirecting to `/hr/pending`. Fetch data from `/api/approvals` (which already returns POs, requisitions, and gate passes with budget context and urgency). This single fix would:
   - Restore the purpose-built approval queue with batch approve
   - Show budget context and urgency badges
   - Provide inline approve/reject without navigation
   - Fix the dashboard "Review" → dead end flow

2. **🔴 Fix `/hr/pending` PO links** — Change `href: "/procurement"` to `href: "/procurement?po=${po.id}"` so clicking a pending PO auto-opens its detail panel.

3. **🟡 Add expense approval queue to the dashboard** — Add a queue card for pending expenses (urgency: "blocking") when `canApproveExpense && pendingExpenses.length > 0`. Add pending expense count to `/api/dashboard-counts`.

4. **🟡 Fix dashboard count mismatch** — Add `createdById: { not: user.id }` filter to the draft PO count in `/api/dashboard-counts` to match the approvals API.

5. **🟡 Surface cash flow forecast on the owner dashboard** — The `/reports/cash-flow` report exists but is hidden. Add a summary card or link on the owner financial dashboard.

6. **🟡 Add RERA validity expiry alerts** — Check `reraValidityDate` on projects and surface expiring registrations on the dashboard or legal documents page.

7. **🟢 Rename "Net Cash Position" to "Net Working Capital"** — Or add a tooltip explaining it includes receivables and payables.
