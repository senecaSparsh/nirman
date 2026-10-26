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

- **DPR table: 3-line date wrap** at `/dprs` — the narrow DATE column split "Oct 24, 2026" across three lines; every row tripled in height. `whitespace-nowrap` keeps dates single-line. (commit `575cb815`)
- **Employees table: name column squeezed** at `/hr/employees` — 11 columns overflow the viewport; auto-layout shrank NAME to min-content (~90px) so "Anurag Garg / Civil Head" wrapped 3–4 lines. Nowrap on name+designation lets the column hold its declared 200px; rows are uniform height. (commit `680bbf4b`)

## Findings — Verified OK (not defects)

- **Diagonal watermark on HR/Finance pages** — "Vardaan Kumar · 26 Oct 2026" tiled pattern is an intentional screenshot deterrent on sensitive data (wages, gov IDs). Consistent and subtle.
- **Mobile orbit navigator** — radial module menu is symmetric by construction.
- **Empty states** — centered, icon + title + next-step copy + CTA everywhere checked (Work Orders, Measurement Book, lease alerts).

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

## Remaining Nitpicks (Low — deferred)

- Notification panel doesn't close on outside-body click in the corner case observed (Escape/backdrop works) — verify.
- "₹40,00,000" for the equipment sale notification is correct Indian grouping; no issue.
- Equipment & Fixtures shows -₹43.51L flagged ⚠ — likely a test-data artifact (asset sold without book-value split); books still balance. Worth an accounting spot-check, not a design issue.
