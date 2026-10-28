# Design Review: Nirman Inventory OS

**Date**: 2026-10-26
**URL**: http://localhost:3000 (dev), sweeps across desktop + mobile surfaces

## Overall Impression

Consistently professional — this is well past "developer-designed". Uniform card radii, one icon family (Lucide), semantic colour tokens, tnum figure alignment, and empty states that explain themselves. The sweep found a handful of genuine symmetry defects, all now fixed.

## Findings — Fixed

### High

- **Today: Cash Position dead space** at `/` — the 2×2 stat grid used `justify-between` on sparse content, leaving a hollow middle while the adjacent Project Profitability card was packed. Stat cells now flex-grow + center vertically; both cards read at equal density. (commit `ed9e0ff8`)
- **Mobile Accounts: lone straggler tile** at `/m/accounts` — 5 persona-filtered tiles rendered 4+1 (one tile dangling in a mostly-empty row). The column picker only handled the `%3==0` case. Now picks the column count with the fullest last row (5→3+2, 7→4+3, 9→3+3+3) and gives ≤4 tiles an exact-width row. (commit `1b5b0787`)

### Medium

- **WO detail: scope-table header collision** at `/work-orders` dialog — `table-fixed` + colgroup (sum 540px) inside a ~450px dialog collapsed the Description column to zero; its header text overflowed into "BOQ RATE"/"AGREED". `min-w-[620px]` makes the table scroll horizontally instead. (commit `e809e272`)
- **Change Orders: unlabeled line-item inputs** at `/change-orders` dialog — 5 crammed inputs, description truncated to "Descript", qty/rate showed bare "0" placeholders. Added a labeled column header on the same grid template + rebalanced widths. (commit `1056ed2f`)
- **DPR table: 3-line date wrap** at `/dprs` — the narrow DATE column split "Oct 24, 2026" across three lines; every row tripled in height. `whitespace-nowrap` keeps dates single-line. (commit `575cb815`)
- **Employees table: name column squeezed** at `/hr/employees` — 11 columns overflow the viewport; auto-layout shrank NAME to min-content (~90px) so "Anurag Garg / Civil Head" wrapped 3–4 lines. Nowrap on name+designation lets the column hold its declared 200px; rows are uniform height. (commit `680bbf4b`)
- **Equipment: double-negative depreciation label** at `/equipment` — rows where currentValue exceeded acquisitionCost rendered "-110% down". Label is now sign-aware ("N% up" / "at cost"). (commit `d0f9d28a`)
- **Rentals: TOTAL row contradicted KPI** at `/rentals` — footer summed all rows' monthlyRent (₹1.60L incl. a cancelled tenancy) while the header KPI counted ACTIVE only (₹1.20L). Added a `sumValue` column option to DataTable so cancelled rows display their historical rent but contribute 0. (commit `eb734a16`)

### Backend integrity (found via UI)

- **Empty indents were submittable** — mobile approvals showed "0 lines" indents; `submitRequisition` validated status but never counted lines. Transaction now refuses `_count.lines === 0`; four zero-line seed rows cleaned. Tests in `requisition-submit.test.ts`. (commit `4cda300e`)

## Findings — Verified OK (not defects)

- **Diagonal watermark on HR/Finance pages** — "Vardaan Kumar · 26 Oct 2026" tiled pattern is an intentional screenshot deterrent on sensitive data (wages, gov IDs). Consistent and subtle.
- **Mobile orbit navigator** — radial module menu is symmetric by construction.
- **Empty states** — centered, icon + title + next-step copy + CTA everywhere checked (Work Orders, Measurement Book, lease alerts).
- **Site Ops grid** at `/m/site` — 5 tiles now render 3+2 via the fixed column picker (verified live).
- **Mobile DPR list** — date-grouped cards with approval-chain progress + manpower gauges; symmetric.
- **Field dashboard DPR-lock banner** — explains _why_ locked + path forward + Snooze. Best-in-class UX.
- **Project detail** — 7-cell KPI strip + RERA escrow card + tabbed sections; dense but disciplined.
- **Gate Passes** — 4-stat strip, single-line dates, vehicle/destination alignment. `/gate-passes`
- **Vendors** — dues color-coded (red owed / muted settled), stale "yesterday" flagged. `/suppliers`
- **Equipment** — status-grouped sections with aggregate subtotals in group headers; depreciation % sub-labels. `/equipment`
- **My Tasks** — uniform task cards, consistent Start/Complete button pair. `/my-tasks`
- **Mobile Attendance** — one prominent "Check in now" CTA + centered empty state. `/m/attendance`
- **Reports hub** — lifecycle-grouped cards, each with plain-language "what it answers" copy. `/reports`
- **Inventory Value report** — symmetric bar+donut pair at equal heights, aligned exports, share-% column. `/reports/inventory-value`
- **GRN / Field Receiving** — offline-mode banner + cash-purchase escape path in empty state. `/field`
- **Petty Cash (Finance)** — forecast banner, outstanding-dues alert with dual CTAs, uniform float cards with Spend/Top Up pairs. `/finance?tab=petty-cash`
- **Transfers tab** — route arrows "Central → Site", status badges, uniform rows. `/stock?tab=transfers`
- **BOQ empty state** — explains the section→subsection→line-item build path + Add Section CTA. `/boq`
- **Mobile Stock** — status-colored card borders (amber low / red out / green ok), per-location breakdown. `/m/stock`
- **Offline Queue** — Online status chip + explains what lands here. `/m/queue`
- **Mobile approval action flow** — tap row → inline detail (dates/duration/reason) → Approve/Reject/Snooze; service rejections surface as toasts (verified: overlap guard error displayed verbatim). `/m/approvals`
- **Purchase Orders** — List/Board toggle, per-row green receipt-progress bar, TOTAL footer. `/procurement?tab=purchase-orders`
- **Material Sales** — status badge trio (Active/Returned/Partially) + payment pill per row; profit column signed. `/material-sales`
- **Real Estate Inventory** — 4 equal stat cards + Plots strip + per-project table. `/reports/real-estate-inventory`
- **Safety Management** — 4-stat strip, tab count badges, severity pills (FIRST AID/Near Miss). `/safety`

## What Looks Good

- **KPI strips** — equal-cell stat ribbons (HR 4-up, DPR 6-up, Sales 8-up, Stock 3-up) are perfectly regular everywhere.
- **Today attention cards** — uniform icon + title + count + "why" copy + action button + 3-row preview + "+N more". Every card identical structure.
- **At a glance** — Procurement trend chart + Stock health donut at equal heights, full-width "Pending actions" bar chart below.
- **Tables** — consistent header styling, TOTAL footer rows, dual action buttons aligned right (Stock: Adjust/Count), badges uniform.
- **Notifications panel** — grouped "Needs attention"/"Recent", count badges, per-row mark-read.
- **GL page** — "Books are balanced" green banner, trial-balance Dr=Cr figures, ⚠ flags on negative-balance anomalies.
- **Responsive split** — below ~1024px the app routes to the dedicated `/m/*` mobile surface rather than squishing the desktop layout. No broken tablet state.

## Top 3 Fixes (landed)

1. Today Cash Position card fills its height symmetrically with Profitability.
2. Mobile quick-action grids never strand a lone tile.
3. Table text no longer wraps mid-phrase (DPR dates, employee names) — uniform row heights.

## Defect class to watch

Every fix this session shares one root cause: **content squeezed below its natural width** — auto-layout shrinking table columns to min-content (dates, names), `table-fixed` colgroups exceeding their container (WO scope), grids stranding lone tiles (quick actions). Guard pattern: any `table-fixed` + `<colgroup>` or overflow-hidden cell needs `min-w-*` (horizontal scroll) or `truncate`/nowrap discipline. The second recurring class: **a number on one surface disagreeing with the same number elsewhere** — Low Stock tab vs Today (minStock vs reorderPoint), Rentals TOTAL vs KPI (all-rows vs active-only). Cross-check aggregates against their source predicates.

## Remaining Nitpicks (Low — deferred)

- Notification panel doesn't close on outside-body click in the corner case observed (Escape/backdrop works) — verify.
- "₹40,00,000" for the equipment sale notification is correct Indian grouping; no issue.
- Equipment & Fixtures shows -₹43.51L flagged ⚠ — likely a test-data artifact (asset sold without book-value split); books still balance. Worth an accounting spot-check, not a design issue.

## Round 5 — Books pipeline + fixture hygiene (Oct 26)

### Fixes landed

- `repair-books-dev.sh`: §2a marker sweep targeted nonexistent `LeaveApplication` — now `LeaveRequest`, and bare `reason='wf'` seeds are matched (was only `wf %`/`wf-%`). 54 accumulated leave fixtures removed.
- `repair-books-dev.sh`: extended sweep to issue/payroll/land-chain fixtures — `isoh%`/`isd%` empty shells (guarded by no-dependents), `wlp-%` LandPurchase cascades, `glce%` employees (cascade), `glcp%`/`wlp-%` projects (escrow-guarded). Removed 55 empty shells + 16 fixture employees + 28 fixture projects + 13 orphan JEs; books stayed reconciled (gap 0).
- `verify-workflows-full.sh`: pre-seed cleanup of prior `wf` leaves on the test employee — the random leave window could hit a leftover APPROVED leave and correctly fail the approve check (1 flake eliminated; suite now 83/83).

### Verified clean

- Money Flow: date-sorted, category+hint labels, signed amounts, date-range + quick-add.
- Audit Log: human-readable actions, entity links, field-level diffs, desc time order.
- Statutory: symmetric 4+2 cards, per-card hints (ECR ↓, ITC available), remittance ledger.
- Outstanding Dues `/reports/pending-payments`: symmetric Payable/Receivable aging charts, 4+4 stat grid, tab counts; receivable ₹25L ties to the Finance overview card exactly.
- DPR-Finance Reconciliation: honest ₹0 for narrative-only DPRs (0 material/0 labor lines verified in DB).
- Claims: claimant+project, line counts, status pills.
- GL/Stock/Vendors/Equipment/Gate Passes/Transfers/BOQ/Settings (earlier rounds): aligned, TOTAL rows consistent.

### Consistency rule confirmed

Cross-surface numbers reconcile: Receivables ₹25L = Finance "outstanding" card = "1 sale with pending balance". GL 1300 = stock value after fixture sweep.

## Round 6 — Mobile + cross-surface consistency (Oct 26)

### Fixed

- **`/m/reports` Outstanding inflated by TDS** — computed `booked − received` globally, counting TDS-withheld amounts as customer dues (₹26.80L shown vs ₹25L real). Now sums per-sale `price + GST − collected − TDS`, same basis as pending-payments. Verified live: ₹25L on both surfaces.
- **`verify-workflows-full.sh` leave flake** — prior runs' APPROVED `wf` leaves could overlap a new run's random window → correct rejection read as a failure. Pre-seed cleanup added; suite now **83/83** (was 82/83).
- **`repair-books-dev.sh` LeaveRequest gap** — §2a swept nonexistent `LeaveApplication`; real `LeaveRequest` rows with bare `reason='wf'` now match. 54 accumulated fixtures removed; clp/issue/payroll/land chains verified swept end-to-end after fresh verify runs.

### Verified clean

- `/m/sales` — live activity ticker, 4+3 tile grid (pickCols fix holds), stage badges, score, Call action; test leads flow from desktop.
- Mobile lead form — sectioned bottom-sheet (Contact/Project/Budget/Follow-up), required gating works (`disabled` until name+phone), defaults prefilled; Ramesh Patel created end-to-end.
- `/m/site/attendance` — payroll-lock UX exemplary: explains _why_ locked, offers adjustment path, disables save + day-worker entry consistently.
- `/reports/pending-payments` — symmetric aging charts, receivable ties to finance card.
- Inventory Value ₹37.2K consistent mobile↔desktop (earlier ₹34.4K reading was pre-rebuild cache).

### Data-integrity note

`repair-books-dev.sh` now covers every known verify-script fixture family (vfy/hrc ids, wf-markers, isoh/isd/glcp/wlp/glce prefixes) and leaves books reconciled — dev DB stays production-plausible after every verify run.

## Round 7 — Pending List badge parity + People surfaces (Oct 26)

### Fixed

- **`/hr/pending` missing 5 badge-counted types** — sidebar badge summed 10 actionable types (via `/api/approvals?countOnly=1`) but the page rendered only 5; a pending RA bill (RA-261024-0003, ₹46.5K) showed on the badge with no row to act on. Added sections for RA bills, expenses, expense claims, advance requests, and punch-fix requests — each query mirrors its `actionableApprovalCounts` where-clause exactly (permission gate, scope, self-approval). Also aligned DPRs (sub-admin sees SUBMITTED, admin sees SUB_ADMIN_APPROVED, own submissions excluded) and leaves (HR_MANAGE gate). Verified live: badge 2 = Awaiting approval 2, RA bill row renders. Commits `8db60e5f` + `30abe277` (rows now deep-link `/approvals`, the surface with act buttons, instead of read-only lists).
- **"₹0/sqft" artifact on DPRs + Profit Center** — `Decimal(0)` is truthy so stored-zero cost/sqft leaked through the `?:` null guard. Same `> 0` convention as budget-utilization now applied at the mapping layer; profit-center cards show "—" + "No sellable area set". Commit `d6889075`.
- **28 `wf task` fixtures** — task-timer verify seeds accumulated on My Tasks; added `Task:title` to repair sweep markers (children cascade). Commit `965abdf1`.

### Verified clean

- `/hr/employees` (stat cards, wage badges) + Crews tab (same pattern, honest zeros)
- `/my-tasks` + Team Tasks kanban (4-column board, overdue badges, consistent 4 = sidebar)
- `/calls` — Total/Missed/Talk-time strip, direction icons, filter row
- `/dprs` — 6-card approval-tier strip, progress bars, % of budget flags
- `/approvals` — canonical queue: badge's 2 items render with full deduction math (gross − retention − TDS = net), waiting-on hints, expandable lines, Reject/Approve

## Round 8 — Project-picker defaults + WO/MB fixture sweep (Oct 26)

### Fixed

- **Empty-project first impression on every project-scoped page** — pickers sorted `name: asc` put zero-data "Godrej Park" first; Work Orders, Measurement Book, WBS, and BOQ all opened on empty states while every row lived in "apex center". A first-time user could conclude the system has no data. Pickers now order by relation count desc, then name — verified live: /work-orders opens on apex center's 5 WOs + summary strip tying to Subcontractors (₹71.50L / ₹59.5K). Commit `112b700d`.
- **`/m/hr/pending` same gap as desktop** — parallel mobile implementation missed gate passes, RA bills, expenses, claims, advances, punch-fix. Same actionable semantics; rows link `/m/approvals`. Verified: total 5 = 4 overdue + 1 gate pass. Commit `bc91a5a1`.
- **Pending rows linked to read-only lists** — RA bill → /work-orders project picker (wrong project default!), expenses/claims → read-only finance tabs. All now → `/approvals` where act buttons live. Commit `30abe277`.

### Fixture hygiene

- `repair-books-dev.sh` + `SubcontractorWorkOrder` chain sweep: 'chain verify:_' / 'Attribution probe' / 'ra chain verify' / WO-RA-_ WOs (cascades RA bills+lines), probe/chain MB entries (incl. workOrderId-orphaned ones by description), RA-VFY-* BOQ items (Restrict-guarded). Removed: 8 WOs, 9 RA bills+lines, 9 MB entries, 19 BOQ items, 2 orphan JEs — GL stayed reconciled. Commits `45a23540` + `73f9d95b`.

### Verified clean

- `/subcontractors` — header ₹71.50L work done / ₹59.5K retention = table TOTAL exactly
- `/quality-control` — 4-card strip, CAPA tag inline
- `/workflows`, `/wbs`, `/measurement-book` — self-explaining empty states (honest zeros where no data)
- `/change-orders` — "Approved" stat counts APPROVED∪IMPLEMENTED correctly; TOTAL +₹5.0K ties
- `/m/approvals` — mobile queue mirrors badge (1 awaiting = gate pass)

## Round 9 — Books Health repair + console-error resolution (Oct 27)

### Fixed

- **WIP GL vs cost pool FAIL (−₹89K on apex center)** — two PAID payrolls (11/2025, 1/2026) had their PAYROLL_PAYMENT JEs and labour-allocation ProjectCost docs but the gross-expense JE was missing (earlier sweep residue), and two "Attribution probe" RA-bill ProjectCost docs (₹50K) survived their deleted bills. Re-posted both payroll JEs through the real `postPayroll` service (JE-20261027-00029/30; gross 26K → WIP 19.5K apex + expense 6.5K, credits to Salaries Payable matching sibling-seed convention), deleted the orphan docs, re-ran `reallocateProjectCosts` (apex totalProjectCost 638.4K→588.4K, fixing the newly-surfaced unit-cost FAIL). **All 19 checks PASS** except the designed `account-signs` WARN (₹1.8K customer credit from paid-then-returned sales + ₹43.5L seed equipment noise — flags working as intended). Commit `8c029910`; one-off script kept at `packages/services/scripts/restore-payroll-jes.ts`.
- **`repair-books-dev.sh` orphan-doc sweep** — ProjectCost rows whose 'RA Bill RA-####-####' reference no longer exists are now swept (probe/chain WO cascades delete bills but not these docs).

### Resolved (not app defects)

- **Recurring console error on every page: `429 /monitoring`** — Sentry's own ingest endpoint throttling the dev session, proxied through the tunnel route. Dev config runs `tracesSampleRate: 1.0` with a live DSN, so ~40 pages of audit spam envelopes past quota. Fire-and-forget telemetry — zero user impact; production samples at 0.1. No code change.
- **Payroll "0 draft" vs dashboard "8 draft"** — resolved by the vfy-period sweep (the 8 drafts were far-future verify shells; page was correct).

### Round 9 addendum — tenant-isolation audit + more fixture sweeps (Oct 27)

- **Cross-tenant leaks closed (commit `11ac4fd9`)** — `scopeWhere()` returns `{}` at COMPANY scope, so any query on the 19 companyId-less models without an explicit anchor leaks every tenant's rows. Audited all ~700 `scopeWhere` call sites: real leaks were `/build` (units 91/109 → real 16/8), `/hr/pending` task lists, the assistant's task response, and orbit's `User.companyId` anchors (default company only → misses multi-company memberships). All other sites verified anchored via company-bearing relations.
- **P&L margin artifact (commit `0c6cfce7`)** — "−21807.0%" on ₹4K revenue → em-dash, same convention as ₹0/sqft guards.
- **Fixture sweeps extended (commits `3582803f` + earlier)** — `verifier-float-*` petty-cash floats + their auto-approved expenses; `verifier claim`/`Idempotency audit` expense claims. 6+2 orphan JEs swept; books reconciled to ₹0 gap.

### Verified clean this round

- `/health-books` — 19 checks all PASS; only designed `account-signs` WARN (real customer credit + seed equipment)
- `/build` — pipeline stage cards now count this company only
- `/stock` on-hand (₹37.2K ties to mobile), `/materials` catalog (low-stock badge 3 = stock page)
- `/procurement?tab=purchase-orders` — ₹802 PO, 100% received, total ties
- `/finance` expenses/claims/petty-cash/recurring/budgets/supplier-payments tabs — all consistent post-sweep
- `/reports` index (21 reports, lifecycle-grouped) + `/reports/balance-sheet` (balanced ✓, negative accounts flagged honestly) + `/reports/profit` (margin artifact fixed)
- `/sales` customers+pipeline tabs — 3 real customers, 4 real leads, totals tie
- `/settings` — full company identity + procurement config surface
- Route sweep: all real routes 200; `/properties`/`/companies`/`/notifications`/`/audit-log` 404s are correct (param/mobile-only paths), `/expenses`/`/goods-receipts`/`/requisitions`/`/purchase-orders` correctly redirect into hub tabs

### Round 9b — mobile surface sweep + notification debt (Oct 27)

- **Pulse sold-units inconsistency (commit `a7575097`)** — exec dashboard said "1 sold" vs Units page's 8. `getPortfolioSummary` counted `_count.assetSales` (sale docs) while the detail view + Units page count `BuiltUnit.status=SOLD`. Seed units were marked SOLD without sale transactions — doc count is the wrong unit measure. Summary now filters by status like the detail path.
- **Notification bell buried (commit `7cb857ea`)** — every verify run notifies watchers; 20,331 notifications pointed at already-swept entities. `repair-books-dev.sh` §2b-2 now validates `metadata.entityType`/`entityId` against live tables (same resolution as §2b JEs) and removes dead links. Live-entity notifications are real history — kept; the user-facing "mark all read" clears the unread badge (verified: unread 0).
- **Mobile verified clean**: `/m/pulse` (portfolio ₹33.56Cr/8 active, all stat cards tie), `/m/pulse/attention` (Approvals 1 = gate pass, Low stock 3 = reorder breaches, Cost overruns 1 = apex +187%), `/m/queue` (honest offline-queue empty state), `/m/site/field` (cash-purchase escape hatch documented), `/m/expenses` (₹3.9K/3 ties to desktop post-sweep), `/m/stock` (₹37.2K/7 items ties; LOW/OUT 5 = 3 reorder + 2 zero-stock, honestly labelled), `/m/material-issues` (status filter tabs + values render).
- **Not-a-defect**: mobile LOW/OUT 5 vs desktop "Low stock 3" — mobile counts reorder breaches + zero-stock items, desktop counts reorder breaches only; each label describes what it counts.

### Round 10 — mobile list-page consistency (Oct 27)

- **Search-row convention unified** — material-issues, departments, stock-locations were the last pages still using `filterChips` (second-row chips + full-width search). All now use the shared `MobileFilterIcon` action cluster (`99dab03d`), then the full 4-control cluster matching expenses: status filter + sort + export/share (`002321ce`, `30e4cbe8`).
- **Project grouping on material-issues** (`75bbe8de`) — counted section headers ("apex center · 38 issues"), same pattern as DPR date groups.
- **Compact header on material-issues** (`f814d74e`) — description line + full-width value card → `MobileSummaryStrip`; search row now lands at y=139, identical to expenses.
- **Header-depth audit** — measured search-row top offset across all list pages: dprs 83, materials 85, expenses/material-issues 139, gate-pass 161, safety 185, units 202, projects 309, quality-control 311. The >200px ones carry real content (over-budget banner, portfolio card, inspection queue) — judged legitimate, not defects.
- **Dev server stall diagnosed** — Turbopack wedged (health endpoint timing out, near-idle CPU), masking several commits as "unchanged" to the user. Killed PID; wrapper respawned healthy. Documented gap in `AGENTS.md` — the wrapper catches crashes, not CPU-bound compile stalls.
- **Route sweep**: all 35 real `/m/*` routes render 200 with real content or honest empty states. Earlier 404s were guessed-URL artifacts (`/m/payroll`→`/m/hr`, `/m/purchase-orders`→`/m/procurement`), not dead links.

### Round 11 — visual symmetry pass (Oct 27)

- **Duplicate "+" glyph collision fixed (`386aaa2d`)** — the nav centre DeptFab ("More departments" fan) and every page's create FAB both rendered `Plus` — two identical icons, unrelated actions. DeptFab now swaps `LayoutGrid`/`X`; "+" unambiguously means "create" app-wide.
- **False alarms verified, not defects**: clipped bottom-left nav label = Next.js dev-tools badge (dev only); `/m/sales` "Pipeline" appearing twice = quick-actions module grid tab vs inner leads tab (coincidental naming); `/m/stock-out` bottom bar overlapping nav = deliberate (comment documents why — old position let the centre FAB cover submit); tall headers on projects/quality-control = real content (over-budget banner, inspection queue); `PageLead` description lines auto-hide after N visits (onboarding by design).
- **All 9 main list pages screenshotted side-by-side** — expenses, stock, material-issues, material-sales, gate-pass, units, sales, rentals, pulse — consistent dark theme, nav, strip, row, card conventions.
- **Detail + form verified** — `/m/material-issues/[id]` (status timeline, stat tiles, paired buttons), `/m/stock-out?mode=issue` (mode cards, route swap, receiver/vehicle sections, sticky CTA).

### Round 12 — symmetry continuation (Oct 27)

- **RegisterTabs label crush fixed (`122c7d88`)** — `/m/accounts` 8-tab row squeezed labels into collisions ("Petty CashPayments"). Tab row now holds a 4.5rem/tab floor and scrolls horizontally past it; equal widths preserved so the sliding underline math is unchanged. Few-tab pages render identically to before.
- **Verified symmetric**: notifications list, attention queue (hero + category chips + grouped sections — best-composed page), offline queue, filter/sort dropdowns, issue detail, stock-out form, sales/units/rentals/pulse grids.
- **Residual known-noise**: duplicate "Payroll Zero Gross" notifications (legit warnings about seeded zero-rate payroll drafts — data, not UI).

### Round 12b — symmetry continuation (Oct 27)

- **Verified**: expense detail (rows + tracking timeline + documents — same convention as issue detail), work-orders (status tiles + card meta grid), `/m/requisitions` → procurement hub redirect (clean empty state), `/m/requisitions` earlier blank = cold-compile lag not a defect.
- **Create FABs** navigate to entity forms (no modal) — consistent behavior across list pages.

### Round 13 — detail/form symmetry (Oct 27)

- **Verified**: work-order detail (status stepper Draft→Issued→Active→Completed→Closed, financial 4-tile, terms/timeline cards, paired Pay Advance/Complete CTAs), expense detail, issue detail, stock-out form — all follow the shared detail-page conventions.

### Round 14 — create-form + detail verification (Oct 27)

- **Verified**: `/m/expenses/new` (sectioned cards, paired fields, Save Draft │ Submit CTAs), work-order detail, material-sales grid + activity feed — all follow shared form/detail conventions.
- **Fixture noise noted**: material-sales activity feed repeats created/returned-sale rows — dev-verify residue, not a UI defect.

## Round 15 — Print/document surface sweep (25 doc types)

**Covered:** material-sale invoice, issue slip, purchase order, goods-receipt
challan, material-sale receipt (money receipt), sale invoice/allotment letter,
sale-draft LOI, sale-statement, gate pass, measurement book, supplier-payment
voucher, stock-transfer note, stock-count sheet, scrap note, payslip,
offer/appointment/agreement letters, employee ID card, escrow statement,
unit-spec sheet, direct-purchase voucher.

**FIXED — functional bug (all 27 doc pages):** `PrintToolbar` Image + Share
used `node.closest(".print:hidden")` — `:hidden` is a jQuery pseudo-class, so
closest() threw SyntaxError inside html-to-image's filter; the catch silently
fell back to window.print(). Image/Share never produced a file. Now
`classList.contains("print:hidden")`. Verified: real 175KB PNG at 2x with
toolbar excluded. Commit 70ece1f3.

**Verified consistent:** shared chrome (Print/PDF/Image/Share/Close toolbar,
`print:hidden`), SRG REALCON letterhead + GSTIN, black doc-type badge + doc
number + date, two-party boxes (FROM/BILL TO, ISSUED TO/FROM STORE etc.),
Sr./Description/HSN/Qty/Rate/Amount tables, right-aligned Subtotal/GST/Grand
Total blocks, Amount in Words italic, Terms & Conditions, symmetric signature
lines. Gate pass adds warning banner; money receipt adds amount-received
highlight + account summary + progress bar + payment history; ID card renders
true 85×54mm front/back with QR + print instructions.

**Not renderable in demo company (no entity):** demand-notice (0 eligible
schedule items — the 7 PaymentScheduleItems belong to another company),
tenancy-draft (0 tenancies), requisition (0 indents). Their 404s are correct
behavior, not bugs — verified by reading the notFound paths.

**Data-quality note (not visual):** money-receipt payment history shows 3
rows summing ₹2.6K while "Total Received" reads ₹1.2K — likely a
refunded/reversed row in seed data; math is self-consistent with the ₹531
balance. Payslip demo data is all-₹0 (no salary structure configured for the
owner persona). Both are fixture artifacts.

## Round 16 — Dialog/mutation flows

**Payment flow (real mutation, verified end-to-end):** mobile material-sale
detail → Payment → bottom sheet (balance banner, prefilled Pay-in-full, mode
select, ref no, cheque fields, Cancel/Record pair) → POST
`/api/material-sales/:id/payments` → `MaterialSalePayment` row (₹224 CASH
RECEIVED) → balance ₹224 → ₹0. Sale status PARTIALLY_RETURNED is a goods
state (partial return), not a payment state — correct.

**Adjust Stock dialog (desktop):** title carries material code+name+unit,
Add/Remove segmented toggle (green active), location select with project
context, current-balance + moving-avg-cost info box, paired Qty/Unit-Cost
with "Defaults to ₹9" helper, required Reason with audit-trail hint,
Cancel/Add pair. Production-grade.

**Test-harness note:** the detail-page payment dialog's submit reads "Record"
(the list-level variant reads "Record Payment") — not a bug, just a label
difference between the two components. Both submit real POSTs.

### Round 16 addendum — stock-adjustment mutation verified

Desktop Adjust Stock on BRICK-RED/Godrej Park Site: +5 nos with reason
"Dogfood verify +5" → POST `/api/materials/:id/adjust-stock` →
`StockLocationItem.qty` 1900→1905 AND `StockMovement` row
`ADJUSTMENT_IN | 5 | Dogfood verify +5 | MANUAL_ADJUSTMENT` — audit trail
matches the dialog's helper text verbatim. CTA label is dynamic
("Add nos" → "Add 5 nos" once qty is entered) — good detail.
Two real mutations now proven end-to-end (payment + stock adjust):
dialog → validation → API → DB → audit row.

## Round 17 — Export/share system + real mutations

**CSV export (client-side):** `/m/material-issues` → Export icon → Download
CSV → real `material-issues-2026-10-28.csv` with **38 rows — exact tie with
the summary strip's "38 Issues"**. Headers proper, Indian dates, ₹ values,
BOM for Excel.

**Server exports via /api/export** (18 types supported): verified real files —
trial-balance 8.5KB, gstr3b 7.2KB, **tally-xml 140KB**, issue-register,
inventory-value, pending-payments, purchase-register — all valid xlsx/xml.

**FIXED — PF-ECR empty file:** zero PF-eligible rows downloaded a 5-byte
blank file; operator would discover it on the EPFO portal. Now 404s like the
missing-period branch, naming the employees missing UAN (6 demo names
surfaced). Commit af218e53.

**Mutations proven end-to-end:** material-sale payment ₹224 →
MaterialSalePayment row + balance cleared; stock adjust +5 →
StockLocationItem.qty + StockMovement audit row. Full stack: dialog →
validation → API → DB → audit.

## Round 18 — Settings + user-management surfaces

**Verified excellent:** `/settings` hub (sidebar: My Profile/Company
Settings/Who Sees What/Backup/Feedback/Telephony; tabs: Company/Users/
Locations/Cost Centres/People/Companies/Integrations/Notifications; real
config: LCI threshold, PO approval thresholds, approval aging, books-lock
date). Users tab: 21-member table with inline role dropdowns, unit, code,
status badges, 6 action icons; Custom Roles card; "Who can do this"
permission reverse-lookup; **Create User = proper 3-step wizard**
(Profile → Access Scope → Review) with inline role descriptions and
paired fields.

**FIXED — duplicated dialog title:** Bulk Import rendered "Bulk Import
Employees / Upload a CSV…" twice — once in the Dialog frame, again in the
body. Removed inner copy, kept Template button. Commit 3a879586. Grepped
all `<Dialog title=` usages for the same pattern — this was the only one.

**Dev-server note:** /settings cold compile pushed next-server to 110% CPU
for ~2min, health timed out once, then self-recovered (compile finished,
health 200 in 72ms). Same known Turbopack dev gap — not app code.

## Round 19 — Mobile settings + change-orders + route-redirect check

**`/m/settings` (More hub):** business-overview cards with color-coded
edges (payables ₹15.2K / receivables 1 sale / portfolio ₹33.56Cr / Tally
pending 173), profile card, administration rows — consistent with the
mobile card conventions.

**Redirects confirmed intentional:** `/m/settings/team` → `/m/hr/employees`
(mobile team management lives in the HR hub); `/m/settings/company` →
company details elsewhere. Not defects — but they repeatedly surfaced as
"cold compile timeouts" in scripted sweeps because the redirect target
compiles on first hit.

**`/change-orders` (desktop):** stat tiles (3/1/1), filter row
(status/search/Columns/CSV/Save View/Views/New CO), typed rows
(Modification/Addition), signed cost deltas (+₹5K red, ₹0), status badges,
TOTAL +₹5.0K — holds the shared table conventions.

## Round 20 — Sahayak assistant + redirects + change-orders

**Assistant verified live:** floating bubble → Sahayak chat → "Cash
position" chip → `/api/assistant` 200 → real Hinglish answer with live
numbers (Cash ₹75.10L, Receivable ₹25.01L, Payable ₹15.2K — ties to More
hub card exactly, Net ₹99.96L) + follow-up chips. Bilingual greeting,
type-or-speak input — exactly right for the audience.

**FIXED — raw markdown in bubbles:** assistant replies showed literal
`**Cash Position:**` — API returns markdown-lite, TTS path stripped it,
visual path didn't. Added a split-map renderer: `**x**` → real bold.
Commit 6218e687.

**Redirects verified intentional:** `/m/settings/team` → `/m/hr/employees`,
`/m/settings/company` → company profile (they surface as fake "cold
compile timeouts" in sweeps since the redirect target compiles on first
hit).

**`/change-orders` desktop:** stat tiles, filter row, typed rows, signed
deltas, TOTAL — shared table conventions hold.

## Round 21 — Reports hub (mobile 20 + desktop 9)

**All 20 mobile report routes verified in a real browser** (visible
innerText, not raw HTML — RSC payloads embed "Page not found" boundary
markup that false-positives): balance-sheet (₹5.84C assets),
cash-flow, comparative (₹5.26C), department-consumption (legit empty
state), expenses (₹5.88L), gst (ITC ₹951/output ₹140), inventory-value,
issue-register (1.7K chars of rows), job-costing (₹5.94L + proportional
cost bars), payroll-expense (₹9.26L), pending-payments (₹24.69L),
profit, project-progress (₹5.51C portfolio), purchase-register,
purchase-trends, purchaser-performance (legit empty state),
real-estate-inventory (₹71.80L), sales-revenue (₹25L),
stock-movement-summary, tds-certificates (₹71.50L deducted).

**Earlier "batch timeouts" fully explained:** cold Turbopack compiles
(3–28s each once the persistent cache survived a server restart). A
sequential 20-route batch wedged next-server into the idle-unresponsive
state — killed the PID, wrapper respawned healthy (documented dev-only
gap).

**Desktop spot-check (1440px):** profit, balance-sheet, gst,
pending-payments, job-costing, purchase-register, cash-book,
land-aging, calls — all OK. P&L renders KPI strip + Net Profit Trend +
Revenue vs Expenses charts; Cash Book renders opening/in/out/closing
tiles, date filter, Export CSV, and a true running-balance ledger with
negative balances correctly red.

**Data fix (not code):** mobile purchase-register showed `₹1100.00Cr`
on some return rows — traced to two `SupplierReturnLine` rows with
`qty = 99,999,999` (boundary-test seed residue). Formatter was correct;
cleaned qty → 10 in the demo DB. Register now renders consistent
₹1.1K rows.

## Round 22 — report exports + notifications + approvals (live mutations)

**Report export verified:** /m/reports/issue-register Export →
"Download CSV — 38 rows" popover → real download
`issue-register-report-2026-10-28.csv`, 39 lines (header + 38 rows —
exact tie with the page's TOTAL ISSUES strip), proper headers, Excel
BOM. Share button degrades gracefully in headless (toast: "Couldn't
copy the link — long-press the address bar instead"; real phones get
the Web Share API).

**Notifications verified:** 27 rows for the owner user (page correctly
scopes by userId — other demo users' unread piles don't leak).
Unread-dot + bold-title styling, "N unread" count + Mark-all button,
IMMEDIATE-urgency priority section — all conditionally rendered and
correct. Tap → fire-and-forget PATCH /api/notifications/in-app →
deep-link navigation (verified: "Ncr Raised" → NCR detail). readAt
persists.

**Approval mutation verified end-to-end:** /m/approvals showed
GP-261025-0021 (Supplier Return, 3-day aging badge). Row expands
inline to item detail + Approve/Reject/Snooze. Approve →
PATCH /api/gate-passes/:id → 200 → "Gate Passes (0) · All gate passes
reviewed" + success toast with "View Gate Passes" link. DB confirms:
status APPROVED, approvedById set, approvedAt timestamped.

**Data cleanup:** the pending gate pass carried qty=99,999,999 kg
(same boundary-test residue as the supplier-return lines) — cleaned
to 10 kg before approving so the workflow moved sane data.

## Round 23 — heavyweight desktop surfaces (1440px)

All verified live with real data:

- **`/dprs`** — DPRS/PENDING tiles + 6-stat strip (Approved 6, Avg
  Progress 48.6%), date-range + search + Columns/CSV/Save View/Views/
  New DPR, table with progress bars + over-budget flagging
  (₹5.88L, "287% of budget" in red — working as designed).
- **`/hr/attendance`** — payroll-lock banner ("Attendance is locked —
  10/2026 payroll is already paid"), Present/Half/Absent/Leave tiles,
  P/A/H/OT/L/LT/PL/NPL legend, per-employee status-chip grid, Mark All
  Present + Save Attendance. A real attendance sheet.
- **`/hr`** — dashboard: EMPLOYEES/PRESENT/CREWS tiles, live event
  ticker, Headcount/Present/Labour Cost ₹3.80L/Pending KPIs, attendance
  donut + 7-day trend, Headcount-by-Trade bars, Action Queue, Site
  Presence empty state, Recent DPRs + Latest Payroll.
- **`/work-orders`** — project selector + summary strip (₹71.50L work
  done · ₹66.17L paid · ₹59.5K retention held), full subcontractor
  table (scope/work done/paid/retention/RA bills/status), TOTAL row.
- **`/gate-passes`** — TOTAL 361 / PENDING APPROVAL 0 / AWAITING EXIT
  46 / REJECTED 0 tiles, 4 counted tabs, category + status chips,
  vehicle/destination columns. GP-261025-0021 shows Approved — the
  mobile approval mutation reflected here.

Note: bare `/attendance` 404s correctly — real route is `/hr/attendance`
(no broken links; my probe used a guessed URL).

## Round 24 — ⌘K palette + SITE_ENGINEER persona

**⌘K verified end-to-end:** Meta+K → palette (input + ESC hint +
↑↓/⏎ footer) → "gate pass" filters to route result (Gate Passes ·
Build ↵) → Enter navigates to /gate-passes. Async entity search shows
"Searching…" then resolves correctly.

**SITE_ENGINEER persona verified — role-personalization is real:**

- Bottom nav re-orders to `Home | Field | DPRs | Stock` (vs owner's
  `Inventory | HR | Accounts`) — field-relevant sections only.
- Home is a worker's day view, not a business dashboard: payroll-lock
  banner rephrased for the worker ("Your supervisor can add an
  adjustment in the next period" vs the admin phrasing on desktop),
  "Good evening, Yash" greeting, Briefing card (low-stock alert),
  TODAY vertical timeline (Check in → 1 open task → File today's DPR
  → Check out, with lock states), 2×2 grid of permitted modules
  (Gate Pass, Leaves, Procurement, Expenses).
- `/m/reports/balance-sheet` → clean 404 with Back to Home
  (FINANCE_VIEW gate).
- `/m/approvals` → friendly "No access — you do not have permission to
  approve any items (POs, requisitions, gate passes, DPRs, expenses,
  RA bills, or leave requests)" — explains scope instead of erroring.
