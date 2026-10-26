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
