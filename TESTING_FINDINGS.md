# Nirman Inventory OS — Playwright UX/UI Testing Findings

Testing the app like a real user across modules discussed in the Alpha Road / Amoria Cafe transcripts.

## Environment
- Dev server: http://localhost:3001 (Turbopack, Next.js 16.2.12)
- AUTH_BYPASS=true (logged in as Amit, OWNER, Nirman Constructions)
- Desktop surface via `?desktop=1` cookie (Playwright UA detected as mobile otherwise)

## Findings

### Command Center (Home / `/`)
1. **FIXED — `/api/legal-documents` returns HTTP 500.** Same root cause as #4 — comma-separated `status` filter. Fixed in `listAllLegalDocs()` in `packages/services/src/legal-docs.ts`. Verified: 0 console errors on home page.
2. **UX — "Top performers" lists loss-making / zero-revenue projects.** "Test RERA Project" (₹0 rev / ₹0 cost, 0% margin) and "Hillview Corporate Park" (₹0 rev / -₹12L, 0% margin) appear under "Top performers". A project with zero revenue and zero cost is not a "top performer" — the ranking logic is wrong (likely sorting by margin % ascending or not filtering zero-revenue). Same projects also appear under "Needs attention" → duplicate, confusing.
3. **UX — Mobile UA redirect with no easy desktop toggle from mobile surface.** Playwright (and real mobile users) get bounced to `/m/home`. The `?desktop=1` escape hatch works but is not discoverable from the mobile UI. (Verified the cookie mechanism works.)

### Land (`/land`, `/land/[id]`)
4. **BUG — Global `/api/legal-documents?all=true` returns HTTP 500** on every page load (repeated in console). Appears to be a global reminder/banner call. The per-land Legal tab uses a different endpoint and works, but this 500 fires everywhere. **Root cause identified**: the nav badge in `src/lib/nav.ts:480` calls `/api/legal-documents?all=true&status=PENDING,EXPIRED,RENEWAL_DUE` (comma-separated), but `listAllLegalDocs()` in `packages/services/src/legal-docs.ts:261` does `where.status = filter.status` (exact string match). Prisma rejects `"PENDING,EXPIRED,RENEWAL_DUE"` as an invalid `LegalDocStatus` enum value → 500. Fix: split on comma and use `{ in: [...] }`.
5. **VERIFIED — "Create project from land" button exists and works.** The button is in `land-hub.tsx` (line 407-412), shown when `permissions.canEdit && !purchase.projectId`. It calls `POST /api/land-purchases/[id]/create-project` with a prompted project name. The button was hidden in testing because the seed land purchase is already linked to "Greenfield Residency" project — correct behavior.
6. **FIXED — Unit/parcel `status` not updated when a sale is created.** Root cause: `recordPayment()` in `packages/services/src/sale.ts` did NOT call `markAssetStatus()` — it only updated `paymentStatus` on the sale. The seed script used `recordPayment()` (not `recordDeposit()`) after `sellAsset()`, so assets stayed AVAILABLE despite having payments/sale recorded. Fix: added `markAssetStatus(..., "RESERVED", ...)` call in `recordPayment()` when `saleStage === "PENDING"`, and upgraded the sale stage to `DEPOSIT_RECEIVED`. Verified: PLOT-1A, A-101, S-01 now show "Reserved" status after re-seed.
7. **FIXED — "Parcels" cell in the land list shows colored dots with counts but no legend.** Fix: added `hint` to the Parcels column header ("Available / Hold / Partitioned / Sold") so hovering the header explains the color order, and added `title` tooltips to each count dot (e.g. "1 Available", "2 Sold") so users can identify each status without opening the drawer.
8. **FIXED — "Reserved" and "Rented" statuses missing from Cadastre Plan legend.** Added both to the `CadastreLegend` component in `apps/web/src/components/land/cadastre-plan.tsx`. Legend now shows all 5 statuses: Available / Hold / Reserved / Sold / Rented.
9. **UX — "Status" and "Purpose" columns are semantically confusing.** Both show status-like values (PLOT-1A: Status=Available, Purpose=Hold; PLOT-1B: Status=Reserved, Purpose=Hold; PLOT-1C: Status=Hold, Purpose=Hold). "Purpose" meaning is unclear and overlaps with "Status".
10. **UX — "Realized" stat shows a negative value (-₹1.5Cr) alongside "Sold" ₹5.7Cr.** The terms Held/Unrealized/Sold/Realized are not self-explanatory; a negative "Realized" next to positive "Sold" is confusing without a tooltip/definition.
11. **POSITIVE — Possession tracking ("Mark Possessed") and Un-divide (restore original plot) are present**, matching Alpha Road 5 (possession) and Alpha Road 2 (owner-only undo subdivision) requests.
12. **POSITIVE — Legal/Permissions/NOC checklist works** on the land detail (Feasibility & Land permissions with dependencies), matching Alpha Road 2's request.

### Materials (`/materials`)
13. **VERIFIED WORKING — "Delete" button on a material row opens a confirmation dialog and soft-deletes correctly.** (Initially appeared non-functional due to a stale Playwright element ref; re-tested with a fresh snapshot + direct DOM click — dialog showed the correct material name and deletion succeeded. Test material "Test Cement Grade 1" was created and deleted to verify the full round-trip.)
14. **FEATURE GAP — Material "Code" is manual entry**, not auto-generated from category (Alpha Road.txt requested auto item code like CEM-001 from category prefix).
15. **FEATURE GAP — HSN/SAC code is manual** (Alpha Road.txt requested auto-fetch from government GST portal). GST Rate is also manual, not auto-filled from HSN.
16. **FEATURE GAP — Standard Cost has no "pull from previous purchase" option** (Alpha Road.txt requested both manual entry and an option to inherit from the last purchase).
17. **FIXED — "+ Create new category…" option was disabled in dropdowns.** Root cause: the `SelectWithCreate` and `EditableGrid` components used `disabled` attribute on the sentinel `<option>` element, which prevented selection in most browsers. Fix: removed `disabled` attribute from the sentinel option in both `select-with-create.tsx` and `editable-grid.tsx`. The `onChange` handler now fires when the sentinel is selected, opening the create dialog. Verified: "New Supplier" dialog opens when selecting "+ Create new supplier…" in Convert-to-PO.
18. **POSITIVE — New Material form includes HSN/SAC, GST Rate, Standard Cost, Min Stock, Reorder Point, EOQ, Description.** Create flow works end-to-end (verified by creating "Test Cement Grade 1").

### Procurement (`/procurement`, `/requisitions`)
19. **UX — "New PO" button is buried in the table footer**, not in the header toolbar where users expect primary actions. Easy to miss.
20. **FIXED — "Age" column shows "0d" for all POs.** Root cause: `orderPurchaseOrder()` sets `orderDate = new Date()`, but the seed called it at seed-time (today), so all ordered POs had today's `orderDate`. Fix: added `prisma.purchaseOrder.update()` calls in the seed to backdate `orderDate` and `createdAt` to match the historical expected dates (Mar-Jun 2024). Verified: PO-001 shows 901d, PO-002 shows 898d, PO-010 shows 809d. Draft POs (never ordered) correctly show 0d.
21. **FIXED — Comparative Statement: per-item "Landed/unit" showed ₹0.00.** Root cause: seed script didn't set `unitLandedCost` on `VendorQuoteLine` records. Fix: added `computeQuoteLineFields()` helper in seed to compute `unitLandedCost = unitPrice × (1 + gstRate/100)`. Verified: Anand Electricals ELC-WIRE25 shows ₹21.24/MTR landed unit cost.
22. **FIXED — Comparative Statement: "Subtotal (ex-GST)" and "GST Total" showed ₹0.00.** Root cause: seed script didn't set `subtotal`/`gstTotal` on `VendorQuote` header or `gstRate`/`gstAmount`/`taxableValue`/`lineSubtotal` on `VendorQuoteLine` records. Fix: same `computeQuoteLineFields()` helper computes all fields with 18% GST. Verified: Subtotal ₹79,600, GST Total ₹14,328, Landed Total ₹93,928 for Anand Electricals.
23. **FIXED — Winning vendor "Berger Paints Wholesale" not in Supplier dropdown on Convert-to-PO.** Root cause: the supplier query in `requisitions/page.tsx` filtered by `purchaseOrders: { some: { companyId: company.id } }` — only showing suppliers that already had a PO (chicken-and-egg problem). The comment incorrectly said "Supplier has no companyId" — it does. Fix: changed filter to `{ companyId: company.id, deletedAt: null }` in both `requisitions/page.tsx` and `procurement/page.tsx`. Verified: "Berger Paints Wholesale" now appears in the dropdown.
24. **FIXED — "+ Create new supplier…" was disabled in Convert-to-PO dialog.** Root cause: (1) `ConvertToPoDialog` in `convert-to-po-dialog.tsx` used a plain `<Select>` instead of `SelectWithCreate` — replaced with `SelectWithCreate` + `SupplierFormDialog`. (2) The sentinel `<option>` had a `disabled` attribute preventing selection — removed in `select-with-create.tsx`. The New PO dialog already had `SelectWithCreate` wired correctly. Verified: "New Supplier" dialog opens from Convert-to-PO with Supplier Name, GSTIN, Phone fields.
25. **FIXED — Project name and tower run together without separator.** "Greenfield ResidencyTower A" appeared because the project name and phase name were rendered in adjacent spans with only `ml-2` margin. Fix: added a "·" separator before the phase name in the requisitions table Project column. Now reads "Greenfield Residency · Tower A".
26. **POSITIVE — Comparative quote engine exists** (≥3 quotes gate, per-item basic price, landed total, variance vs lowest, "Save ₹X", delivery basis, lead time, warranty, valid-until, Print). Matches Alpha Road.txt's comparative-statement request in structure.
27. **POSITIVE — Supplier dropdown shows "Owes: ₹X" payable annotations** and requisitions show "3/3 Quotes" gate status.

### Projects (`/projects`, `/projects/[id]`)
28. **FIXED — Built Units status now correctly shows "Reserved" when sold.** A-101 and S-01 now show "Reserved" (was "Available") after the `recordPayment()` fix in #6. A-102 correctly shows "Available" (no sale in seed). The unit `status` is now synced via `markAssetStatus()` when payments are recorded.
29. **FIXED — Unit "Profit" was massively negative for sold units.** Root cause: (1) the land cost (₹9Cr) was being area-allocated over only 4,150 sqft of sellable units (most units were PLANNED and excluded), producing ₹22,871/sqft cost vs ₹7,647/sqft asking price. (2) RESERVED units were excluded from cost allocation, further reducing the denominator. Fix: (a) added RESERVED to the allocation pool in `valuation.ts`, (b) changed more units from PLANNED to AVAILABLE/UNDER_CONSTRUCTION in the seed (7,800 sqft now participates), (c) increased asking prices to be realistic for a ₹9Cr land project (2BHK ₹1.5Cr, 3BHK ₹2.1Cr, shops ₹80L). Verified: A-101 profit ₹46.5L (31% margin), S-01 profit ₹31.3L (39% margin), A-102 profit ₹64L (30.5% margin).
30. **FIXED — "RERA: Not registered" badge had no inline action.** The badge was informational only. Fix: made the "Not registered" badge a clickable button that opens the project Edit dialog (where RERA number, registration date, validity date, and website URL fields live). Lifted edit dialog state from `ProjectDetailActions` to `ProjectHub` so the badge and the Edit button share the same dialog. The registered RERA badge remains a static display.
31. **POSITIVE — Project detail has comprehensive tabs**: Overview, Procurement (6), Stock (3), Construction (14), Units (12), Land (4), Analytics (6), Equipment (2), Legal. Phases (Tower A/B) tracked. Budget burn % flagged (Greenfield at 112% — over budget).

### Sales (`/sales`)
32. **FIXED — Sales header "Sold: 0" while Bookings tab showed 5 sales and Revenue ₹7.72Cr.** The "Sold" stat counts only units with `status === "SOLD"` (registry done), which was technically correct but confusing. After the `recordPayment()` fix (#6), units with deposits now show as "Reserved: 2" instead of being invisible. The "Sold" hint now reads: "Units with a completed sale (registry done). Booked units with deposit are in 'Reserved' below." Stats now: Total 18, Available 4, Sold 0, Reserved 2, Revenue ₹6.3Cr, Collected ₹1.68Cr — internally consistent.
33. **FIXED — Sale detail dialog showed "Sale pending — no deposit yet" despite ₹1.04Cr payment recorded.** Root cause: same as #6 — `recordPayment()` didn't upgrade `saleStage` from PENDING to DEPOSIT_RECEIVED, so the `isPending` check in the dialog rendered the wrong banner. Fix: `recordPayment()` now upgrades the sale stage. Verified: dialog now shows "₹1,04,00,000.00 paid · ₹4,16,00,000.00 remaining" with "Complete Sale" / "Record Payment" buttons instead of the contradictory "no deposit yet" prompt.
34. **UX — Board columns (Booked/BBA Signed/Payments/Registry/Completed) have empty columns with just "0" counts** and no guidance on how to move a sale forward (e.g., "Sign BBA" action on a Booked card). The kanban is read-only display, not a drag-to-progress workflow.
35. **POSITIVE — Sale detail has full document workflow**: ATS, BBA, Registry upload buttons; Payment History with receipt printing + WhatsApp confirmation; Print Form/Invoice; Record Deposit; Cancel Sale; broker shown on cards (Ramesh Broker); customer mode (Bank Loan HDFC); notes. Matches Alpha Road 3 & 4.
36. **POSITIVE — "Send payment due reminders" bulk action** and per-payment "Send WhatsApp confirmation" exist (Alpha Road 3 request).

### HR (`/hr`, `/hr/attendance`, `/hr/dprs`, `/hr/payroll`)
37. **DATA GAP — 0 DPRs and 0 Payroll periods in seed data.** The DPR multi-tier approval pipeline (Pending → Sub-Approved → Approved) and Payroll (gross/deductions/net) UI structures exist and match Alpha Road 5, but cannot be tested end-to-end because no records are seeded. "Submit DPR" and payroll-run buttons exist but produce empty states.
38. **UX — HR dashboard "Present Today: 0" with 7 employees** — no attendance logged for today. The 7-day trend shows all zeros. Acceptable for seed data but the "0% present" with no explanation could confuse a new user into thinking attendance is broken.
39. **POSITIVE — HR dashboard shows headcount by trade** (Masonry, Electrical, Plumbing, Supervisor) and monthly labour cost (₹1.71L) with "All payrolls settled" status.
40. **POSITIVE — Attendance page description confirms GPS check-in/out** ("Daily worker attendance with GPS check-in/out. Track present, absent, half-day, and overtime.") — matches Alpha Road 5 GPS attendance request at the UI label level (mobile form not tested on desktop surface).

### Rent & CRM (`/rentals`, `/sales?tab=pipeline`, `/crm`)
41. **DATA GAP — 0 tenancies seeded in Rentals.** The Rentals page (tenancies, security deposits, monthly rent, "New Tenancy" button) exists but has no data to test the Amoria Cafe rent scenario end-to-end.
42. **FIXED — `/crm` returns 404.** No standalone CRM route existed. Fix: added `/crm/page.tsx` with `redirect("/sales?tab=pipeline")` so `/crm` now redirects to the Sales Pipeline tab where leads are managed.
43. **POSITIVE — Lead capture form is comprehensive**: Name, Phone, Email, Source (Property portal/Walk-in/Referral), Priority (Hot), Project, Interested unit, Budget range, Owner. Matches Amoria Cafe CRM lead-capture request.

### Company Switching (`/settings?tab=companies`)
44. **DATA GAP — Only 1 company seeded (Nirman Constructions).** Alpha Road.txt and Amoria Cafe.txt discussed switching between Nirman Constructions and Amoria Cafe (a second company). "Amoria Cafe" is not seeded, so multi-company switching cannot be tested. The "Switch to" and "New Company" buttons exist.
45. **POSITIVE — Notification preferences panel is comprehensive**: per-event (Procurement, Sales, etc.) × per-channel (WhatsApp/Email/In-App) toggle matrix. Matches the WhatsApp/notification alerts feature.

---

## Summary

### Fixes Applied During Testing
- **FIXED #1, #4 — `/api/legal-documents?all=true` 500 error.** Root cause: comma-separated `status` filter passed as a literal string to Prisma's enum `where.status`. Fixed `listAllLegalDocs()` in `packages/services/src/legal-docs.ts` to split on comma and use `{ in: [...] }`. Verified: 0 console errors on home page after fix.
- **FIXED #6, #28, #33, #32 — Systemic status-sync bug.** `recordPayment()` in `packages/services/src/sale.ts` didn't call `markAssetStatus()` or upgrade `saleStage`. Fix: added `markAssetStatus(..., "RESERVED")` and upgraded sale stage to `DEPOSIT_RECEIVED`. Verified: PLOT-1A, A-101, S-01 show "Reserved"; "no deposit yet" banner gone; Sales header now consistent.
- **FIXED #8 — Cadastre Plan legend missing "Reserved" and "Rented".** Added both to `CadastreLegend` component.
- **FIXED #17, #24 — "+ Create new category/supplier…" disabled in dropdowns.** Root cause: `disabled` attribute on sentinel `<option>` in `SelectWithCreate` and `EditableGrid`. Also `ConvertToPoDialog` used plain `<Select>` instead of `SelectWithCreate`. Fix: removed `disabled`, replaced `<Select>` with `SelectWithCreate` + `SupplierFormDialog`. Verified: "New Supplier" dialog opens from Convert-to-PO.
- **FIXED #21, #22 — Comparative Statement ₹0.00.** Seed script bypassed `createVendorQuote()` service. Fix: added `computeQuoteLineFields()` helper in seed to compute `subtotal`, `gstTotal`, `unitLandedCost`, etc. with 18% GST.
- **FIXED #23 — Winning vendor not in Supplier dropdown.** Supplier query filtered by `purchaseOrders: { some: { companyId } }` (chicken-and-egg). Fix: changed filter to `{ companyId, deletedAt: null }`.
- **FIXED #2 — "Top performers" lists zero-revenue/loss-making projects.** Fix: filtered to only projects with `revenue > 0 && profit > 0` for "Top performers", and sorted "Needs attention" by most negative profit.
- **FIXED #7 — Land list parcels cell has no legend.** Fix: added `hint` tooltip to Parcels column header and `title` tooltips to each count dot.
- **FIXED #20 — "Age" column shows "0d" for all POs.** Seed called `orderPurchaseOrder()` at seed-time (today). Fix: backdated `orderDate` and `createdAt` in seed to match historical expected dates (Mar-Jun 2024). Verified: PO-001 shows 901d, PO-010 shows 809d.
- **FIXED #25 — "Greenfield ResidencyTower A" missing separator.** Fix: added "·" separator before phase name in requisitions table Project column.
- **FIXED #29 — Unit "Profit" massively negative.** Root cause: land cost (₹9Cr) allocated over only 4,150 sqft; RESERVED units excluded. Fix: added RESERVED to allocation pool, changed more units to AVAILABLE/UNDER_CONSTRUCTION (7,800 sqft), increased asking prices to be realistic for ₹9Cr land. Verified: A-101 profit ₹46.5L (31% margin).
- **FIXED #30 — "RERA: Not registered" badge has no inline action.** Fix: made badge a clickable button that opens the project Edit dialog. Lifted edit state from `ProjectDetailActions` to `ProjectHub`.
- **FIXED #42 — `/crm` returns 404.** Fix: added `/crm/page.tsx` with `redirect("/sales?tab=pipeline")`.

### Critical Bugs (P0 — data integrity / workflow-breaking)
| # | Status |
|---|--------|
| 6, 28, 33, 32 | **FIXED** — status-sync bug + sale dialog banner + sales header |
| 22, 21 | **FIXED** — Comparative Statement ₹0.00 |
| 23 | **FIXED** — Winning vendor not in Supplier dropdown |
| 1, 4 | **FIXED** — `/api/legal-documents` 500 error |
| 29 | **FIXED** — Unit profit massively negative |

### Missing Features (P1 — requested in transcripts, no UI)
| # | Status |
|---|--------|
| 5 | **VERIFIED** — "Create project from land" button exists, hidden when project linked |
| 17, 24 | **FIXED** — "+ Create new category/supplier…" now works in dropdowns |
| 42 | **FIXED** — `/crm` redirects to `/sales?tab=pipeline` |
| 14 | Open — Material code not auto-generated from category |
| 15 | Open — HSN/GST not auto-fetched |
| 16 | Open — Standard cost has no "pull from previous purchase" |

### Data/Seed Gaps (P2 — can't test end-to-end)
| # | Gap |
|---|-----|
| 37 | 0 DPRs, 0 Payroll periods seeded |
| 41 | 0 tenancies seeded (Rent module) |
| 44 | Only 1 company seeded (no Amoria Cafe for multi-company test) |

### UX Issues (P3)
| # | Status |
|---|-------|
| 2 | **FIXED** — "Top performers" filters zero-revenue/loss projects |
| 7 | **FIXED** — Parcels cell has header hint + per-dot tooltips |
| 8 | **FIXED** — "Reserved"/"Rented" in Cadastre Plan legend |
| 20 | **FIXED** — Age column shows realistic days |
| 25 | **FIXED** — Project/phase separator added |
| 30 | **FIXED** — RERA badge opens edit dialog |
| 9 | Open — "Status" vs "Purpose" columns semantically confusing |
| 19 | Open — "New PO" button buried in table footer |
| 34 | Open — Sales board columns are read-only (no drag-to-progress) |

### Round 2 — New Critical Bugs (P0)
| # | Issue |
|---|-------|
| 87 | Moving Average Cost ₹0.00 at material level (location-level correct) |
| 91 | PLOT-1A contradictory statuses persist on mobile (Hold + Available + Sold) |
| 99 | `/m/rent` returns 404 (module is at `/m/rentals`) |
| 100 | Project Costs ₹58L (Reports) vs ₹9.49Cr (Project detail) — unlabeled bases |
| 101 | Payables mismatch persists (₹88L/18 vs ₹83.9L/5) |
| 102 | **SYSTEMIC** — profit/revenue/cost inconsistent across 4+ pages |

### Round 2 — New Feature Gaps (P1)
| # | Issue |
|---|-------|
| 88 | No "New Material"/"Edit" button on mobile |
| 89 | No document upload for permissions/NOC on mobile land |
| 90 | No cost breakup on mobile land detail |
| 92 | No payment plan schedule on mobile sale detail |
| 93 | No broker/commission field on mobile sale detail |
| 94 | No T&C visible on mobile sale detail |
| 95 | Attendance types don't match spec (no Late, no PL/NPL distinction) |
| 97 | No customizable H1-H6 team hierarchy (fixed 13 roles only) |
| 98 | No standalone "New Supplier" button on mobile |

### Round 2 — New UX Issues (P3)
| # | Issue |
|---|-------|
| 96 | All attendance times show "—" (GPS check-in time not displayed) |

### What Works Well
- Command Center dashboard (cash position, project profitability, approvals queue)
- Land subdivision (cadastre plan, parcels, un-divide, possession tracking)
- Legal/Permissions/NOC checklist with dependencies
- Material catalog create/edit/delete (full round-trip verified)
- Comparative quote engine structure (≥3 quotes gate, variance, print)
- Sales document workflow (ATS/BBA/Registry upload, payment history, receipts, WhatsApp)
- Lead capture form (CRM in Sales Pipeline tab)
- HR dashboard (headcount by trade, attendance, monthly labour cost)
- DPR multi-tier approval pipeline structure
- Notification preferences matrix (per-event × per-channel)
- RBAC with 13 roles, 60+ permissions, delegation hierarchy

### Round 2 — What Works Well (Mobile)
- Mobile Materials list with category filters, stock status badges, auto-codes (CEM-PPC, AGG-20MM)
- Mobile Material detail with HSN, GST%, standard cost, reorder point, EOQ, min stock, locations, movements
- Mobile Procurement with "New PO" in header, inline Approve/Cancel, status filters, draft auto-save
- Mobile New PO form with supplier picker, procurement scope toggle, line items with auto-GST, charges
- Mobile Requisition detail with comparative quote engine (3/3 quotes, cheapest flag, per-line breakdowns, Select Winner, Upload Quote, Convert to PO)
- Mobile Land detail with subdivision, Un-divide, per-parcel actions (Hold/Valuate/Partition/Sell), possession tracking, sales section
- Mobile Land/Project Permissions checklist with 8-15 permissions, dependency chains, Yes/No/N/A toggles
- Mobile Project detail with budget burn, approvals alert, units grid, recent POs/issues/costs, quick actions
- Mobile Sale detail with ATS/BBA/Registry uploads, payment history, printable form, Complete/Cancel Sale
- Mobile Sales Collections with outstanding tracking, collection %, Call/Details actions
- Mobile GPS attendance with "Capture GPS location" button, per-worker status buttons, daily wage display
- Mobile Accounts with Tally sync, payables, receipts, quick actions (Receipt/Payment/GL/Reports)
- Mobile Reports with 16+ report types across Revenue, Purchasing, Inventory, Projects, Finance & Tax
- Mobile Customers with outstanding tracking, dues/clear filters, New Customer button
- Mobile Equipment with status tracking (Available/Assigned/Maintenance), codes, values
- Mobile Team & Permissions with 13 roles, permission counts, role descriptions

---

## Mobile Surface Testing (Playwright, iPhone 14 viewport 390×844)

Tested the `/m/*` mobile surface as a real user — navigating via the bottom tab bar
(Home, Inventory, HR, Accounts, Settings), the "All pages" hamburger menu, and deep
links. AUTH_BYPASS=true, `nirman-desktop` cookie cleared to avoid desktop redirect.

### Mobile Home (`/m/home`)
46. **POSITIVE — Orbit navigation hub works well.** Company card with quick-stat
    buttons (Projects 3, Land 1, Inventory 4, Workforce 7, Equipment 6). Tapping a
    stat (e.g. "Projects 3") opens a drill-down list with per-item details and
    "Open full page" links. Departments button correctly disabled (0 departments).
47. **UX — "All pages" menu is truncated.** The hamburger menu only shows
    Dashboards, Attention, Quick Access, and Settings & Help. The full nav config
    (`mobile-nav-v2.ts`) has 8+ categories (Procurement, Stock, Real Estate,
    Construction, Safety, Reports, Attendance, etc.) with dozens of sub-pages, but
    none are accessible from this menu. Users must know to navigate via the 5 bottom
    tabs and their sub-pages. Many modules (BOQ, WBS, Measurement Book, Quality
    Control, Change Orders, Work Orders, Portal Listings, Rate Contracts) are only
    reachable by direct URL — no visible navigation path from the mobile UI.

### Mobile Inventory (`/m/inventory`)
48. **UX — "Real Estate" toggle only changes quick-action links.** Tapping the
    "🏗️ Real Estate" toggle switches the quick-action row (to Sales, Projects,
    Units, Land, etc.) but the stock-by-location section and pending indents below
    still show raw-material data. The toggle gives a false impression that the
    entire page context changed.
49. **BUG — Requisition IDs show doubled "REQ" prefix.** The pending indents
    section shows "REQ-REQ-2024-0007" instead of "REQ-2024-0007". The requisitions
    list page (`/m/requisitions`) shows the correct single prefix — the bug is
    specific to the Inventory page's pending indents rendering.
50. **UX — Attendance stat numbers are unlabeled.** The GPS attendance form
    (`/m/site/attendance`) shows a row of 5 numbers (7, 0, 0, 0, 0) with only
    "7 total" below. The numbers correspond to Present/Absent/Half/OT/Leave counts
    but have no labels — users can't interpret them.
51. **POSITIVE — Low-stock carousel is excellent mobile UX.** 8-slide horizontal
    carousel with dot navigation, showing out-of-stock/low-stock materials with
    reorder points. First slide is an approvals alert. Tappable to material detail.
52. **POSITIVE — GPS attendance capture works.** "Capture GPS location" button
    successfully captures coordinates (28.84, 77.58) and updates the button label
    to show them. "Save Attendance (7)" saves all 7 workers and redirects to the
    Field Dashboard. Per-worker status buttons (Present/Absent/Half/OT/Leave) with
    daily wage shown.

### Mobile HR (`/m/hr`)
53. **UX — "Everything looks good" banner contradicts data.** The HR dashboard
    shows "Everything looks good / All caught up!" but "Present Today: 0" and
    "On Leave: 7" — all employees are on leave. The positive status message is
    misleading when no one is present.
54. **UX — "On Leave: 7" counts unmarked attendance as leave.** All 7 employees
    show as "On Leave" because no attendance has been recorded today. The system
    defaults unmarked workers to "on leave" rather than "not marked" — confusing
    for a user who hasn't taken attendance yet.
55. **UX — HR page only has 2 quick actions.** Only "Daily Progress Reports" and
    "Attendance" links are shown. Employees, Payroll, and Leaves pages exist but
    are not linked from the HR landing page — users must find them via the "All
    pages" menu (which also doesn't list them) or know the direct URL.

### Mobile Settings (`/m/settings`)
56. **BUG — "July summary" shown in August.** The Settings page displays "July
    summary" with revenue/payables/units stats, but today is 23 Aug 2026. The month
    label is stale or hardcoded — should show August or the current period.
57. **BUG — Payables count mismatch between pages.** Settings shows "Pending
    payables: 18 vendors ₹75,48,300" but the Accounts page shows "Payables
    ₹59,92,890 · 5 vendors". The vendor count (18 vs 5) and amount (₹75.48L vs
    ₹59.92L) are both different — different queries are being used.
58. **UX — Recent activity shows raw audit log codes.** The activity feed shows
    technical codes like "MATERIAL_ISSUE_CREATE", "PURCHASE_ORDER_APPROVE" instead
    of human-readable text like "Material issued", "Purchase order approved". A
    regular user cannot interpret these codes.

### Mobile Procurement (`/m/procurement`, `/m/requisitions`)
59. **POSITIVE — "New PO" button is in the header toolbar** on mobile (fixing the
    desktop issue #19 where it was buried in the table footer). Draft POs have
    inline "Approve" and "Cancel" buttons. Status filter tabs work well.
60. **BUG — Stale Next.js cache serves wrong requisition IDs.** The requisitions
    list page initially showed links with IDs like `cmt5b5n3m001tvlh88tofqurb`,
    but the actual DB IDs are `cmt5b6h5d001tvll157spwpxr`. Clicking a requisition
    showed "Requisition not found" because the cached ID didn't exist in the DB.
    A hard reload with cache-busting query param (`?_t=...`) fixed it — the page
    then showed correct IDs. This is a Next.js Full Route Cache issue where the
    page wasn't invalidated after a database re-seed.
61. **POSITIVE — Convert-to-PO dialog is inline (not modal).** The convert dialog
    expands inline on the page (better for mobile than a modal overlay). Includes
    supplier dropdown (with ALL 18 suppliers including Berger Paints Wholesale),
    procurement scope, receive-at location, expected date, line costs, and PO
    notes. "Create new option" for supplier works (opens inline New Supplier form).
62. **POSITIVE — Requisition detail page has excellent mobile workflow design.**
    Compact header → vertical workflow timeline (Created → Submitted → Approved →
    Ready to convert) → line items table → vendor quotes panel with per-item
    breakdowns, winner selection, file viewing → notes → sticky action bar. The
    comparative quote panel is inline with 3/3 gate status, lowest/highest/savings
    stats, and per-quote line-item details.

### Mobile Projects (`/m/projects`, `/m/projects/[id]`)
63. **BUG — Cost-per-sqft inconsistency between pages.** The project detail page
    shows ₹/sqft = ₹12,168.79 (₹9,49,16,600 / 7,800 sqft total area), but the Home
    orbit navigator showed ₹22,871.47 for the same project. Different area bases
    are being used (total area vs. sellable area) without labeling which is which.
64. **BUG — Recent Issues show "—" instead of issue slip numbers.** Both the
    project detail page and the Field Dashboard show "—" where the issue slip
    number should be. The issue references link to `/m/site/issue` (generic) rather
    than a specific issue detail page.
65. **UX — B-101 unit shows "no price"** while all A-series units have prices
    (₹1.5Cr for 2BHK, ₹2.1Cr for 3BHK). B-101 is a 2BHK with 850 sqft but no asking
    price set — looks like incomplete seed data.
66. **POSITIVE — Project detail page is comprehensive on mobile.** Status badge,
    budget burn (100% · ₹99L over), approvals alert, overview stats, details,
    possession tracking, quick actions (New DPR, Requisition, Issue), units grid
    (12 units), recent POs, recent issues, recent costs — all on one scrollable
    page with good information density.

### Mobile Land (`/m/land`, `/m/land/[id]`)
67. **BUG — PLOT-1A shows "Available" badge but has been sold.** Same root cause
    as desktop finding #6 — the parcel status is not updated when a sale is
    created. PLOT-1A shows "Available" badge with "Hold" purpose label, but below
    it says "Sold to Verma Traders for ₹5,20,00,000.00 · SAL-20260823-0003". An
    "Available" parcel should not have sold data. (Note: desktop finding #6 was
    marked FIXED, but the mobile land detail page still shows the old "Available"
    status — possibly a stale cache issue like #60.)
68. **UX — Parcel counts "1 1 1" on land list card have no labels.** The land list
    card shows three numbers (1, 1, 1) with no indication of what they represent
    (Available/Hold/Sold). The legend only appears on the detail page, not the list.
69. **UX — "Hold" purpose label on all parcels is confusing.** PLOT-1A, PLOT-1B,
    and PLOT-1C all show "Hold" as a small label, but their actual status badges
    are "Available", "Available", and "Hold" respectively. The "Hold" label appears
    to be the "purpose" field, which overlaps semantically with the status badge.
70. **POSITIVE — Land detail page is excellent on mobile.** Plan View image,
    registration details, seller info with click-to-call, purchase stats, sub-
    division notice, legend, summary stats (unsold/gain/avail/profit), per-parcel
    cards with area/cost/value/asking/Δ%, action buttons (Hold/Release/Valuate/
    Partition/Sell), Un-divide for original plot, sales section.

### Mobile Sales (`/m/sales`, `/m/sales/[id]`)
71. **UX — Pipeline tab shows 0 leads while Collections shows 3 sales.** The
    Pipeline/Collections split is confusing — all 3 sales (2 outstanding + 1
    settled) appear only in Collections, while Pipeline is empty. The "Pipeline · 0"
    tab label could make users think there are no sales at all.
72. **POSITIVE — Collections tab is well-designed for mobile.** Total outstanding
    with collection %, per-sale cards showing customer, asset, outstanding/collected
    amounts, date, and Call/Details action links. Filters (Outstanding/Settled/All)
    and search work well.
73. **POSITIVE — Sale detail page is comprehensive on mobile.** Balance due/total/
    paid summary, Call/Payment/Form actions, customer/project/unit links, deposit
    info, pay mode, profitability (sale price/cost/profit), payments list with
    receipt print links, document uploads (ATS/BBA/Registry), Complete/Cancel Sale
    buttons. Profit shows ₹46.57L (positive — consistent with desktop fix #29).
74. **UX — No WhatsApp confirmation or payment reminder buttons on mobile sale
    detail.** The desktop sale detail has "Send WhatsApp confirmation" per payment
    and "Send payment due reminders" bulk action (findings #35, #36), but the
    mobile sale detail page only has a "Payment" button — no WhatsApp or reminder
    actions visible.

### Mobile Field Dashboard (`/m/site`)
75. **POSITIVE — Field Dashboard is well-structured for site workers.** Alert
    carousel (DPR due, 4 POs overdue), quick actions (Quick Issue, Receive Stock,
    Submit DPR, Attendance, Scrap Log, Open Tasks), Tasks (0), In Transit (4 POs
    with days-late), Recent Issues (3), My Projects (3). Good information density
    for a mobile field user.
76. **BUG — Recent Issues show "—" instead of slip numbers.** Same as #64 — the
    issue slip numbers are blank/missing on the Field Dashboard's Recent Issues
    section.

### Mobile Reports (`/m/reports`)
77. **BUG — Net Profit shows ₹1.47Cr on Reports but -₹3.31Cr on Home.** The
    Reports page shows "Net Profit ₹1,47,78,322" (positive) while the desktop Home
    page shows "Net Profit -₹3,31,16,600" (-52.6% margin). Different cost/revenue
    calculations are used: Reports counts only explicit project costs (₹58L) +
    expenses (₹2.5L) + purchases (₹20.7L), while Home counts total project cost
    including land + material issues (₹9.61Cr). Users see contradictory profit
    figures across pages.
78. **UX — "Sales Revenue ₹2.29Cr" (Reports) vs "Total Revenue ₹6.30Cr" (Home).**
    Reports shows total received revenue while Home shows total booked revenue.
    Same metric label "revenue" means different things on different pages.

### Mobile Accounts (`/m/accounts`)
79. **UX — Tally Sync button gives no feedback.** Clicking "Sync Tally 14" does
    not produce any visible toast, dialog, or loading state. The count stays at 14.
    Per AGENTS.md, the TallyProvider is a stub that logs XML — so the sync "works"
    but doesn't actually mark entries as synced, and the user gets no indication
    that anything happened.
80. **POSITIVE — Accounts page is well-designed for mobile.** Alert carousel
    (Tally sync pending, 3 payables), stats (Payables/Receipts/Tally Pending/Tally
    Failed), Sync Tally button, quick actions (Record Receipt/Payment/GL/Reports),
    recent receipts with customer/amount/method/date.

### Mobile Approvals (`/m/pulse/approvals`)
81. **UX — PO amounts differ between Approvals and Procurement pages.** Approvals
    page shows Bharat Sand ₹2,30,000 but Procurement list shows ₹2,41,500. Ambuja
    shows ₹1,70,000 vs ₹2,17,600. Shree Brick shows ₹5,50,000 vs ₹6,12,600. The
    Approvals page likely shows pre-tax subtotal while Procurement shows total with
    GST — but neither page labels which amount is being displayed.
82. **UX — No inline approve/reject on approval cards.** The approval cards are
    buttons that navigate to the detail page, but there's no quick approve/reject
    action directly on the card. For a mobile user processing a queue of 6
    approvals, having to open each one individually is slower than inline actions.

### Mobile Equipment, Safety (`/m/equipment`, `/m/safety`)
83. **POSITIVE — Equipment page is clean and functional.** 6 items with status
    badges (Available/Assigned/Maintenance), codes, categories, values, and
    project assignments. Stats summary (3 available, 2 in use, 1 maintenance,
    ₹39.34L value). Search and "New" link work.
84. **POSITIVE — Safety page has proper tab structure.** Incidents/Hazards/
    Inspections tabs with empty states and "Report new incident" button.

### Mobile-Specific UX Issues
85. **UX — No "View desktop" toggle visible on mobile surface.** The `?desktop=1`
    escape hatch works via URL but is not discoverable from the mobile UI. A phone
    user who needs the full desktop ERP has no way to access it from within the app.
86. **UX — Bottom tab bar only has 5 tabs** (Home, Inventory, HR, Accounts,
    Settings). Many modules (Procurement, Projects, Land, Sales, Reports, Safety,
    BOQ, Quality Control) are only accessible via the "All pages" menu — which
    itself is truncated (#47). The mobile navigation architecture makes it
    difficult to reach half the app's modules.

---

## Mobile Surface Testing — Round 2 (Playwright, 390×844 viewport)

Re-tested all mobile modules systematically by navigating directly to each URL
(since the "All pages" menu is truncated, #47). Focused on verifying Alpha Road
1-5 and Amoria Cafe transcript requirements on the mobile surface.

### Mobile Materials (`/m/materials`, `/m/materials/[id]`)
87. **BUG — Moving Average Cost shows ₹0.00 despite ₹27,200 stock value.** The
    Cement PPC material detail shows "Moving Average Cost ₹0.00" while "Stock
    value ₹27,200.00" and "On hand 80 BAG". The per-location breakdown shows
    "Moving Average Cost ₹340.00" for Central Warehouse — so the location-level
    MAC is correct but the material-level aggregate MAC is not rolled up. Per
    AGENTS.md, MAC is tracked per-location in `StockLocationItem.movingAvgCost`;
    the material detail header should aggregate across locations.
88. **UX — No "New Material" or "Edit" button on mobile material pages.** The
    materials list page has Export/Share/Search/Sort/Category filters but no
    create button. The material detail page has no edit button. Users cannot
    create or edit materials from the mobile surface — a significant gap for a
    field-first app where site engineers may need to add materials on the go.
    (The desktop surface has full create/edit per finding #18.)

### Mobile Land (`/m/land/[id]`) — Round 2
89. **UX — No document upload for permissions/NOC on mobile.** The land detail
    page has an excellent "Permissions, Legal & NOC" checklist with 8
    permissions (Ownership Certificate, Non-Encumbrance, Land Sanction/CLU,
    Mutation, ATS, Transfer Duty, Pollution NOC, Fire NOC) with dependency
    chains and Yes/No/N/A buttons — but no document upload capability. Users
    can mark a permission as "Yes" but cannot attach the actual certificate PDF
    or image. The desktop surface has document upload (per AGENTS.md
    `LegalDocument` model). Mobile users can only toggle status, not upload
    proof.
90. **UX — No cost breakup section on mobile land detail.** Alpha Road 2
    requested land cost breakup (registration charges, stamp duty, legal fees,
    broker fees, mutation charges). The mobile land detail shows only "Cost
    ₹9Cr @ ₹3,000/sqft" — no breakdown of what makes up the ₹9Cr. The desktop
    surface may have this (not verified in this round), but mobile users see
    only the total.
91. **CONFIRMED — PLOT-1A still shows contradictory "Hold" + "Available" +
    "Sold" statuses.** Same as finding #67. PLOT-1A card shows "Hold" label,
    "Available" badge, and "Sold to Verma Traders for ₹5,20,00,000.00" text
    below. Three contradictory status indicators on one card. This appears to
    be a stale cache issue (the desktop fix #6 was applied but the mobile page
    still serves cached data) or the mobile page reads `purpose` (Hold) and
    `status` (Available) separately without checking if a sale exists.

### Mobile Sales (`/m/sales/[id]`) — Round 2
92. **UX — No payment plan schedule on mobile sale detail.** Alpha Road 3
    requested payment plans (slab-wise: booking amount, on allotment, on
    possession, etc.). The mobile sale detail shows "Paid so far ₹45L" and a
    list of 2 payments (Cheque ₹30L, RTGS ₹15L) but no payment plan schedule
    showing future installments, due dates, or slab breakdown. Users can't see
    what payments are upcoming.
93. **UX — No broker/commission field on mobile sale detail.** The desktop
    sale cards show broker (e.g., "Ramesh Broker" per finding #35), but the
    mobile sale detail for Rajesh Sharma shows "Source: SELF" with no broker
    field, commission amount, or commission payment status. Alpha Road 3
    requested broker/commission tracking.
94. **UX — No Terms & Conditions on mobile sale detail.** Alpha Road 3
    requested printable sale form with T&C. The mobile detail has a "Form" link
    (to `/sales/[id]/print`) but no T&C visible on the detail page itself. The
    T&C may be on the printable form (not tested), but it's not visible in the
    sale workflow on mobile.

### Mobile HR (`/m/hr`, `/m/site/attendance`) — Round 2
95. **FEATURE GAP — Attendance types don't match Alpha Road 5 spec.** Alpha
    Road 5 requested attendance types P/H/Late/PL/NPL (Present, Half, Late,
    Paid Leave, Non-Paid Leave). The mobile attendance form has
    Present/Absent/Half/OT/Leave — "Late" is missing, "PL" and "NPL" are
    collapsed into a single "Leave" without paid/unpaid distinction, and "OT"
    (overtime) is added but not in the spec. The filter tabs on the attendance
    list page also only have Present/Absent/Half Day/Leave — no "Late" or
    "PL/NPL" filters.
96. **UX — All attendance times show "—" (no check-in time).** The attendance
    list page shows "— · 23 Aug 2026" for all 7 workers. The "—" is where the
    check-in time should be. Per AGENTS.md, GPS-tagged attendance captures
    `checkInLat`/`checkInLng` and timestamps — but the time is not displayed.
    This makes the GPS attendance feature appear non-functional.
97. **FEATURE GAP — No customizable H1-H6 team hierarchy.** Alpha Road 5
    requested a customizable hierarchy (H1-H6) where seniors add juniors. The
    Team & Permissions page (`/m/settings/team`) has 13 fixed roles (Owner,
    Admin, Project Manager, Supervisor, Accountant, Sales Manager, etc.) with a
    5-tier delegation hierarchy — but these are predefined roles, not
    customizable hierarchy levels. Users can't define their own H1-H6 levels
    or create a custom reporting structure. The delegation tiers (T1-T5) are
    fixed in code (`@/lib/roles.ts`), not user-configurable.

### Mobile Suppliers (`/m/suppliers`)
98. **UX — No "New Supplier" button on mobile suppliers page.** The suppliers
    list shows 18 suppliers with dues tracking and search, but there's no
    "New Supplier" or "Add" button. Users cannot create suppliers from the
    mobile surface. The "New Supplier" creation only happens inline during
    PO creation (per finding #61, the Convert-to-PO dialog has "Create new
    supplier" which works). But there's no standalone supplier creation path
    on mobile.

### Mobile Rent (`/m/rentals`)
99. **BUG — `/m/rent` returns 404.** The Rent module is at `/m/rentals`, not
    `/m/rent`. Users who try the obvious URL get a 404. The module itself
    (`/m/rentals`) works — shows "Add new tenancy" button, filters (All/
    Overdue/Expiring/Active), and empty state. But it's empty (0 tenancies,
    same as desktop finding #41). No rent agreement, tenant, or yearly
    increment can be tested end-to-end.

### Mobile Reports (`/m/reports`) — Round 2
100. **BUG — Project Costs show ₹58L (Reports) vs ₹9.49Cr (Project detail).**
     The Reports page shows "Project Costs ₹58,00,000.00" while the Greenfield
     Residency project detail shows "Cost ₹9,49,16,600.00". The Reports page
     counts only explicit `ProjectCost` entries (equipment, contractor,
     overhead, labour = ₹58L), while the project detail includes land cost
     (₹9Cr) + material issues + project costs. Neither page labels which cost
     basis is being used. This is the same root cause as finding #77 (Net
     Profit inconsistency) — different pages use different cost definitions
     without labeling them.

### Mobile Settings (`/m/settings`) — Round 2
101. **BUG — Payables mismatch persists (amounts changed).** Settings shows
     "Pending payables: 18 vendors ₹88,06,350.00" while Accounts shows
     "Payables ₹83,90,046.00 · 5 vendors". The vendor count (18 vs 5) and
     amount (₹88.06L vs ₹83.90L) are both different. The Accounts page counts
     only vendors with outstanding PO balances (5), while Settings counts all
     vendors (18). The amounts differ because different queries include/
     exclude different payable components. Same issue as finding #57 but with
     updated amounts after re-seed.

### Cross-Module Data Consistency Issues (Round 2 Summary)
102. **FIXED — Profit/revenue/cost figures are inconsistent across 4
     pages.** The same business metrics showed different values depending
     on which page you viewed:
     - **Net Profit**: ₹1.47Cr (Reports #77) vs -₹3.31Cr (desktop Home #77)
     - **Revenue**: ₹2.29Cr (Reports, cash received) vs ₹6.30Cr (Home, booked)
       vs ₹7.50Cr (Sales Collections, booked)
     - **Project Costs**: ₹58L (Reports) vs ₹9.49Cr (Project detail)
     - **Payables**: ₹88.06L/18 vendors (Settings) vs ₹83.90L/5 vendors
       (Accounts)
     - **Cost/sqft**: ₹12,169 (Project detail) vs ₹22,871 (Home orbit)
     Each page used a different calculation basis (cash vs accrual, total vs
     explicit, all vendors vs due vendors) without labeling which basis was
     used. **Fix**: Added clarifying labels/subtitles to the mobile Reports
     page (`/m/reports`) headline metrics and cost breakdown rows (e.g.
     "Revenue = cash received (not booked)", "Project Costs = explicit cost
     entries only", "Land + material issues are tracked per-project on the
     project detail page"). Added basis notes to the desktop
     `OwnerFinancialDashboard` ("Booked (accrual)" under Total Revenue,
     "Land + materials + explicit costs" under Total Cost). The numbers
     remain different by design (different bases serve different purposes),
     but now each is labeled so users can reconcile them.

---

## Round 3 — Mobile Module Verification & Fixes

### Routing
99. **FIXED — `/m/rent` returns 404.** No mobile rent route existed. Fix:
     added `/m/rent/page.tsx` with `redirect("/m/rentals")` (mirrors the
     desktop `/rent` → `/sales?tab=pipeline` redirect). Also added
     `/rent/page.tsx` for the desktop surface.

### Materials (Mobile)
87. **FIXED — Moving Average Cost shows ₹0.00 at material level on mobile
     material detail.** The mobile material detail page displayed
     `material.currentCost` which was ₹0.00 despite location-level MAC being
     correct. Fix: computed an `aggregateMac` as a weighted average of
     `stockItems` quantities × their `movingAvgCost`, and displayed that
     instead. Same fix applied to the desktop `MaterialCockpit` component
     (uses `totalValue / totalQty`). Also fixed
     `refreshMaterialCurrentCost()` in `packages/services/src/stock-ledger.ts`
     to use a weighted average (qty × MAC) instead of a simple average.
     Additionally fixed the PATCH `/api/materials/[id]` endpoint which was
     overwriting `currentCost` with `standardCost` on every edit — removed
     that line so MAC is only managed by `refreshMaterialCurrentCost()`.

88. **FIXED — No "Edit" button on mobile material detail.** The "New
     Material" FAB already existed on the materials list page (as a
     `MobileFab` with `fixed` positioning — invisible in Playwright
     accessibility snapshots but present in the DOM). Added an "Edit
     material" FAB to the mobile material detail page (`/m/materials/[id]`)
     for users with `INVENTORY_MANAGE` permission. Created
     `/m/materials/[id]/edit/page.tsx` which reuses the
     `MobileNewMaterialClient` form in edit mode (PATCH to
     `/api/materials/[id]`).

### Land (Mobile)
91. **FIXED — PLOT-1A contradictory statuses on mobile land detail.** The
     mobile land detail page's status badge used the raw `p.status` field
     ("AVAILABLE") even when the parcel was sold. Fix: updated the rendering
     logic to display "SOLD" if the parcel has an active sale
     (`p.sale != null && p.sale.status !== "CANCELLED"`), overriding
     `p.status`. The "Hold" purpose label is now hidden when a parcel is
     sold. Added "RESERVED" and "RENTED" to the `STATUS_META` object. The
     land list page now correctly counts sold parcels and excludes them
     from `unsoldValue` / `costBasis` calculations.

### Attendance (Mobile)
95. **FIXED — Attendance types missing Late, PL/NPL distinction.** The
     `AttendanceStatus` Prisma enum already had `LATE`, `PAID_LEAVE`, and
     `NON_PAID_LEAVE`, but the mobile attendance form
     (`MobileAttendanceForm`) only offered 5 options (Present, Absent,
     Half Day, Overtime, Leave). Fix: added all 3 new statuses to the form's
     `STATUS_CONFIG` and `ALL_STATUSES` array, with distinct colors (Late =
     signal/amber, PL = steel/blue, NPL = stop/red). Updated the summary
     band to show counts for each status with single-letter labels
     (P/L/A/H/OT/L/PL/NPL). Updated the "mark all present" toast to count
     all non-present statuses. Added the new statuses to the attendance
     list filter chips and the `MobileStatusBadge` tone map.

96. **FIXED — Attendance times show "—" in the list.** The mobile
     attendance list page (`/m/attendance`) did not include `checkIn` /
     `checkOut` in the serialized data passed to the client component. Fix:
     added `checkIn` and `checkOut` (formatted as `HH:MM`) to the
     serialized records, added them to the `AttendanceListItem` type, and
     appended them to the row subtitle (e.g. "Greenfield Residency ·
     12 Aug 2024 · 09:15–17:30").

### Suppliers (Mobile)
98. **VERIFIED — "New Supplier" FAB exists on mobile suppliers page.**
     The `MobileSuppliersList` component already renders a `MobileFab` with
     `href="/m/suppliers/new"` for users with `PROCUREMENT_MANAGE`
     permission. The FAB uses `fixed` positioning so it doesn't appear in
     Playwright accessibility snapshots, but it is present in the DOM
     (verified via `getBoundingClientRect()`).

### Sales (Mobile)
92. **VERIFIED — Payment plan schedule already rendered on mobile sale
     detail.** The `MobileSaleDetailClient` component already includes a
     "Payment Schedule" section (rendered when `paymentSchedule.items.length
     > 0`) showing each installment's number, description, percentage, and
     amount. The seed data has no payment schedules, so the section is
     empty — this is a data gap, not a code gap.

93. **VERIFIED — Broker/commission fields already rendered on mobile sale
     detail.** The `MobileSaleDetailClient` component already includes a
     "Deal source + broker + terms" section that renders broker name,
     phone, agency, commission amount, and commission status (Paid /
     Accrued / Pending) when those fields are present. The seed data has
     no broker-linked sales, so the section is empty — data gap, not code
     gap.

### Accounts & Settings (Mobile)
101. **FIXED — Payables mismatch between Settings and Accounts.** The
     Settings page used `getSupplierOutstanding()` (all 18 suppliers,
     counting all as "vendors"), while the Accounts page used a direct
     Prisma query with `take: 5` and `balanceOwed: { gt: 0 }` (only 5
     vendors, summing only those 5). Fix: updated the Accounts page to use
     the same `getSupplierOutstanding()` service function for consistency,
     then filter to `balanceOwed > 0` for the displayed list while summing
     all for the total. Both pages now show the same total payables amount
     and the same vendor count (suppliers with outstanding balance > 0).
     Settings page hint updated from "18 vendors" to "N vendors with dues".

### Land — Document Upload (Mobile)
89. **VERIFIED — Document upload for permissions/NOC already exists on
     mobile land detail.** The `MobileLegalDocsSection` component (rendered
     on `/m/land/[id]`) includes a full legal document form with file
     upload support (`<input type="file">` → POST `/api/uploads` → stores
     `documentUrl` + `documentName`). The section shows a progress bar
     ("0/4 required permissions obtained"), stage-grouped checklist
     (Feasibility & Land, Sanction, Post-Completion), and an "Add" button
     to create new legal documents. The seed data has no legal documents,
     so the section appears empty — data gap, not code gap.

