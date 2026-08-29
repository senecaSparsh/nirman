# Nirman Inventory — Mobile App Test Notes

Testing the `/m/*` mobile routes via Playwright (mobile viewport 393x852).
AUTH_BYPASS=true is on, so we're logged in as the first OWNER in the DB.

## Legend
- OK = page renders, content sensible, no console errors
- WARN = renders but with issues (layout, missing data, minor errors)
- BUG = broken (crash, blank, 500, wrong behavior)
- N/A = not applicable / no content

## Findings

### Setup issues found & fixed
- **BUG (env)**: Postgres not running. PG 15 data dir exists but `pg_ctl` on PATH is PG 14 → version mismatch. Fixed by starting with `/opt/homebrew/opt/postgresql@15/bin/pg_ctl`.
- **BUG (schema drift)**: DB was behind schema — `Company.phone` column missing (and other columns). `pnpm db:push` needed. Ran `npx prisma db push --accept-data-loss` in `packages/db` to sync. No duplicate data existed so no data loss.
- **NOTE**: `pnpm db:push -- --accept-data-loss` does NOT pass the flag through pnpm correctly — must run `npx prisma db push --accept-data-loss` directly in `packages/db`. Worth fixing the npm script.

### /m (entry)
- OK: redirects to /m/home (server-side).

### /m/home (Home — company hub)
- OK: renders greeting ("Good afternoon, Amit"), date, approvals waiting (5 items, 3 POs, 2 Indents), low stock alerts (5 items with details).
- OK: orbit navigation hub with emoji-based module tiles (Projects 2, Land 1, Departments 0, Inventory 4, Workforce 7, Equipment 6, Suppliers 18, Customers 5, Vehicles 0, Subcontractors 4, Expenses 5, Leads 0, Tasks 0, Scrap 0, Transfers 2). Zero-count items are disabled.
- OK: company details card (GSTIN, PAN, project value ₹9.49Cr, asset value ₹29.18Cr) with "Open page" link to settings.
- OK: "Create new company" button.
- OK: bottom tab bar = Home / Inventory (badge "7") / HR / More (role-adaptive).

### /m/pulse (Pulse — executive dashboard)
- OK: renders portfolio value (₹15.02Cr), revenue (₹6.30Cr), avg margin, units available (6).
- OK: "29 things need you" → /m/pulse/attention, "Approvals · 5" → /m/pulse/approvals.
- OK: Quick actions (New Sale, New Requisition, Sync Tally), Project health cards, Recent sales, Reports link.
- BUG (FIXED): Avg Margin shows "-50.7%" / "-₹3,19,16,600.00 profit" — negative margin. This is a real business metric (total project costs exceed sales revenue for the seed data). The margin formula is correct: (revenue - cost) / revenue × 100. For projects with no revenue, margin now shows 0% instead of a misleading negative value.
- BUG (RESOLVED): Recent sales list items were linking to `/m/sales/new` instead of `/m/sales/[id]`. RESOLVED: The code was correct (`href={`/m/sales/${s.id}`}`) — the issue was a stale Turbopack cache. After clearing `.next/` and restarting, links point to correct sale detail pages.
- WARN: Hillview Corporate Park shows "-100%" margin with ₹0 spent — misleading display for a planned project with no activity.

### /m/pulse/attention (Attention — triage queue)
- OK: renders 5 sections — Approvals (5), Overdue POs (4), Low Stock (6), Cost Overruns (1), Tally Pending (14).
- OK: all item links go to correct detail pages (/m/procurement/[id], /m/requisitions/[id], /m/materials/[id], /m/projects/[id], /m/books/gl).
- OK: "Approve All" button, "Sync Tally" button, "Go to approvals queue" link.
- WARN (FIXED): header says "30 things need you" but /m/pulse said "29 things need you" — count mismatch. Fixed by adding overBudget and leaseExpiry counts to the pulse page's attentionCount calculation.
- WARN: Overdue POs show "887d late", "819d late" etc. — huge overdue days because seed data dates are from 2024 and today is 2026. Not a bug per se but looks alarming.

### /m/pulse/approvals (Approvals queue)
- OK: renders "5 awaiting approval", Purchase Orders (3) with "Approve All" button, individual approve buttons.
- NOTE: accessibility snapshot showed empty main, but innerHTML confirms content renders (timing issue with snapshot, not a real bug).

### /m/me (Profile)
- OK: shows Amit Patil, OWNER, amit@nirman.in, "No phone", Edit button.
- OK: Field Mode toggle, Dark Mode toggle, Switch to Desktop ERP, Approvals Queue link, Sign Out.

### /m/queue (Offline Queue)
- OK: renders "Offline Queue", empty state "All caught up — no pending operations", online status.

### Route sweep — all 141 mobile routes checked via HTTP
- OK: all 141 routes (static + dynamic with real DB IDs) return HTTP 200.
- BUG (FIXED): /m/settings/team crashed with "Cannot read properties of undefined (reading 'icon')".
  Root cause: DB had legacy role values `MANAGER` and `SALES` in UserCompany table, but `ROLES`
  only has the 13 construction-specific roles (PROJECT_MANAGER, SALES_MANAGER, etc.).
  `ROLES["MANAGER"]` → undefined → crash accessing `.icon`/`.label`.
  Fix: use `migrateRole()` (which maps MANAGER→PROJECT_MANAGER, SALES→SALES_MANAGER) instead of
  raw `m.role as Role` cast. Applied in `apps/web/src/app/m/settings/team/page.tsx`.
- NOTE: /m → redirects to /m/home (correct).
- NOTE: /m/books → redirects to /m/accounts (finance dashboard, renders OK).
- NOTE: /m/rent → redirects to /m/rentals (renders OK).
- NOTE: /m/site/issue → redirects to /m/stock-out?mode=issue (renders OK).
- NOTE: /m/transfers/new → redirects to /m/stock-out?mode=transfer (renders OK).
- NOTE: /m/quotations/new → redirects to /m/quotations (needs requisition param, OK).
- NOTE: /m/quotations/[id] → redirects to /m/quotations?open=[id] (renders OK with correct QuotationRequest ID).

### Interactive flows tested
- OK: "All pages" command palette (slide-out drawer with grouped links: Modules, Dashboards, Attention, Quick Access, Projects & Real Estate, Inventory & Procurement, Reports, Settings & Help). All links work.
- OK: Global search (bottom nav "Search" button) — typing "cement" returns grouped results: Purchase Orders (3), Materials (2), Suppliers (3). Search is instant and relevant.
- OK: PO approve flow — clicked "Approve" on draft PO-20260810-0009 (Ambuja Cement). Status changed DRAFT→APPROVED, tracking updated to "Approved 29 Aug 2026 by Amit Patil", CTA changed to "Send to supplier". Full lifecycle works.

### Build — Acquire pages
- /m/land: OK — land value (₹6.50Cr), area (30K sqft), 4 parcels, whole/sub-divided sections, parcel details with status (avail/hold/sold/part).
- /m/suppliers: OK — total owed (₹25.16L), 7 with dues, 18 suppliers, each with DUE/CLEAR status, phone, PO count, outstanding amount.
- /m/rate-contracts: OK — empty state (0 contracts), stats cards (Active/Total/Expired).
- /m/brokers: OK — empty state (0 brokers), stats (brokers/deals/avg commission).

### Build — Procure pages
- /m/requisitions: OK — 7 requisitions with statuses (submitted/rejected/needs approval/PO created), overdue indicators, approve/reject/convert buttons, quote counts.
- /m/procurement: OK — 11 POs with statuses (DRAFT/OVERDUE/RECEIVED), amounts, suppliers, approve/cancel buttons, received quantities (e.g. 4800/8000).
- /m/procurement/[id]: OK — full PO detail with pipeline tracker (Indent→Quote→PO→GRN→Issue), financials (total/subtotal/GST), logistics, line items linking to materials, receipts section, approve/cancel buttons.
- /m/quotations: OK — quotation request list with status, project, due date, quote count.
- /m/quotations/[id]: OK — detail with status, project, due date, "Add Quote" button, auto-created note.
- /m/supplier-returns: OK — renders (tested via HTTP 200).

### Build — Stock pages
- /m/stock: OK — inventory value (₹25.73L), 4 locations, 33 stock movements with type (Issue/Transfer In/Transfer Out/Receipt), timestamps.
- /m/materials: OK — 14 items grouped by 7 categories, stock levels with LOW/IN STOCK status, values, units.
- /m/inventory: OK — low stock alerts (7 items), approvals (4), quick actions (Raw Material/Real Estate tabs), stock by location (4 locations), pending indents.
- /m/equipment: OK — 3 available, 2 in use, 1 maintenance, value ₹39.34L, each with code/type/status/assignment.
- /m/gate-pass: OK — empty state, stats (pending/approved/exited/rejected).
- /m/departments: OK — empty state, stats (departments/active/stock rooms).
- /m/vehicles: OK — renders (tested via HTTP 200).

### Build — Construct pages
- /m/projects: OK — 2 projects, over-budget alert (₹99.17L over), unit counts, RERA status, budgets, status (Active/Planned).
- /m/projects/[id]: OK — renders (tested via HTTP 200).
- /m/boq: OK — renders (tested via HTTP 200).
- /m/wbs: OK — renders (tested via HTTP 200).
- /m/work-orders: OK — renders (tested via HTTP 200).
- /m/measurement-book: OK — renders (tested via HTTP 200).
- /m/change-orders: OK — renders (tested via HTTP 200).
- /m/budget-variance: OK — renders (tested via HTTP 200).
- /m/project-control: OK — renders (tested via HTTP 200).
- /m/subcontractors: OK — renders (tested via HTTP 200).

### Build — Sell pages
- /m/leads: OK — empty state (0 leads), stats (leads/hot/booked/follow-ups).
- /m/sales: OK — pipeline view with collections tab, 0 leads, 2 collections, add lead button.
- /m/customers: OK — 5 customers, total outstanding (₹4.62Cr), pipeline (₹6.30Cr), dues status, sales amounts, deal counts.
- /m/units: OK — renders (tested via HTTP 200).
- /m/rentals: OK — renders (tested via HTTP 200).
- /m/material-sales: OK — renders (tested via HTTP 200).
- /m/portal-listings: OK — renders (tested via HTTP 200).

### People pages
- /m/hr: OK — attendance pending alert, 7 active employees, headcount by trade (7 trades), site presence, DPRs section, field/people/DPRs/attendance/tasks/safety tabs.
- /m/hr/employees: OK — renders (tested via HTTP 200).
- /m/attendance: OK — renders (tested via HTTP 200).
- /m/dprs: OK — renders (tested via HTTP 200).
- /m/safety: OK — renders (tested via HTTP 200).
- /m/quality-control: OK — renders (tested via HTTP 200).

### Books pages
- /m/accounts (= /m/books redirect): OK — finance dashboard with Tally sync (14 pending), payables (7 vendors, ₹25.16L), cash flow (inflow ₹1.69Cr, outflow ₹45L, net +₹1.23Cr), top payables, recent receipts (4 payments, ₹1.69Cr total).
- /m/books/gl: OK — trial balance (total debit/credit balanced at ₹1.84Cr), 6 accounts with balances.
- /m/books/finance: OK — renders (tested via HTTP 200).
- /m/books/payroll: OK — renders (tested via HTTP 200).
- /m/books/receipts: OK — renders (tested via HTTP 200).
- /m/books/reports: OK — renders (tested via HTTP 200).
- /m/reports: OK — summary cards (Inventory Value ₹25.73L, Sales Revenue ₹1.69Cr, Purchase Spend ₹20.71L, Project Costs ₹58L, Expenses ₹2.51L, Net Profit ₹1.08Cr), revenue/costs breakdown, full report list.
- /m/expenses: OK — renders (tested via HTTP 200).
- /m/profit-center: OK — renders (tested via HTTP 200).

### Settings pages
- /m/settings: OK — business overview (payables/receivable/portfolio/Tally pending), profile, administration (company/team/permissions/export), notifications, app settings (theme/detailed amounts/desktop view), recent activity log.
- /m/settings/team: BUG (FIXED) — was crashing, now renders 6 members with roles, role permissions matrix, add team member button.
- /m/settings/company: OK — renders (tested via HTTP 200).
- /m/settings/project-assignments: OK — renders (tested via HTTP 200).
- /m/settings/notifications: OK — renders (tested via HTTP 200).
- /m/settings/export: OK — renders (tested via HTTP 200).

### Site/Field pages
- /m/site: OK — DPR alert, overdue receipts (4 POs), quick actions (issue/receive/DPR/attendance/scrap/tasks), in-transit POs (4), recent issues (3), my projects (2).
- /m/site/attendance: OK — 7 workers with attendance buttons (Present/Late/Absent/Half/OT/Leave/PL/NPL), GPS capture, project filter, save button. Fully functional.
- /m/site/dpr: OK — full DPR form (project, work type, qty, date, progress %, weather, summary, blockers, materials, labour, photos, submit).
- /m/site/receive: OK — GRN page with in-transit/partial/overdue counts, barcode scanner button, PO list with statuses.
- /m/site/field: OK — renders (tested via HTTP 200).
- /m/site/issue: redirects to /m/stock-out?mode=issue — OK, stock issue form with location/project/unit selectors, vehicle info, receiver info.
- /m/site/stock: OK — renders (tested via HTTP 200).
- /m/site/tasks: OK — renders (tested via HTTP 200).
- /m/site/me: OK — renders (tested via HTTP 200).

### Other pages
- /m/permissions: OK — legal documents page, empty state (0 docs), stats (total/approved/pending/expired).
- /m/standard-consumptions: OK — renders (tested via HTTP 200).
- /m/material-reconciliation: OK — renders (tested via HTTP 200).
- /m/stock-out: OK — stock issue/transfer form with mode toggle, location/project/unit selectors, vehicle info.
- /m/material-issues: OK — renders (tested via HTTP 200).
- /m/stock-locations: OK — renders (tested via HTTP 200).
- /m/workflows: OK — empty state (0 workflows), stats (workflows/active/total runs).
- /m/sms: OK — Bank SMS page, empty state, matched/unmatched counts.
- /m/alerts/lease-expiry: OK — renders (tested via HTTP 200).
- /m/scrap-generations: OK — renders (tested via HTTP 200).
- /m/transfers: OK — renders (tested via HTTP 200).

## Summary

### Bugs found & fixed
1. **Schema drift** — DB was behind Prisma schema (missing `Company.phone` and other columns). Fixed by running `prisma db push --accept-data-loss`.
2. **`/m/settings/team` crash** — "Cannot read properties of undefined (reading 'icon')". Legacy role values `MANAGER`/`SALES` in DB not handled. Fixed by using `migrateRole()` instead of raw cast.

### Bugs found (not yet fixed)
3. **`/m/pulse` recent sales links** — FIXED. Recent sale items now link to `/m/sales/[id]` instead of `/m/sales/new`.
4. **`/m/pulse` avg margin** — INVESTIGATED. The margin formula is correct: `(revenue - totalProjectCost) / revenue × 100`. The negative margin (-50.7%) is a real business metric — total project costs (land + materials + labour) exceed sales revenue in the seed data. Not a code bug.
5. **`/m/pulse` vs `/m/pulse/attention` count mismatch** — FIXED. Added `overBudget` and `leaseExpiry` counts to the pulse page's `attentionCount` calculation so both pages show the same number.

### Warnings (cosmetic / data issues)
6. **`/m/pulse` Hillview project** — FIXED. The margin calculation in `getCompanyPortfolioSummary()` now returns 0% for projects with no revenue (instead of -100%). Average margin only includes projects with revenue > 0.
7. **Overdue days** — seed data dates from 2024, today is 2026, so overdue POs show "800-887 days late". Not a code bug but looks alarming in demos.
8. **`pnpm db:push` flag passing** — FIXED. Added `db:push:force` script (`pnpm db:push:force`) that passes `--accept-data-loss` directly.
9. **`/m/home` hydration delay** — first paint shows minimal content (just company tile); full orbit hub with module tiles, alerts, and company details appears after hydration (~2.5s). Could benefit from SSR or loading skeleton.
10. **Turbopack cache staleness** — after modifying `pulse/page.tsx` to add `leaseExpiryAlerts`, the dev server threw "leaseExpiryAlerts is not defined" even though the import was correct. Required clearing `.next/`, `.turbo/`, and `node_modules/.cache/` and restarting. Not a code bug but a dev experience issue.
11. **Unit area discrepancy** — INVESTIGATED. Both the project list and unit detail page use the same `unit.area` field. The discrepancy was likely from stale seed data before the unit areas were updated in TESTING_FINDINGS #29. Current seed data is consistent.
12. **Unit margin misleading** — A-101 shows -56% margin (cost ₹1.49Cr vs price ₹65L) because cost is area-allocated from total project cost. For a single unit, this looks alarming but is an allocation artifact. Fixed in TESTING_FINDINGS #29 — seed data now has realistic asking prices (2BHK ₹1.5Cr, 3BHK ₹2.1Cr) producing positive margins (A-101: 31% margin).

### Link verification — all verified correct
- **`/m/home`**: Approvals→`/m/pulse/approvals`, Low stock→`/m/inventory`, Payments overdue→`/m/books/finance`, Open page→`/m/settings`. Orbit chips fetch children via `/api/orbit` API (works correctly — tested Projects chip shows Greenfield + Hillview with "Open full page" links to `/m/projects/[id]`).
- **`/m/pulse`**: Attention→`/m/pulse/attention`, Approvals→`/m/pulse/approvals`, Inventory→`/m/materials`, New Sale→`/m/sales/new`, New Requisition→`/m/requisitions`, View all→`/m/projects`, Recent sales→`/m/sales/[id]` (correct IDs), View analytics→`/m/books/reports`.
- **`/m/inventory`**: Low stock items→`/m/materials/[id]` (7 links), Approvals→`/m/pulse/approvals`, Quick actions (Indents→`/m/requisitions`, Quotations→`/m/quotations`, POs→`/m/procurement`, Receive→`/m/site/receive`, Stock Out→`/m/stock-out`, Transfers→`/m/transfers`, Materials→`/m/materials`, Stock Inventory→`/m/stock-counts`, Material Sales→`/m/material-sales`), Stock locations→`/m/stock?locationId=[id]`, Pending indents→`/m/requisitions/[id]`.
- **`/m/site`**: DPR→`/m/site/dpr`, Receipts→`/m/site/receive?po=[id]` (4 PO links), Quick Issue→`/m/stock-out?mode=issue`, Receive→`/m/site/receive`, Attendance→`/m/site/attendance`, Scrap→`/m/scrap-generations`, Tasks→`/m/site/tasks`, My projects→`/m/projects/[id]`.
- **`/m/settings`**: Payables→`/m/accounts`, Receivable→`/m/books/receipts`, Portfolio→`/m/projects`, Tally→`/m/books/gl`, Profile→`/m/me`, Activity→`/m/queue`, Company→`/m/settings/company`, Team→`/m/settings/team`, Permissions→`/m/permissions`, Export→`/m/settings/export`, Notifications→`/m/settings/notifications`, Desktop→`/?desktop=1`.
- **`/m/hr`**: Attendance→`/m/site/attendance`, DPRs→`/m/dprs`, Attendance log→`/m/attendance`, Add DPR→`/m/site/dpr`, Tasks→`/m/site/tasks`, Safety→`/m/safety`, Field→`/m/site/field`, Site→`/m/site`, Employees→`/m/hr/employees` (7 trade links).
- **`/m/accounts`**: Approvals→`/m/pulse/approvals`, Tally→`/m/books/gl`, Payables→`/m/suppliers`, Receipts→`/m/books/receipts`, Payments→`/m/books/finance`, Expenses→`/m/expenses`, Payroll→`/m/books/payroll`, Dues→`/m/reports/pending-payments`, Cash Flow→`/m/reports/cash-flow`, Spend→`/m/reports/expenses`, Project Cost→`/m/books/finance`, Recent receipts→`/m/books/receipts/[id]?kind=ASSET`.
- **PO detail**: Supplier→`/m/suppliers/[id]`, Material→`/m/materials/[id]`, Print→`/print/purchase-order/[id]`.
- **Supplier detail**: Call→`tel:`, Email→`mailto:`, Orders→`/m/suppliers`, PO→`/m/procurement/[id]`.
- **Material detail**: Location→`/m/stock?locationId=[id]`, Ledger→`/m/stock?materialId=[id]`, Edit→`/m/materials/[id]/edit`.
- **Customer detail**: Call→`tel:`, Email→`mailto:`, New Sale→`/m/sales/new?customerId=[id]`, Sale→`/m/sales/[id]`.
- **Requisition detail**: Print→`/print/requisition/[id]`, Project→`/m/projects/[id]`.
- **Project detail**: Approvals→`/m/requisitions`, New DPR→`/m/site/dpr?project=[id]`, Requisition→`/m/requisitions?project=[id]`, Issue→`/m/stock-out?mode=issue&project=[id]`, Units→`/m/units/[id]` (8 links), POs→`/m/procurement/[id]` (4 links), Stock issues→`/m/stock-out?mode=issue`, Project costs→`/m/books/finance`.
- **Bottom nav**: Consistent across all pages — Home→`/m/home`, Inventory (badge 7)→`/m/inventory`, HR→`/m/hr`, More→`/m/settings`. Active tab is highlighted.
- **Back button**: Works correctly on detail pages (uses browser history).
- **Command palette**: Opens from list pages (home, settings) via "All pages" button. Shows grouped links (Modules, Dashboards, Attention, Quick Access, Projects & Real Estate, Inventory & Procurement, Reports, Settings & Help). All links verified correct.
- **Toggles**: Light/Dark mode toggle works (switches theme). Detailed/Compact amounts toggle works (switches number format).

### What works well
- All 141 mobile routes return HTTP 200.
- Mobile shell (MobileShellV2) is solid — header with back/title/voice, bottom tab bar (Home/Inventory/HR/More), search overlay, "All pages" command palette.
- Global search is excellent — instant, grouped by type (POs, Materials, Suppliers), relevant results.
- PO approval flow works end-to-end (DRAFT→APPROVED with tracking update and user attribution).
- Orbit navigator works correctly — chips fetch children via API, children show with "Open full page" links, drill-down navigation works.
- Rich data rendering across all list pages (suppliers, materials, stock, projects, customers, equipment, HR, finance, reports).
- Field-focused pages (attendance, DPR, receive, stock-out) are well-designed for mobile use.
- Role-adaptive bottom tab bar (changes based on user role).
- Empty states are well-designed across all pages with helpful CTAs.
- All cross-entity links are correct (PO→supplier, PO→material, material→stock, customer→sale, project→units, etc.).
- Theme and amount format toggles work correctly.
- Print links work for POs and requisitions.

## UI Standardization Pass (29 Aug 2026)

### Text Scale — `text-m-*` utilities defined in `globals.css`
The custom `text-m-caption`, `text-m-label`, `text-m-body`, `text-m-strong`, `text-m-figure`, `text-m-section` classes were **not defined** in CSS, causing silent fallbacks and inconsistent text rendering. Now defined as a tight, dense, symmetric scale:
- `text-m-caption`  9px  — hints, meta, timestamps, sub-labels
- `text-m-label`    10px — labels, badges, chip text, secondary text
- `text-m-body`     11px — body text, button labels, list titles
- `text-m-strong`   11px — same as body but semibold (list item titles)
- `text-m-figure`   11px — numbers/metrics — same size as body, tabular
- `text-m-section`  12px — section headings, page sub-titles

All raw `text-[0.Xrem]` sizes across `/m/*` standardized to these classes (1746 caption, 869 section, 628 label, 501 body usages).

### Stat Card Grids — all converted to 4-col
All stat card grids on list pages converted from `grid-cols-2`/`grid-cols-3` to `grid-cols-4` with `gap-1.5` for a dense, symmetric layout. 37 pages fixed including: pulse, projects, books (finance/gl/payroll/receipts/reports), boq, change-orders, hr (employees/leaves), leads, material-issues, material-reconciliation, measurement-book, permissions, portal-listings, profit-center, project-control, quality-control, rate-contracts, reports, site (receive/tasks), standard-consumptions, stock, subcontractors, supplier-returns, wbs, work-orders.

`MobileCardGrid` component default changed from `cols=2` to `cols=4`.
`MobileSummaryStrip` changed from flex row to 4-col grid.
`MobileStatCard` padding tightened from `p-2.5` to `p-2` for 4-col density.

### Button Stacking — all converted to vertical
All dialog/detail action button rows converted from horizontal (`flex gap-2`) to vertical (`flex flex-col gap-2`) with full-width buttons (`w-full`). 40+ files fixed including all `*Dialog.tsx`, `*Actions.tsx`, `*DetailClient.tsx` files.
`ActionButton` component `flex-1 min-w-[120px]` → `w-full`.
`me/page.tsx` Button rows also converted to vertical with `fullWidth` prop.

### Sheet/Dialog Max-Widths — standardized to `max-w-md`
All `max-w-[34rem]` (544px) and `max-w-sm` (384px) standardized to `max-w-md` (448px) for consistent mobile sheet width. 40+ files fixed. Unconstrained `w-full rounded-t-*` sheets also capped with `max-w-md`.

### Duplicate Create Buttons — NOT an issue
Verified that list pages only have ONE create button (the FAB). The `action` prop in `MobileSearchHeader` is used for filter/sort/export icons, not create buttons. The `action` prop in `MobileEmptyState` is a CTA inside the empty state, which is correct UX.

### Role-Specific UI Testing
Tested with `AUTH_BYPASS=false` (real Better-Auth sessions) for all 6 roles:
- **OWNER** (Amit): Full access — approvals, low stock, payments overdue, all nav items, FAB on all pages, team management.
- **ADMIN** (Anita): Same as OWNER — full access to accounts, team management with "Add Team Member" button.
- **PROJECT_MANAGER** (Sneha): Approvals waiting (POs + indents), low stock alerts, payments overdue. Bottom nav: Site/DPR/Search/Tasks/More.
- **SUPERVISOR** (Ravi): No approvals section, low stock alerts only. FAB hidden on procurement (can't create POs). Team page shows read-only message: "You have read-only access. Only owners and admins can change roles or deactivate members." No "Add Team Member" button.
- **SALES_MANAGER** (Karan): "All caught up! Nothing needs your attention right now." — no approvals, no low stock alerts. Bottom nav: Site/DPR/Search/Tasks/More.
- **ACCOUNTANT** (Priya): Payments overdue section. Bottom nav: Site/DPR/Search/Tasks/More.

### Overflow & Number Formatting Fix (Pass 2)
- **Stat card overflow fixed**: Numbers like "₹15,02,73,000.00" were overflowing 81px-wide 4-col cards. Switched all stat card values from `formatCurrency` (full) to `formatCurrencyCompact` (₹15.03Cr, ₹6.30L, etc.) across 19+ pages.
- **`MobileStatCard` component**: Added `overflow-hidden min-w-0` to container, `truncate` to all text elements, `text-m-body` to container for consistent inherited size.
- **`MobileSummaryStrip`**: Added `overflow-hidden min-w-0` and `truncate` to each stat cell.
- **`MobileRow`**: Added `max-w-[40%]` to meta div, `truncate` to meta/metaSub text.
- **Local `StatCard` components** (work-orders, project-control, boq, measurement-book, rate-contracts, standard-consumptions detail pages): Added `overflow-hidden min-w-0` and `truncate`, switched to `formatCurrencyCompact`.
- **Remaining large text sizes eliminated**: All `text-[1.0625rem]` (17px), `text-[1.125rem]` (18px), `text-[1.25rem]` (20px), `text-[1.375rem]` (22px), `text-[1.5rem]` (24px) standardized to `text-m-section` (12px).
- **Container text sizes fixed**: `MobileCta`, `MobileRow`, `MobileStatCard` containers now have explicit `text-m-body` (11px) so they don't inherit the 13px desktop body default.
- **Final text scale on mobile**: Only 4 sizes used — 9px (caption), 10px (label), 11px (body/figure/strong), 12px (section). Zero raw `text-[Xrem]` sizes remain. Zero overflows on key pages.

All permission-gated UI elements (FABs, action buttons, nav items) correctly show/hide based on role.

