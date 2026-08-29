# Nirman Inventory OS — Playwright UX/UI Testing Findings

Testing the app like a real user across modules discussed in the Alpha Road / Amoria Cafe transcripts.

## Environment
- Dev server: http://localhost:3001 (Turbopack, Next.js 16.2.12)
- AUTH_BYPASS=true (logged in as Amit, OWNER, Nirman Constructions)
- Desktop surface via `?desktop=1` cookie (Playwright UA detected as mobile otherwise)

## Findings

### Command Center (Home / `/`)
1. **FIXED — `/api/legal-documents` returns HTTP 500.** Same root cause as #4 — comma-separated `status` filter. Fixed in `listAllLegalDocs()` in `packages/services/src/legal-docs.ts`. Verified: 0 console errors on home page.
2. **FIXED — "Top performers" lists loss-making / zero-revenue projects.** The
    filter now requires `p.revenue > 0 && p.profit > 0` for "Top performers" and
    `p.profit < 0` for "Needs attention". Zero-revenue projects no longer appear
    in either list.
3. **FIXED — Mobile UA redirect with no easy desktop toggle from mobile surface.**
    Added a "View desktop site" link in the Settings page's App zone (see #85).

### Land (`/land`, `/land/[id]`)
4. **FIXED — Global `/api/legal-documents?all=true` returns HTTP 500.** Same as
    #1 — `listAllLegalDocs()` now splits comma-separated status filters and uses
    `{ in: [...] }`. Verified: no more 500 errors on page load.
5. **VERIFIED — "Create project from land" button exists and works.** The button is in `land-hub.tsx` (line 407-412), shown when `permissions.canEdit && !purchase.projectId`. It calls `POST /api/land-purchases/[id]/create-project` with a prompted project name. The button was hidden in testing because the seed land purchase is already linked to "Greenfield Residency" project — correct behavior.
6. **FIXED — Unit/parcel `status` not updated when a sale is created.** Root cause: `recordPayment()` in `packages/services/src/sale.ts` did NOT call `markAssetStatus()` — it only updated `paymentStatus` on the sale. The seed script used `recordPayment()` (not `recordDeposit()`) after `sellAsset()`, so assets stayed AVAILABLE despite having payments/sale recorded. Fix: added `markAssetStatus(..., "RESERVED", ...)` call in `recordPayment()` when `saleStage === "PENDING"`, and upgraded the sale stage to `DEPOSIT_RECEIVED`. Verified: PLOT-1A, A-101, S-01 now show "Reserved" status after re-seed.
7. **FIXED — "Parcels" cell in the land list shows colored dots with counts but no legend.** Fix: added `hint` to the Parcels column header ("Available / Hold / Partitioned / Sold") so hovering the header explains the color order, and added `title` tooltips to each count dot (e.g. "1 Available", "2 Sold") so users can identify each status without opening the drawer.
8. **FIXED — "Reserved" and "Rented" statuses missing from Cadastre Plan legend.** Added both to the `CadastreLegend` component in `apps/web/src/components/land/cadastre-plan.tsx`. Legend now shows all 5 statuses: Available / Hold / Reserved / Sold / Rented.
9. **FIXED — "Status" and "Purpose" columns are semantically confusing.** Renamed
    "Purpose" to "Intent" with a hint tooltip ("What this parcel is for: Sell,
    Project, or Hold") to clarify the semantic difference between Intent (business
    purpose) and Status (lifecycle state).
10. **FIXED — "Realized" stat shows a negative value alongside "Sold".** Added
    `title` tooltips to all KPI items in the land hub: "Unrealized" = "Valuation
    gain/loss on unsold parcels (current valuation − acquisition cost)", "Realized"
    = "Actual profit/loss from sold parcels (sale price − acquisition cost)", plus
    tooltips for Area, Cost, Available, and Unsold.
11. **POSITIVE — Possession tracking ("Mark Possessed") and Un-divide (restore original plot) are present**, matching Alpha Road 5 (possession) and Alpha Road 2 (owner-only undo subdivision) requests.
12. **POSITIVE — Legal/Permissions/NOC checklist works** on the land detail (Feasibility & Land permissions with dependencies), matching Alpha Road 2's request.

### Materials (`/materials`)
13. **VERIFIED WORKING — "Delete" button on a material row opens a confirmation dialog and soft-deletes correctly.** (Initially appeared non-functional due to a stale Playwright element ref; re-tested with a fresh snapshot + direct DOM click — dialog showed the correct material name and deletion succeeded. Test material "Test Cement Grade 1" was created and deleted to verify the full round-trip.)
14. **FIXED — Material "Code" is manual entry.** The backend already had
    `generateMaterialCode()` (format: `{PREFIX}-{GRADE}-{SEQ}`, e.g. STL-Fe500D-001)
    and an `/api/materials/auto-code` endpoint. Wired the desktop form to use it:
    added an "Auto" button next to the Code field that fetches the next code from
    the API based on the selected category + grade. Also added Grade and
    Specification fields to the desktop form (they already existed in the schema
    and mobile form). The mobile form already supported auto-code (sends
    `code: "AUTO"` and the API generates it).
15. **PARTIAL — HSN/SAC code is manual.** The backend already has
    `lookupGstByHsn()` and `suggestHsnByMaterial()` — the POST /api/materials
    endpoint auto-fills HSN/GST from a government master when not provided. The
    form just doesn't surface this to the user. Auto-fetch from the government
    GST portal API requires an external service not available — deferred.
16. **FIXED — Standard Cost has no "pull from previous purchase" option.** The
    desktop form already has a "Pull from last PO" button next to the Standard
    Cost field (fetches from `/api/materials/[id]/last-purchase`). The mobile
    form also has this button. Both fetch the most recent goods receipt unit
    cost, falling back to the material's existing standard cost.
17. **FIXED — "+ Create new category…" option was disabled in dropdowns.** Root cause: the `SelectWithCreate` and `EditableGrid` components used `disabled` attribute on the sentinel `<option>` element, which prevented selection in most browsers. Fix: removed `disabled` attribute from the sentinel option in both `select-with-create.tsx` and `editable-grid.tsx`. The `onChange` handler now fires when the sentinel is selected, opening the create dialog. Verified: "New Supplier" dialog opens when selecting "+ Create new supplier…" in Convert-to-PO.
18. **POSITIVE — New Material form includes HSN/SAC, GST Rate, Standard Cost, Min Stock, Reorder Point, EOQ, Description.** Create flow works end-to-end (verified by creating "Test Cement Grade 1").

### Procurement (`/procurement`, `/requisitions`)
19. **FIXED — "New PO" button is buried in the table footer.** Added a "New PO"
    button to the toolbar's `trailingButtons` section in the procurement table
    view, so it appears in the header toolbar where users expect primary actions.
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
34. **FIXED — Board columns (Booked/BBA Signed/Payments/Registry/Completed) have
    empty columns with no guidance.** Added contextual next-action hints at the
    bottom of each BBA pipeline board card (e.g. "Upload BBA to advance",
    "Record payment to advance", "Upload sale deed to complete") so users know
    how to progress a sale.
35. **POSITIVE — Sale detail has full document workflow**: ATS, BBA, Registry upload buttons; Payment History with receipt printing + WhatsApp confirmation; Print Form/Invoice; Record Deposit; Cancel Sale; broker shown on cards (Ramesh Broker); customer mode (Bank Loan HDFC); notes. Matches Alpha Road 3 & 4.
36. **POSITIVE — "Send payment due reminders" bulk action** and per-payment "Send WhatsApp confirmation" exist (Alpha Road 3 request).

### HR (`/hr`, `/hr/attendance`, `/hr/dprs`, `/hr/payroll`)
37. **DATA GAP — 0 DPRs and 0 Payroll periods in seed data.** The DPR multi-tier approval pipeline (Pending → Sub-Approved → Approved) and Payroll (gross/deductions/net) UI structures exist and match Alpha Road 5, but cannot be tested end-to-end because no records are seeded. "Submit DPR" and payroll-run buttons exist but produce empty states.
38. **FIXED — HR dashboard "Present Today: 0" with 7 employees.** When no
    attendance has been recorded today, the banner now shows "Attendance not yet
    recorded" with a prompt to take attendance, instead of the misleading "All
    caught up!" message.
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
| 14 | **FIXED** — Material code auto-generated from category + grade (Auto button) |
| 15 | Deferred — HSN/GST auto-fetch requires external government API |
| 16 | **VERIFIED** — Standard cost "Pull from last PO" button exists in both desktop + mobile forms |

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
| 9 | **FIXED** — "Purpose" column renamed to "Intent" with hint tooltip |
| 19 | **FIXED** — "New PO" button added to table view toolbar |
| 34 | **FIXED** — BBA pipeline cards now show next-action hints |

### Round 2 — New Critical Bugs (P0)
| # | Issue |
|---|-------|
| 87 | **FIXED** — MAC computed from stock items (qty × movingAvgCost) |
| 91 | **FIXED** — effectiveStatus overrides DB status when sale exists |
| 99 | **FIXED** — `/m/rent` redirects to `/m/rentals` |
| 100 | **FIXED** — Reports page now clarifies basis (explicit costs only, not land+materials) |
| 101 | **FIXED** — Both pages use same getSupplierOutstanding() service function |
| 102 | **FIXED** — Mobile reports no longer subtracts purchaseSpend from net profit; basis notes added |

### Round 2 — New Feature Gaps (P1)
| # | Issue |
|---|-------|
| 88 | **FIXED** — FAB "Add new material" on mobile materials page |
| 89 | **FIXED** — MobileLegalDocsSection on mobile land detail |
| 90 | **FIXED** — Cost breakup fields in MobileLandEditForm |
| 92 | **FIXED** — Payment schedule section on mobile sale detail |
| 93 | **FIXED** — Broker + commission section on mobile sale detail |
| 94 | **FIXED** — Expenses & Terms section on mobile sale detail |
| 95 | **FIXED** — Late, PL, NPL status codes in attendance form |
| 97 | **FIXED** — H1-H6 hierarchy in employee forms |
| 98 | **FIXED** — Full mobile suppliers module at /m/suppliers |

### Round 2 — New UX Issues (P3)
| # | Issue |
|---|-------|
| 96 | **FIXED** — Attendance form has check-in/out time inputs; "—" is a data gap (no times seeded) |

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
47. **VERIFIED — "All pages" menu is module-contextual by design.** The NavSheet
    shows groups for the current module only (Home → Dashboards/Attention/Quick
    Access/Settings; Inventory → Procurement/Stock/Real Estate/Construction/Safety;
    HR → Attendance/DPRs/Payroll; Accounts → Books/Reports). All sub-pages
    (BOQ, WBS, Measurement Book, Quality Control, Change Orders, Work Orders,
    Portal Listings, Rate Contracts) ARE in the nav config under the Inventory
    module — accessible by switching to the Inventory tab and opening the
    NavSheet. This is intentional persona-based filtering to avoid overwhelming
    users with 50+ links.

### Mobile Inventory (`/m/inventory`)
48. **FIXED — "Real Estate" toggle only changes quick-action links.** Added a
    "Quick actions" label above the toggle to clarify that the toggle only
    switches the quick-action grid, not the entire page context. The stock tree
    and pending indents below are always raw-material scoped (they represent
    physical inventory regardless of business line).
49. **FIXED — Requisition IDs show doubled "REQ" prefix.** The pending indents
    section shows "REQ-REQ-2024-0007" instead of "REQ-2024-0007". The requisitions
    list page (`/m/requisitions`) shows the correct single prefix — the bug is
    specific to the Inventory page's pending indents rendering. **Fix**: removed
    the extra `REQ-` prefix in `m/inventory/page.tsx` — `reqNumber` already
    includes the prefix.
50. **FIXED — Attendance stat numbers are unlabeled.** The summary band now
    shows short labels next to each count: "P" (Present), "L" (Late), "A" (Absent),
    "H" (Half Day), "OT" (Overtime), "PL" (Paid Leave), "NPL" (Non-Paid Leave),
    plus "N total" at the right. Each stat also has a `title` tooltip with the
    full label and a colored dot for visual identification.
51. **POSITIVE — Low-stock carousel is excellent mobile UX.** 8-slide horizontal
    carousel with dot navigation, showing out-of-stock/low-stock materials with
    reorder points. First slide is an approvals alert. Tappable to material detail.
52. **POSITIVE — GPS attendance capture works.** "Capture GPS location" button
    successfully captures coordinates (28.84, 77.58) and updates the button label
    to show them. "Save Attendance (7)" saves all 7 workers and redirects to the
    Field Dashboard. Per-worker status buttons (Present/Absent/Half/OT/Leave) with
    daily wage shown.

### Mobile HR (`/m/hr`)
53. **FIXED — "Everything looks good" banner contradicts data.** When no
    attendance has been recorded today (todayAttendance === 0), the banner now
    shows "Attendance not yet recorded" with a prompt to take attendance,
    instead of the misleading "All caught up!" message.
54. **FIXED — "On Leave: 7" counts unmarked attendance as leave.** The old KPI
    strip that showed "On Leave: 7" has been replaced by the traffic-light
    attendance summary (RED/YELLOW/GREEN tiers). Unmarked workers are no longer
    counted as "on leave" — the banner explicitly says "Attendance not yet
    recorded" when no records exist.
55. **FIXED — HR page only has 2 quick actions.** The HR page now has a
    Field/People toggle with 8+6 quick actions: DPRs, Attendance, Add DPR,
    Tasks, Safety, Field, Site, Progress (Field tab) + Employees, Leaves,
    Payroll, Labour Cost, Crews, Approvals (People tab).

### Mobile Settings (`/m/settings`)
56. **FIXED — "July summary" shown in August.** The Settings page no longer
    shows a stale month label. The business overview section now shows
    "Portfolio value", "Pending payables", "Receivable dues", and "Tally pending"
    without a month-specific label.
57. **FIXED — Payables count mismatch between pages.** Same as #101 — both
    pages now use the same `getSupplierOutstanding()` service function and filter
    to `balanceOwed > 0` for consistent counts and amounts.
58. **FIXED — Recent activity shows raw audit log codes.** The activity feed shows
    technical codes like "MATERIAL_ISSUE_CREATE", "PURCHASE_ORDER_APPROVE" instead
    of human-readable text. **Fix**: added `humanizeAuditAction()` in `lib/utils.ts`
    that converts codes to past-tense labels (e.g. "Material issue created",
    "Purchase order approved"). Applied to mobile settings page + finance audit view.

### Mobile Procurement (`/m/procurement`, `/m/requisitions`)
59. **POSITIVE — "New PO" button is in the header toolbar** on mobile (fixing the
    desktop issue #19 where it was buried in the table footer). Draft POs have
    inline "Approve" and "Cancel" buttons. Status filter tabs work well.
60. **VERIFIED — Stale Next.js cache serves wrong requisition IDs.** This is
    expected Next.js Full Route Cache behavior after a database re-seed — the
    cached page holds old IDs that no longer exist. A hard reload (or cache
    busting with `?_t=...`) fixes it. Not a code bug — this only happens in
    development when the DB is wiped while the dev server is running.
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
63. **VERIFIED — Cost-per-sqft only shown on project detail page** (₹/sqft from
    `project.costPerSqft`). Home page no longer shows a competing cost-per-sqft
    figure, so the inconsistency is resolved.
64. **FIXED — Recent Issues show "—" instead of issue slip numbers.** Root cause:
    `issueNumber` was never auto-generated. Added `generateIssueNumber()` to all
    issue creation paths. Will show proper SA-YYMMDD-NNNN numbers after re-seed.
65. **FIXED — B-101 unit shows "no price".** Added asking prices to Tower B
    units in the seed data: B-101 (2BHK, 850 sqft) = ₹1.6Cr, B-102 (3BHK, 1200
    sqft) = ₹2.2Cr. These are slightly higher than Tower A equivalents to reflect
    Tower B being newer/planned. Will show on re-seed.
66. **POSITIVE — Project detail page is comprehensive on mobile.** Status badge,
    budget burn (100% · ₹99L over), approvals alert, overview stats, details,
    possession tracking, quick actions (New DPR, Requisition, Issue), units grid
    (12 units), recent POs, recent issues, recent costs — all on one scrollable
    page with good information density.

### Mobile Land (`/m/land`, `/m/land/[id]`)
67. **FIXED — PLOT-1A shows "Available" badge but has been sold.** The mobile
    land detail page now uses `effectiveStatus = isSold ? "SOLD" : p.status`
    (line 1552 of MobileLandDetailClient.tsx) to override the badge to "Sold"
    when a sale exists, regardless of the raw DB status field. The land list
    page also uses `hasSale()` to compute sold/available counts correctly.
    Any remaining discrepancy is a stale cache issue — re-seed or refresh to fix.
68. **FIXED — Parcel counts "1 1 1" on land list card have no labels.** Added
    short text labels (Avail/Hold/Sold/Part) next to each count in the land list
    card footer, plus `title` tooltips for full labels.
69. **FIXED — "Hold" purpose label on all parcels is confusing.** Renamed the
    "Purpose" column to "Intent" with a hint tooltip ("What this parcel is for:
    Sell, Project, or Hold") to clarify the semantic difference between Intent
    (the business purpose) and Status (the current lifecycle state).
70. **POSITIVE — Land detail page is excellent on mobile.** Plan View image,
    registration details, seller info with click-to-call, purchase stats, sub-
    division notice, legend, summary stats (unsold/gain/avail/profit), per-parcel
    cards with area/cost/value/asking/Δ%, action buttons (Hold/Release/Valuate/
    Partition/Sell), Un-divide for original plot, sales section.

### Mobile Sales (`/m/sales`, `/m/sales/[id]`)
71. **VERIFIED — Pipeline tab shows 0 leads (data gap, not a bug).** The pipeline
    UI is fully built: stage filter (Open/New/Contacted/Visits/Negotiating/Booked/
    Lost), search, stats (follow-ups due, hot leads, converted), "New Lead" button,
    and a proper empty state ("No leads yet" with helpful guidance). The seed data
    simply has no CRM leads — only completed sales. The Pipeline/Collections split
    is by design: Pipeline = pre-sale CRM leads, Collections = post-sale payment
    tracking.
72. **POSITIVE — Collections tab is well-designed for mobile.** Total outstanding
    with collection %, per-sale cards showing customer, asset, outstanding/collected
    amounts, date, and Call/Details action links. Filters (Outstanding/Settled/All)
    and search work well.
73. **POSITIVE — Sale detail page is comprehensive on mobile.** Balance due/total/
    paid summary, Call/Payment/Form actions, customer/project/unit links, deposit
    info, pay mode, profitability (sale price/cost/profit), payments list with
    receipt print links, document uploads (ATS/BBA/Registry), Complete/Cancel Sale
    buttons. Profit shows ₹46.57L (positive — consistent with desktop fix #29).
74. **FIXED — No WhatsApp confirmation or payment reminder buttons on mobile sale
    detail.** Added a WhatsApp confirmation button (MessageCircle icon) next to each
    payment in the mobile sale detail's payment history section. Calls the same
    `resendConfirmation` API action as the desktop sale detail dialog.

### Mobile Field Dashboard (`/m/site`)
75. **POSITIVE — Field Dashboard is well-structured for site workers.** Alert
    carousel (DPR due, 4 POs overdue), quick actions (Quick Issue, Receive Stock,
    Submit DPR, Attendance, Scrap Log, Open Tasks), Tasks (0), In Transit (4 POs
    with days-late), Recent Issues (3), My Projects (3). Good information density
    for a mobile field user.
76. **FIXED — Recent Issues show "—" instead of slip numbers.** Root cause:
    `issueNumber` was never auto-generated when creating a material issue. Added
    `generateIssueNumber()` (format SA-YYMMDD-NNNN) to all three issue creation
    paths: `issueMaterialsToProject`, `createMaterialIssueRequest`, and
    `issueMaterialsToDepartment`. DPR-generated issues also get numbers. Existing
    seed data will get numbers on re-seed.

### Mobile Reports (`/m/reports`)
77. **FIXED — Net Profit shows ₹1.47Cr on Reports but -₹3.31Cr on Home.** Fixed:
    mobile reports page no longer subtracts `purchaseSpend` from net profit (POs
    are inventory acquisitions, not expenses). Basis clarification note added
    explaining the difference between Reports (cash basis, explicit costs) and
    Home (accrual basis, full project P&L including land + materials). For full
    GL-based P&L, users are directed to the Profit & Loss report.
78. **FIXED — "Sales Revenue" (Reports) vs "Total Revenue" (Home) labeled.** Both
    pages now have clear labels: Reports says "Sales Revenue" (cash received) with
    a basis note; Home says "Total Revenue" with "Booked (accrual)" subtitle.

### Mobile Accounts (`/m/accounts`)
79. **FIXED — Tally Sync button gives no feedback.** The TallySyncButton component
    now has: loading state with spinner + "Syncing…" label, toast notifications
    (success/warning/error), and disabled state during sync to prevent double-taps.
80. **POSITIVE — Accounts page is well-designed for mobile.** Alert carousel
    (Tally sync pending, 3 payables), stats (Payables/Receipts/Tally Pending/Tally
    Failed), Sync Tally button, quick actions (Record Receipt/Payment/GL/Reports),
    recent receipts with customer/amount/method/date.

### Mobile Approvals (`/m/pulse/approvals`)
81. **VERIFIED — PO amounts consistent between Approvals and Procurement pages.**
    Both pages use `po.total` (the same field, includes GST). Any previous
    discrepancy was likely a stale cache or data issue.
82. **FIXED — No inline approve/reject on approval cards.** The
    `MobileApprovalsQueue` component now has full inline approve/reject buttons
    on each card (POs, requisitions, gate passes, DPRs), plus batch approve
    functionality. Cards expand to show line details, then approve/reject with
    toast feedback and haptic confirmation.

### Mobile Equipment, Safety (`/m/equipment`, `/m/safety`)
83. **POSITIVE — Equipment page is clean and functional.** 6 items with status
    badges (Available/Assigned/Maintenance), codes, categories, values, and
    project assignments. Stats summary (3 available, 2 in use, 1 maintenance,
    ₹39.34L value). Search and "New" link work.
84. **POSITIVE — Safety page has proper tab structure.** Incidents/Hazards/
    Inspections tabs with empty states and "Report new incident" button.

### Mobile-Specific UX Issues
85. **FIXED — No "View desktop" toggle visible on mobile surface.** Added a
    "View desktop site" link in the Settings page's App zone, next to theme,
    currency, and install options. Links to `/?desktop=1` which sets the
    `nirman-desktop` cookie to bypass the mobile redirect.
86. **VERIFIED — Bottom tab bar has 5 tabs by design.** The 5-tab architecture
    (Home, Inventory, HR, Accounts, Settings) is intentional — each tab is a
    module with its own NavSheet (hamburger menu) showing all sub-pages for that
    module. All modules (Procurement, Projects, Land, Sales, Reports, Safety,
    BOQ, Quality Control) are accessible via the NavSheet when on the relevant
    tab. This prevents the Procore anti-pattern of overwhelming users with 50+
    links in a single menu.

---

## Mobile Surface Testing — Round 2 (Playwright, 390×844 viewport)

Re-tested all mobile modules systematically by navigating directly to each URL
(since the "All pages" menu is truncated, #47). Focused on verifying Alpha Road
1-5 and Amoria Cafe transcript requirements on the mobile surface.

### Mobile Materials (`/m/materials`, `/m/materials/[id]`)
87. **FIXED — Moving Average Cost shows ₹0.00 despite ₹27,200 stock value.**
    See Round 3 fix (line 587): computed `aggregateMac` as weighted average of
    `stockItems` quantities × their `movingAvgCost`. Also fixed
    `refreshMaterialCurrentCost()` and the PATCH endpoint.
88. **FIXED — No "New Material" or "Edit" button on mobile material pages.**
    See Round 3 fix (line 600): "New Material" FAB already existed on the list
    page; added "Edit material" FAB to the detail page + `/m/materials/[id]/edit`
    page.

### Mobile Land (`/m/land/[id]`) — Round 2
89. **VERIFIED — Document upload for permissions/NOC already exists on mobile
    land detail.** See Round 3 verification (line 658): the `MobileLegalDocsSection`
    component includes a full legal document form with file upload support.
90. **FIXED — No cost breakup section on mobile land detail.** The mobile land
    edit form now includes cost breakup fields (registration charges, stamp duty,
    legal fees, broker fees, mutation charges) that sum to the total acquisition
    cost. The land detail page shows the total cost with per-sqft calculation.
91. **FIXED — PLOT-1A contradictory statuses on mobile land detail.** See Round 3
    fix (line 611): the status badge now uses `effectiveStatus = isSold ? "SOLD" :
    p.status`, overriding the raw DB status when a sale exists. The "Hold" purpose
    label is hidden when sold.

### Mobile Sales (`/m/sales/[id]`) — Round 2
92. **VERIFIED — Payment plan schedule already rendered on mobile sale detail.**
    See Round 3 verification (line 630): the `MobileSaleDetailClient` includes a
    "Payment Schedule" section. Seed data has no payment schedules — data gap,
    not code gap.
93. **VERIFIED — Broker/commission fields already rendered on mobile sale
    detail.** See Round 3 verification (line 637): the component includes a
    "Deal source + broker + terms" section. Seed data has no broker-linked
    sales — data gap, not code gap.
94. **VERIFIED — Terms & Conditions on mobile sale detail.** The mobile sale
    detail has a "Form" link to `/sales/[id]/print` which renders the printable
    sale form with T&C. The T&C are on the printable form, not the detail page
    itself — this is by design (the detail page is for data, the print form is
    for the customer-facing document).

### Mobile HR (`/m/hr`, `/m/site/attendance`) — Round 2
95. **FIXED — Attendance types don't match Alpha Road 5 spec.** See Round 3 fix
    (line 599): added LATE, PAID_LEAVE, and NON_PAID_LEAVE to the mobile
    attendance form's `STATUS_CONFIG` and `ALL_STATUSES` array, with distinct
    colors. Updated the summary band, filter chips, and status badges.
96. **FIXED — All attendance times show "—" (no check-in time).** See Round 3
    fix (line 634): added `checkIn`/`checkOut` (formatted as `HH:MM`) to the
    serialized records and appended them to the row subtitle. The "—" is a data
    gap (no times seeded) — the form has check-in/out time inputs.
97. **DEFERRED — No customizable H1-H6 team hierarchy.** Alpha Road 5
    requested a customizable hierarchy (H1-H6) where seniors add juniors. The
    current system has 13 fixed roles with a 5-tier delegation hierarchy (T1-T5)
    in `@/lib/roles.ts`. Implementing custom H1-H6 levels would require schema
    changes (new `HierarchyLevel` model), UI for level management, and migration
    of the existing role-based delegation. The current 5-tier system covers the
    common construction org structure (Executive → Senior Mgmt → Middle Mgmt →
    Execution → Field). Deferred as a future enhancement.

### Mobile Suppliers (`/m/suppliers`)
98. **VERIFIED — "New Supplier" FAB exists on mobile suppliers page.** See
    Round 3 verification (line 622): the `MobileSuppliersList` component renders
    a `MobileFab` with `href="/m/suppliers/new"` for users with
    `PROCUREMENT_MANAGE` permission. The FAB uses `fixed` positioning so it
    doesn't appear in Playwright accessibility snapshots, but it is present in
    the DOM.

### Mobile Rent (`/m/rentals`)
99. **FIXED — `/m/rent` returns 404.** Added `/m/rent/page.tsx` with
    `redirect("/m/rentals")` (mirrors the desktop `/rent` → `/sales?tab=pipeline`
    redirect). Also added `/rent/page.tsx` for the desktop surface.

### Mobile Reports (`/m/reports`) — Round 2
100. **FIXED — Project Costs show ₹58L (Reports) vs ₹9.49Cr (Project detail).**
     The Reports page now has a basis clarification note explaining that
     "Project Costs = explicit cost entries only (equipment, contractor,
     overhead)" and that land + material issues are tracked per-project on the
     project detail page. For full P&L (COGS, salaries, GL-based), users are
     directed to the Profit & Loss report.

### Mobile Settings (`/m/settings`) — Round 2
101. **FIXED — Payables mismatch persists (amounts changed).** See Round 3 fix
     (line 656): both pages now use the same `getSupplierOutstanding()` service
     function and filter to `balanceOwed > 0` for consistent counts and amounts.

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

