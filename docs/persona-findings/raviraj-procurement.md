# Procurement Workflow Audit — Raviraj Singh (Procurement Manager, SRG REALCON)

**Persona:** Raviraj Singh · `PROCUREMENT_MANAGER` · SRG REALCON · `9520002752`
**Reports to:** Vardaan (OWNER)
**Audit scope:** End-to-end procurement journey — dashboard → requisitions → quotations → comparative analysis → PO → GRN → supplier management → inventory → stock movements → supplier returns.
**Method:** Static code trace of page files, components, API routes, services, and Prisma schema. Every finding cites exact file paths and line numbers.

---

## Executive Summary

The procurement domain model is **substantially complete** at the service/schema layer. The comparative quote engine, PO lifecycle, goods receipt, stock ledger, and supplier returns are all transactionally sound and wired to APIs. The principal shortcomings are:

1. **One confirmed bug** — the quote-waiver action inside the Convert-to-PO dialog sends the wrong field name, so waivers from that dialog always fail.
2. **GSTIN format validation exists but is completely unwired** — neither server-side nor client-side.
3. **No external GST verification**, no reverse-charge mechanism, no 80:20 procurement compliance tracking, and no supplier registration-status field.
4. **Desktop/mobile fragmentation** — the desktop quotations tab is read-only and pushes the procurement manager to mobile for the #1 priority (comparative analysis), despite a fully functional desktop `ComparativeQuotePanel` existing inside the convert dialog.
5. **Low-stock alerts live on `/inventory`, not `/procurement`** — the dashboard the persona is expected to review first does not surface them.

---

## Step 1 — Procurement Dashboard

### What you see

`apps/web/src/app/procurement/page.tsx`

- **Permission gate** (lines 27–43): checks `PERM.PROCUREMENT_VIEW`; derives `canCreate`, `canApprove`, `canManagePayments`, `canApproveRequisitions` from role.
- **Data load** (lines 52–89): fetches POs, suppliers, materials, stock items, requisitions, quotation requests, and supplier returns in parallel.
- **Stats band** (lines 391–402): displays PO count, open PO value, and pending indent count.
- **Tabbed hub** (lines 404–419): passes all data into `ProcurementView` with tabs: `purchase-orders`, `indents`, `quotations`, `suppliers`, `direct-purchases`, `returns`.

`apps/web/src/components/procurement/procurement-view.tsx`

- **Tab definitions** (lines 82–85): Purchase Orders, Receive, Returns, plus Indents, Quotations, Suppliers, Cash Purchases.
- **New PO button** (lines 466–471): shown only when `canCreate` is true and supplier/location data exists.
- **PO board** (lines 508+): filters, exports, empty states, DataTable with sortable columns.

### What works

- PO list with status filters, company-group scoping, cursor pagination — `apps/web/src/app/api/purchase-orders/route.ts` lines 10–85.
- Requisitions tab loads pending/approved indents with quote counts — `apps/web/src/components/requisitions/requisitions-view.tsx` lines 475–502.
- Supplier returns tab renders `SupplierReturnsView` — `procurement-view.tsx` lines 141–151.

### What is broken / missing

- **No low-stock alerts on the procurement dashboard.** The page fetches stock items (line 52–89) but the stats band (lines 391–402) only shows POs, open value, and indents. Low-stock and out-of-stock banners exist on `/inventory` (`apps/web/src/app/inventory/page.tsx` lines 94–244) but are **not surfaced on `/procurement`**. A procurement manager reviewing the dashboard would not see replenishment needs.

### What is confusing

- The dashboard has **six tabs** plus a "Receive" pseudo-tab in the breadcrumb (line 83 lists "Receive" without a `tab` value). It is unclear whether "Receive" is a separate view or part of the PO tab.
- The "Suppliers" tab inside procurement duplicates the dedicated `/suppliers` page, but with less detail (no ratings tab, no cockpit). Users may not know which to use.

---

## Step 2 — Pending and Approved Requisitions

### What you see

`apps/web/src/app/requisitions/page.tsx` (lines 1–6): redirects `/requisitions` → `/procurement?tab=indents`.

`apps/web/src/components/requisitions/requisitions-view.tsx`

- **Quote count** (lines 475–483): shown only for APPROVED requisitions.
- **Actions** (lines 487–502): submit, delete, approve, reject, awaiting-approval.
- **Convert dialog** (lines 995–1038): embeds `ComparativeQuotePanel` and manual line-cost inputs.

`apps/web/src/components/requisitions/requisition-detail-dialog.tsx`

- **Detail fetch** (lines 48–60): loads `/api/requisitions/${id}` on open.
- **Keyboard shortcuts** (lines 62–85): submit, approve, reject, convert.
- **Comparative summary** (lines 325–351): gate status, cheapest quote, selected quote, waiver state.
- **Attachments + audit trail** (lines 353–355).

### What works

- **Requisition API** (`apps/web/src/app/api/requisitions/route.ts`): GET lists scoped through project company (lines 9–47); POST creates with auto-submit by default (lines 50–92).
- **Requisition detail API** (`apps/web/src/app/api/requisitions/[id]/route.ts`): GET loads lines with stock, last rate, preferred supplier, quote summary (lines 17–64); PATCH handles submit/approve/reject/waiveQuotes/convert (lines 130–193); DELETE only for DRAFT/REJECTED (lines 201–227).
- **Self-approval prevention** (lines 135–143, 150–158): requester cannot approve or reject their own indent.
- **Requisition service** (`packages/services/src/requisition.ts`): `convertRequisitionToPo` (line 426) enforces the quote gate (lines 448–470) and auto-fills winning quote line costs (lines 494–520).

### What is broken / missing

- **CONFIRMED BUG — waiver field mismatch in ConvertToPoDialog.**
  - `apps/web/src/components/requisitions/convert-to-po-dialog.tsx` line 68 sends `{ action: "waiveQuotes", waiveReason: waiveReason.trim() }`.
  - `apps/web/src/app/api/requisitions/[id]/route.ts` line 166 reads `const reason = body?.reason as string;` and line 167 rejects if `!reason?.trim()`.
  - Because the dialog sends `waiveReason` but the API reads `reason`, the API always sees `undefined` and returns `"A waiver reason is required"` (400). **Waiving from the convert dialog is broken.**
  - Note: the `ComparativeQuotePanel` (`apps/web/src/components/requisitions/comparative-quote-panel.tsx` line 137) sends `{ action: "waiveQuotes", reason: waiveReason.trim() }` — **this path works correctly.** So the bug is isolated to the `ConvertToPoDialog` waiver button.

### What is confusing

- The quote engine is **embedded inside the convert dialog** rather than presented as a dedicated procurement comparison workspace. A procurement manager must open the "Convert to PO" dialog to access the comparative statement, which conflates "review quotes" with "create PO."
- The convert dialog shows **manual line-cost inputs** (lines 1020–1038) even when a winning quote has been selected. The service auto-fills from the winner (`requisition.ts` lines 494–520), but the UI does not reflect this — the user may manually enter costs that get silently overridden, or may be confused about whether their input matters.

---

## Step 3 — Quotation Collection (Multiple Supplier Quotes)

### What you see

`apps/web/src/app/quotations/page.tsx` (lines 1–7): redirects to `/procurement?tab=quotations`.
`apps/web/src/app/quotes/page.tsx` (lines 1–7): redirects to `/procurement?tab=quotations`.
`apps/web/src/app/quotations/[id]/page.tsx` (lines 3–10): redirects to `/procurement?tab=quotations&open=${id}`.

**Desktop quotations tab** — `apps/web/src/components/procurement/procurement-view.tsx` lines 997–1066:

- Explicitly described as **read-only overview**.
- Links quotation rows to `/m/quotations?open=${r.id}` — **routes to mobile**.
- States that quotation requests are "created and managed on mobile" and approval is by the submitter's direct reporting manager.
- Columns: request number, project, work activity, required date, submitter, quotes count, cheapest landed total, status, approval marker, converted PO.

**Mobile quotation detail** — `apps/web/src/app/m/quotations/[id]/MobileQuotationDetail.tsx`:

- Full comparative matrix with per-material landed-cost breakdown (lines 198–233).
- Quote upload with supplier selection, inline supplier creation, file metadata, landed-cost components (lines 100–135).
- Winner selection and approval with reason requirement for non-cheapest (lines 235–275).

### What works

- **Quotation request API** (`apps/web/src/app/api/quotations/route.ts`): GET with scope/status filters (lines 20–88); POST creates with lines, min-quote count, dates, project, destination, submitter (lines 91–143); PUT seeds HSN/GST rates (lines 145–152).
- **Comparative matrix API** (`apps/web/src/app/api/quotations/[id]/route.ts`): loads full comparative matrix with company-group ownership check (lines 15–38); computes canApprove/canAddQuote (lines 40–54); loads company suppliers with GSTIN (lines 56–62).
- **Quote upload API** (`apps/web/src/app/api/quotations/[id]/quotes/route.ts`): adds vendor quote with inline supplier creation including optional GSTIN (lines 40–70); sends per-line landed-cost components (lines 76–103).
- **Standalone quote API** (`apps/web/src/app/api/quotes/route.ts`): GET returns comparative statement (lines 13–93); POST uploads quote with file URL, requisition company validation (lines 96–174).

### What is broken / missing

- **Desktop quotation management is read-only.** The procurement manager — the persona for whom comparative analysis is the #1 priority — cannot add quotes, select winners, or approve quotation requests from the desktop quotations tab. They are directed to mobile (`/m/quotations`). This is a significant workflow gap for a desktop-first role.
- A fully functional `ComparativeQuotePanel` (`apps/web/src/components/requisitions/comparative-quote-panel.tsx`) exists and is used inside the convert dialog, but it is **not surfaced on the desktop quotations tab**.

### What is confusing

- **Two separate winner-selection paths exist:**
  1. `/api/quotes/[id]/select` — standalone selection, requires `PERM.PO_APPROVE`, allows overriding cheapest with a reason (`apps/web/src/app/api/quotes/[id]/select/route.ts` lines 13–18, 57–61).
  2. `/api/quotations/[id]/approve` — approval + selection + automatic PO creation (`apps/web/src/app/api/quotations/[id]/approve/route.ts` lines 15–20, 57–67).
     It is unclear when a procurement manager should use "select winner" versus "approve quotation request." The approve path auto-creates a PO; the select path does not. This dual-path creates ambiguity about the intended workflow.

---

## Step 4 — Comparative Analysis (Owner's #1 Priority)

### What you see

`apps/web/src/components/requisitions/comparative-quote-panel.tsx`:

- **Excel-style comparative sheet** (lines 295–484): materials × suppliers grid with cost-component sub-rows.
- **Supplier header row** (lines 303–355): supplier name, delivery-terms badge, winner/lowest indicators.
- **Per-material sections** (lines 372–385): unit price, GST, discount, packing, freight, loading, insurance, handling, buyer-transport, landed cost — cheapest highlighted green, highest red.
- **Grand totals** (lines 387–484): subtotal (ex-GST), GST total, freight + transport, other charges, **landed total** (headline number).
- **Gate status badge** (lines 257–272): shows `N/minRequired` with "Need X more" when unsatisfied.
- **Mixed delivery warning** (lines 284–293): flags when quotes have different delivery bases (ex-works vs delivered).
- **KPI summary** (lines 207–214): lowest, highest, savings (max − min).
- **Actions**: Add Quote (line 274), Print (line 278), Select Winner (lines 96–116), Waive (lines 130–150), Delete Quote (lines 118–128).

### What works

- **Quote comparison service** (`packages/services/src/quote-comparison.ts`):
  - `cheapestQuoteId()` (lines 31–47): excludes rejected quotes, picks lowest landed total.
  - `quoteVariances()` (lines 49–65): calculates variance from cheapest.
  - `isQuoteGateSatisfied()` (lines 68–80): checks minimum quote count or waiver.
  - `winningLineCosts()` (lines 82–94): maps quote line unit prices by material.
  - `selectWinningQuote()` (lines 448–515): rejects other quotes, marks selected, records reason, locks requisition quotes, logs audit.
  - `waiveQuoteRequirement()` (lines 517–554): requires non-empty reason, records waiver metadata.
  - `getComparativeStatement()` (lines 558–611): loads requisition/quotes, computes cheapest, variance, gate, selected.
  - `getWinningQuoteLineCosts()` (lines 619+): retrieves selected quote line costs.
  - Purchaser-performance reporting (lines 744–840): attributes spend and savings.
- **Comparative statement API** (`apps/web/src/app/api/quotes/route.ts` lines 13–93): returns full comparative data — totals, cheapest/selected IDs, gate state, delivery terms, GST, freight, discounts, line costs, landed costs, variance.
- **Winner auto-fill on conversion** (`packages/services/src/requisition.ts` lines 494–520): when a winning quote exists, PO lines auto-fill unit cost + all landed-cost components from the quote, overriding manual `lineCosts`. Header charges (freight, loading, packing, insurance, handling, buyer transport) carry over as itemized PO charges (lines 525–544).

### What is broken / missing

- The comparative panel is **only accessible inside the Convert-to-PO dialog** on desktop, not as a standalone workspace. A procurement manager who wants to review quotes without converting must either use mobile or open the convert dialog and cancel.
- The desktop quotations tab does not embed `ComparativeQuotePanel` at all — it only shows a read-only summary table.

### What is confusing

- The convert dialog's manual line-cost inputs (lines 1020–1038 in `requisitions-view.tsx`) coexist with the comparative panel. When a winner is selected, the service silently overrides manual costs (`requisition.ts` lines 494–520). The UI does not communicate this override — the user may waste time entering costs that will be discarded.
- The `onWinnerSelected` callback in `ComparativeQuotePanel` (line 59, 110) is intended to refresh parent state, but the convert dialog does not appear to use it to auto-fill the visible line-cost inputs from the winner.

---

## Step 5 — Quote Winner Selection

### What works

- **Select winner via ComparativeQuotePanel** (`comparative-quote-panel.tsx` lines 96–116): POST to `/api/quotes/${quoteId}/select` with empty body (cheapest auto-selected). Toast confirms: "Line costs will auto-fill from this quote on conversion."
- **Select winner via mobile** (`MobileQuotationDetail.tsx` lines 235–275): POST to `/api/quotations/${id}/approve` with `selectedQuoteId` and optional `reason`. Non-cheapest selection requires a reason (lines 243–246).
- **Select API** (`apps/web/src/app/api/quotes/[id]/select/route.ts`): requires `PERM.PO_APPROVE` (line 13), verifies company ownership (lines 24–44), calls `selectWinningQuote` (lines 57–61), sends WhatsApp notification to requester (lines 63–86), revalidates paths (lines 88–90).
- **Approve API** (`apps/web/src/app/api/quotations/[id]/approve/route.ts`): validates body, resolves membership, calls `approveQuotation` (lines 22–55), returns approved status + generated PO (lines 57–67), converts hierarchy errors to HTTP responses (lines 69–72).

### What is broken / missing

- **Override reason not sent from ComparativeQuotePanel.** The panel's `selectWinner` function (line 102) sends an empty body `{}`. The select API (`quotes/[id]/select/route.ts` lines 13–18) allows overriding cheapest with a reason, but the desktop panel never sends one — it can only auto-select the cheapest. To select a non-cheapest winner with a reason, the user must use the mobile approve flow. There is no desktop UI for override-with-reason selection.

### What is confusing

- The ComparativeQuotePanel shows a "Select Winner" button on every quote (not just the cheapest), but clicking a non-cheapest quote sends an empty body, which the API may reject or silently auto-select cheapest instead. The user intent ("I want this more expensive supplier") is not captured.

---

## Step 6 — Purchase Order Creation

### What you see

`apps/web/src/components/requisitions/convert-to-po-dialog.tsx`:

- **Form fields** (lines 41–58): supplier, scope (COMPANY/PROJECT), destination location, expected date, notes, line costs, quote upload, waiver state.
- **Scope auto-set** (lines 86–89): from LCI (Logistics Cost Index) recommendation.
- **Line-cost auto-fill** (lines 90–96): from last purchase rate, not from winning quote.
- **Line items grid** (lines 301–335): material, quantity, unit cost (editable), line total.
- **Quote upload** (lines 368–384): embeds `QuoteUploadDialog`.

### What works

- **Convert API** (`apps/web/src/app/api/requisitions/[id]/route.ts` lines 173–191): validates input, calls `convertRequisitionToPo`, returns `poId` + `poNumber`.
- **Convert service** (`packages/services/src/requisition.ts` lines 426–545+):
  - Resolves procurement scope via LCI decision engine (lines 430–446).
  - Enforces quote gate (lines 448–470).
  - Auto-fills PO lines from winning quote (lines 494–520).
  - Carries winning quote header charges as PO charges (lines 525–544).
  - Creates PO inside same serializable transaction as requisition status update (line 478, 522–523).
- **Standalone PO creation** (`apps/web/src/app/api/purchase-orders/route.ts` lines 88–122): explicitly rejects `requisitionId` — enforces conversion through requisition PATCH to maintain quote gate.

### What is broken / missing

- The convert dialog's line-cost auto-fill uses **last purchase rate** (lines 90–96), not the winning quote's line costs. When a winner is selected, the service overrides these anyway, but the UI shows last-rate values that may differ from the winner — misleading the user about what costs will actually appear on the PO.

### What is confusing

- The dialog mixes "collect quotes," "select winner," "waive quotes," and "enter line costs" into a single form. The procurement manager must understand that selecting a winner makes the manual cost fields irrelevant, but nothing in the UI says this.

---

## Step 7 — PO Approval / Order Lifecycle

### What you see

`apps/web/src/app/procurement/[id]/page.tsx` (lines 52–188): loads PO with supplier GSTIN, project, destination, approval metadata, lines, charges, GRNs; renders `PurchaseOrderDetailView`.

**Mobile PO detail** — `apps/web/src/app/m/procurement/[id]/page.tsx`:

- Full PO detail with lines, totals, receipts, payments (lines 49–76).
- Pipeline stepper: Indent → Quote → PO → GRN → Issue (lines 199–212).
- Tracking timeline with status-aware steps (lines 217–296).
- Inline approve/order/cancel actions via `MobilePoActions` (line 26).
- Receive dialog via `MobileReceiveDialog` (line 30).

### What works

- **PO detail API** (`apps/web/src/app/api/purchase-orders/[id]/route.ts`): GET loads across company group (lines 15–40); PATCH supports approve, reject, order, cancel, addLine (lines 135–168).
- **Self-approval prevention** (lines 139–147): creator cannot approve own PO.
- **Self-rejection prevention** (lines 150–158): creator cannot reject own PO.
- **PO service** (`packages/services/src/procurement.ts`): `approvePurchaseOrder` (~line 287), `orderPurchaseOrder` (~line 351) — serializable transactions.

### What is broken / missing

- No issues identified in the PO lifecycle itself.

### What is confusing

- The PO detail page is at `/procurement/[id]` (desktop) and `/m/procurement/[id]` (mobile). The `/purchase-orders` page redirects to `/procurement?tab=purchase-orders`. The relationship between these routes is not obvious.

---

## Step 8 — Goods Receipt / GRN

### What you see

`apps/web/src/app/goods-receipts/page.tsx` (lines 1–7): redirects to `/procurement?tab=purchase-orders`.

**Desktop receive dialog** — `apps/web/src/components/procurement/receive-goods-dialog.tsx`:

- Editable receipt lines: ordered, remaining, quantity, cost, weight, lot, batch, tracking (lines 14–30).
- Grid columns: material, ordered qty, remaining qty, weight, qty to receive, unit cost, line total (lines 32–94).
- Delivery details state (lines 96–120).

### What works

- **Receive API** (`apps/web/src/app/api/purchase-orders/[id]/receive/route.ts`):
  - Normal receipt validation (lines 77–142): logistics, inspection, lot, batch, expiry, weighbridge, gate-pass, unloading, proof fields.
  - Rejected delivery handling (lines 24–75): photos, vehicle details, gate pass, location, vehicle trip logging.
  - Vehicle trip recording + path revalidation (lines 144–163).
- **Receive service** (`packages/services/src/procurement.ts` lines 641–760+):
  - Serializable transaction via `withStockTransaction` (line 642).
  - PO status validation — only ORDERED or PARTIAL (lines 648–650).
  - Duplicate prevention — 10-second window (lines 652–667).
  - Location match enforcement (lines 668–670).
  - Procurement scope enforcement — COMPANY → warehouse, PROJECT → site (lines 672–684).
  - Geo-fence validation with haversine distance (lines 686–695).
  - Over-delivery prevention (lines 708–714).
  - Stock movement via `recordMovement()` — PURCHASE_RECEIPT type (lines 719–736).
  - Lot metadata propagation — batch, expiry, mfg date, supplier (lines 728–735).
  - PO line qtyReceived update (lines 738–742).
  - Standard cost + current cost auto-update (lines 744–753).
  - GRN header + lines creation (lines 756–760+).

### What is broken / missing

- No issues identified in the GRN service. The receipt flow is transactionally sound and India-specific logistics fields (e-way bill, challan, LR, weighbridge, gate-pass) are captured at the API level.

### What is confusing

- Logistics and gate details are collapsed/optional in the desktop dialog. India-specific receiving requirements (e-way bill number, transporter LR, weighbridge weight) may be hidden unless the user expands the section. A procurement manager may not realize these fields exist.

---

## Step 9 — Supplier List and Supplier Detail

### What you see

`apps/web/src/app/suppliers/page.tsx` (lines 1–107):

- Permission gate: `PERM.PROCUREMENT_VIEW` (line 27).
- Stats: Total vendors, With Dues, Total Owed (lines 98–102).
- Supplier list with GSTIN, phone, balance, lead time, PO count, open POs, total spent, recent POs (lines 63–88).

`apps/web/src/components/vendors/vendors-view.tsx` (lines 43–80):

- Tabs: `directory` and `ratings` (line 52).
- Create/edit dialog with name, GSTIN, phone, email, address, lead time (lines 59–76).
- CSV import support (line 57).

`apps/web/src/app/suppliers/[id]/page.tsx` (lines 34–202):

- Supplier cockpit: GSTIN, balance owed, lead time, PO stats, rates, returns, GRNs, invoices, payments, top materials (lines 118–195).
- Loads active rate contracts, returns, recent GRNs, invoices, payments (lines 39–93).

### What works

- **Supplier API** (`apps/web/src/app/api/suppliers/route.ts`): GET with search (lines 9–43); POST with audit log (lines 45–67); PUT bulk CSV import (lines 73–80+).
- **Supplier detail API** (`apps/web/src/app/api/suppliers/[id]/route.ts`): loads active supplier with soft-delete/company scope.
- **Last GRN API** (`apps/web/src/app/api/suppliers/[id]/last-grn/route.ts`): fetches most recent GRN for lead-time calculation.
- Supplier master uses soft delete (`deletedAt: null` filter at line 39 in page, line 17 in API).

### What is broken / missing

- **GSTIN format validation is unwired.** A `gstin()` regex validator exists in `apps/web/src/lib/validate.ts` (lines 32–35) matching the 15-character CBIC format (`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`), with unit tests (`validate.test.ts` lines 170–184). However:
  - The server-side `supplierSchema` (`apps/web/src/lib/server.ts` line 325) only validates `z.string().max(20).optional().nullable()` — **no format check**.
  - No client component imports the `gstin` validator (grep confirmed zero matches in `apps/web/src/components`).
  - **Invalid GSTINs can be saved without error.**
- **No external GST verification.** There is no API call to the GST portal or any third-party service to verify that a GSTIN is active, registered, or matches the supplier name. The field is free-text.
- **No supplier registration-status field.** The `Supplier` model (`packages/db/prisma/schema.prisma` lines 1422–1452) has `gstin`, `phone`, `email`, `address`, `balanceOwed`, `leadTimeDays` — but no `isRegistered`, `registrationStatus`, or `compositionScheme` field. This is needed for ITC eligibility under the 80:20 rule.

### What is confusing

- The page title says "Vendors" (line 96 in page, line 52 in view), but the URL is `/suppliers` and the schema model is `Supplier`. The terminology is inconsistent.
- The `/vendor-ratings` page (`apps/web/src/app/vendor-ratings/page.tsx` lines 1–5) redirects to `/suppliers`, where ratings are a tab. Users navigating to `/vendor-ratings` may not realize they've been redirected.

---

## Step 10 — Vendor Ratings

### What you see

`apps/web/src/app/vendor-ratings/page.tsx` (lines 1–5): redirects to `/suppliers` (ratings tab).

`apps/web/src/components/vendor-ratings/vendor-ratings-view.tsx`: rendered inside the `/suppliers` page ratings tab.

### What works

- **Vendor ratings API** (`apps/web/src/app/api/vendor-ratings/route.ts` lines 6–16): requires `PERM.PROCUREMENT_VIEW`, calls `getVendorRankings(company.id)`, returns on-time rate, quality rate, price competitiveness, overall score.
- **Vendor ratings detail API** (`apps/web/src/app/api/vendor-ratings/[id]/route.ts`): individual rating detail.

### What is broken / missing

- No issues identified. Ratings are auto-computed from PO/GRN/return history.

### What is confusing

- Ratings are buried as a tab inside the suppliers page. A procurement manager reviewing supplier performance must navigate to `/suppliers` and switch tabs, rather than having a dedicated ratings dashboard.

---

## Step 11 — Rate Contracts

### What you see

`apps/web/src/app/rate-contracts/page.tsx` (lines 1–44):

- Permission gate: `PERM.PROCUREMENT_VIEW` (line 25).
- Can-create flag: `PERM.PROCUREMENT_MANAGE` (line 29).
- Loads material categories (lines 31–36).
- Renders `RateContractsView` (line 41).

### What works

- **Rate contract API** (`apps/web/src/app/api/rate-contracts/route.ts`):
  - GET lists rate contracts with Decimal-to-number conversion (lines 44–55).
  - POST validates supplier, material, agreed rate, validity period, quantity limits (lines 7–16); creates with `PERM.PROCUREMENT_MANAGE` (lines 18–42).
- **Rate contract detail API** (`apps/web/src/app/api/rate-contracts/[id]/route.ts`): individual contract management.
- Supplier cockpit shows active rate contracts (`suppliers/[id]/page.tsx` lines 39–93).

### What is broken / missing

- The page header has **empty stats** (`stats={[]}` at line 40). No summary metrics (e.g., active contracts, expiring soon, total contracted value) are displayed.
- No expiry alerts for rate contracts approaching their validity end date.

### What is confusing

- Rate contracts are accessible from `/rate-contracts` and from the supplier cockpit, but not from the procurement dashboard tabs. A procurement manager may not discover them unless they know the URL.

---

## Step 12 — Inventory Levels

### What you see

`apps/web/src/app/inventory/page.tsx` (lines 1–329):

- Permission gate: `PERM.INVENTORY_VIEW` (line 42).
- **Stats band** (lines 134–158): Stock value, Low stock, Pending indents, Locations.
- **Attention banners** (lines 160–244): out-of-stock (red), low-stock (amber), pending approvals (amber), all-caught-up (green).
- **Quick links** (lines 246–287): Materials catalogue, Stock hub, Locations.
- **Pending indents list** (lines 289–326): recent SUBMITTED requisitions with project name.

### What works

- Stock health derivation (lines 94–116): total qty, stock value (qty × MAC), reorder point comparison, low/out flags.
- Low-stock and out-of-stock banners link to `/materials?material=${id}` for drill-down (lines 163–202).
- Pending approval count combines draft POs + pending requisitions (line 121).

### What is broken / missing

- **Low-stock alerts are on `/inventory`, not `/procurement`.** The persona's journey starts at the procurement dashboard, which does not surface low-stock alerts. The procurement manager must navigate to `/inventory` separately to see them.

### What is confusing

- The inventory page and procurement dashboard both show "pending indents" but with different presentations. The inventory page shows 6 recent indents (line 60); the procurement dashboard shows a count in the stats band. Users may not know which is authoritative.

---

## Step 13 — Stock Movements

### What you see

`apps/web/src/app/stock-movements/page.tsx` (lines 1–7): redirects to `/stock?tab=movements`.

`apps/web/src/app/stock/page.tsx` (lines 1–120+):

- Permission gate: `PERM.INVENTORY_VIEW` (line 52).
- Loads stock items, company locations, group locations, movements, transfers, issues, materials, scraps, counts (lines 65–83).
- Movement type labels (lines 24–35): Receipt, Transfer In/Out, Issue to Project/Dept, Adjustment ±, Return, Sale, Scrap Generated.
- Renders `StockHubView` with tabs for on-hand, movements, transfers, issues, counts.

### What works

- **Stock movements API** (`apps/web/src/app/api/stock-movements/route.ts`): lists movements with filters.
- **Stock ledger service** (`packages/services/src/stock-ledger.ts`): immutable `recordMovement()` and `recordTransfer()` — appends `StockMovement` and atomically updates `StockLocationItem` (qty + MAC) inside serializable transactions.
- **Stock service** (`packages/services/src/stock.ts`): stock queries, cross-company inventory.
- **Cross-company inventory API** (`apps/web/src/app/api/inventory/cross-company/route.ts`): company-group scoping for parent/child SPVs.
- Movement types cover the full lifecycle: PURCHASE_RECEIPT, TRANSFER_IN/OUT, ISSUE_TO_PROJECT/DEPARTMENT, ADJUSTMENT_IN/OUT, RETURN, SALE, SCRAP_GENERATED.

### What is broken / missing

- No issues identified in the stock movement logic. The ledger is immutable and transactionally consistent.

### What is confusing

- The `/stock-movements` URL redirects to `/stock?tab=movements`. Users who bookmark `/stock-movements` will see the stock hub, not a dedicated movements page.

---

## Step 14 — Supplier Returns

### What you see

`apps/web/src/app/supplier-returns/page.tsx` (lines 1–7): redirects to `/procurement?tab=returns`.

`apps/web/src/components/supplier-returns/supplier-returns-view.tsx` (lines 1–80+):

- Returns table: return number, date, supplier, location, line count, status, credit note (lines 37–45).
- Create dialog with supplier, location, lines, vehicle, driver, line reasons (lines 78–80+).
- Status pills: DRAFT → SUBMITTED → COMPLETED/CANCELLED.

### What works

- **Supplier returns API** (`apps/web/src/app/api/supplier-returns/route.ts`): GET lists, POST creates.
- **Supplier return detail API** (`apps/web/src/app/api/supplier-returns/[id]/route.ts`):
  - GET loads with supplier, location, lines, materials (lines 9–26).
  - PATCH handles submit, complete (with credit note), cancel (lines 28–69).
  - DELETE only for DRAFT (lines 71–94).
- **Supplier return service** (`packages/services/src/supplier-return.ts`):
  - Status workflow: DRAFT → SUBMITTED → COMPLETED/CANCELLED (lines 11–17).
  - Positive quantity validation (lines 23–30).
  - Return total = qty × unit cost (lines 32–44).
  - Status transition validation (lines 51–63).
  - Supplier + location validation with soft-delete/company scope (lines 93–103).
  - Available stock check + `RETURN` movement recording (lines 212–239).
  - Current cost refresh + GL return entries using material GST rates (lines 242–260).
  - Supplier balance decrement + credit note number capture (lines 263–280).
  - Cancel for non-completed returns (lines 294–310).

### What is broken / missing

- **No credit-note validation against supplier GSTIN.** The return service stores a `creditNoteNo` (line 263–280) and posts GL entries for GST reversal (lines 242–260), but there is no validation that the credit note number format is correct or that it links to a specific supplier invoice. A procurement manager can enter any arbitrary string as a credit note number.
- **No supplier invoice linkage on returns.** Returns reference a PO (`supplierReturn.ts` line 72) but not a specific supplier invoice. For GST reconciliation, the credit note should be linked to the invoice it adjusts.

### What is confusing

- Returns are accessible from `/procurement?tab=returns` and from `/supplier-returns` (redirect). The mobile revalidation targets `/m/suppliers` (line 46 in API), suggesting returns are also managed from the mobile suppliers page — but this is not obvious from the desktop.

---

## Step 15 — Mobile vs Desktop Parity

### Mobile-only capabilities

- **Quotation request creation** — desktop quotations tab is read-only; creation is mobile-only.
- **Quote upload with file capture** — mobile quotation detail supports camera/file upload; desktop has `QuoteUploadDialog` but only inside the convert dialog.
- **Quotation approval with winner selection + PO auto-creation** — via `/api/quotations/[id]/approve`; desktop has no equivalent approve button on the quotations tab.
- **Non-cheapest winner override with reason** — mobile approve dialog requires reason for non-cheapest (`MobileQuotationDetail.tsx` lines 243–246); desktop `ComparativeQuotePanel` sends empty body (line 102).

### Desktop-only capabilities

- **ComparativeQuotePanel** — full Excel-style comparative sheet with cost-component breakdown; mobile has a compact matrix but less granular.
- **CSV import for suppliers** — `GenericCsvImportDialog` in vendors-view.
- **Rate contracts management** — no mobile equivalent identified.
- **Direct purchases / cash purchases tab** — desktop procurement hub has a "Cash Purchases" tab; mobile equivalent not confirmed.

### Permission parity

- Both desktop and mobile check `PERM.PROCUREMENT_VIEW`, `PERM.PROCUREMENT_MANAGE`, `PERM.PO_APPROVE`, `PERM.REQUISITION_APPROVE` consistently.
- Mobile PO detail prevents self-approval (`m/procurement/[id]/page.tsx` line 94) — consistent with desktop API.

---

## India-Specific Gaps

### GSTIN Verification

- **Format validation exists but is unwired.** `apps/web/src/lib/validate.ts` lines 32–35 define a regex matching the 15-character GSTIN format. Unit tests confirm it works (`validate.test.ts` lines 170–184). However, `supplierSchema` (`server.ts` line 325) does not use it, and no client component imports it. **Invalid GSTINs are accepted silently.**
- **No external verification.** There is no integration with the GST portal API or any third-party service to verify GSTIN status (active/cancelled/suspended), legal name, or business address. The `Supplier` model (`schema.prisma` lines 1422–1452) stores `gstin` as free-text with no verification status, no verification date, and no verified-name snapshot.

### HSN/SAC Codes

- **Well-implemented.** HSN codes are captured on:
  - `Material.hsnCode` (`schema.prisma` line 1303) + `Material.gstRate` (line 1304).
  - `VendorQuoteLine.hsnCode` (line 3241) + `gstRate` (line 3242) + `gstAmount` (line 3243) — snapshot at quote time.
  - `PurchaseOrderLine.hsnCode` (line 3394) + `gstRate` (line 3395) — snapshot at PO creation.
  - `SupplierInvoice.hsnCode` (line 1875).
- **HSN/GST master** (`packages/services/src/hsn-gst.ts`): curated construction-industry HSN codes with GST rates (lines 55–60+), auto-pick GST rate from HSN code, search with description scoring (lines 29–47). Seeded via `POST /api/quotations` PUT (lines 145–152 in quotations route).
- **HSN/SAC service** (`packages/services/src/hsn-sac.ts`): additional HSN/SAC lookup support.
- **Gap:** HSN codes are optional (`String?`) on materials. There is no validation that a material with a GST rate has a corresponding HSN code, and no warning when HSN is missing on invoice-ready items.

### 80:20 Procurement Rule

- **Not implemented.** The 80:20 rule (≥80% of procurement value from registered/GST-compliant suppliers for ITC eligibility) is mentioned in `docs/SRG_REALCON_TEAM_WORKFLOWS.md` (lines 118, 565, 656) but has **no code implementation**:
  - No `isRegistered` field on `Supplier` model.
  - No dashboard or report showing procurement spend split by registered vs unregistered suppliers.
  - No alert when registered-supplier spend falls below 80%.
  - No ITC eligibility tracking on POs or GRNs.

### Reverse Charge

- **Not implemented.** No `reverseCharge` field exists anywhere in the Prisma schema (grep confirmed zero matches). There is no UI, no service, and no GL posting logic for reverse-charge transactions. RCM (Reverse Charge Mechanism) purchases — common in construction for services like transport, legal, and unregistered supplier purchases — cannot be flagged or processed correctly.

### E-Way Bill / Invoice Capture

- **Partially implemented.** Goods receipt API captures e-way bill, challan, invoice, LR, and transporter details (`apps/web/src/app/api/purchase-orders/[id]/receive/route.ts` lines 77–142). However:
  - No e-way bill number validation (format or expiry).
  - No e-way bill generation integration.
  - Supplier invoices (`SupplierInvoice` model, `schema.prisma` line 1875) capture HSN code but there is no e-way bill field on the invoice model itself — it lives only on the GRN.

### Credit Notes / GST Reversal

- **Partially implemented.** Supplier returns post GL entries for GST reversal using material GST rates (`supplier-return.ts` lines 242–260) and capture a credit note number (lines 263–280). However:
  - No credit note number format validation.
  - No linkage between the credit note and the original supplier invoice.
  - No reversal calculation verification (i.e., confirming the GST reversal amount matches the original input credit claimed).

---

## Consolidated Findings

### Broken (confirmed bugs)

| #   | Finding                                                                                                                                                                 | Location                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| B1  | **Waiver field mismatch in ConvertToPoDialog** — sends `waiveReason` but API reads `reason`; waiver from convert dialog always fails with "A waiver reason is required" | `convert-to-po-dialog.tsx:68` vs `api/requisitions/[id]/route.ts:166-167` |
| B2  | **GSTIN format validation unwired** — `gstin()` validator exists with tests but is not used in `supplierSchema` or any client form; invalid GSTINs saved silently       | `validate.ts:32-35` vs `server.ts:325`                                    |

### Missing (functionality gaps)

| #   | Finding                                                                              | Location                                                        |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| M1  | No low-stock alerts on procurement dashboard                                         | `procurement/page.tsx:391-402` (stats omit stock health)        |
| M2  | Desktop quotations tab is read-only — no quote upload, winner selection, or approval | `procurement-view.tsx:997-1066`                                 |
| M3  | No desktop UI for non-cheapest winner override with reason                           | `comparative-quote-panel.tsx:102` sends empty body              |
| M4  | No external GST verification (GST portal API)                                        | `schema.prisma:1422-1452` (Supplier has no verification fields) |
| M5  | No supplier registration-status field (`isRegistered`)                               | `schema.prisma:1422-1452`                                       |
| M6  | No 80:20 procurement compliance tracking or reporting                                | Not in schema, services, or UI                                  |
| M7  | No reverse charge mechanism (RCM)                                                    | Not in schema, services, or UI                                  |
| M8  | No credit note number validation or invoice linkage on returns                       | `supplier-return.ts:263-280`                                    |
| M9  | Rate contracts page has empty stats and no expiry alerts                             | `rate-contracts/page.tsx:40`                                    |
| M10 | No e-way bill field on SupplierInvoice model (only on GRN)                           | `schema.prisma:1875`                                            |

### Confusing (UX issues)

| #   | Finding                                                                                             | Location                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Comparative analysis is buried inside the convert-to-PO dialog, not a standalone workspace          | `requisitions-view.tsx:995-1017`                                                                                                                                                 |
| C2  | Manual line-cost inputs shown in convert dialog even when winner auto-fills costs (silent override) | `requisitions-view.tsx:1020-1038` vs `requisition.ts:494-520`                                                                                                                    |
| C3  | Two separate winner-selection paths (select vs approve) with unclear distinction                    | `quotes/[id]/select/route.ts` vs `quotations/[id]/approve/route.ts`                                                                                                              |
| C4  | Seven redirect pages obscure the actual navigation structure                                        | `requisitions/page.tsx`, `quotations/page.tsx`, `quotes/page.tsx`, `goods-receipts/page.tsx`, `stock-movements/page.tsx`, `supplier-returns/page.tsx`, `vendor-ratings/page.tsx` |
| C5  | "Vendors" vs "Suppliers" terminology inconsistency                                                  | `suppliers/page.tsx:96` (title "Vendors") vs URL `/suppliers` vs model `Supplier`                                                                                                |
| C6  | Vendor ratings buried as a tab inside suppliers page                                                | `vendor-ratings/page.tsx:1-5` redirects to `/suppliers`                                                                                                                          |
| C7  | Rate contracts not linked from procurement dashboard tabs                                           | `procurement-view.tsx:82-85` (no rate-contracts tab)                                                                                                                             |
| C8  | India-specific receiving fields (e-way bill, LR, weighbridge) collapsed in desktop dialog           | `receive-goods-dialog.tsx:96-120`                                                                                                                                                |
| C9  | Convert dialog line-cost auto-fill uses last purchase rate, not winning quote — misleading          | `convert-to-po-dialog.tsx:90-96` vs `requisition.ts:494-520`                                                                                                                     |

### India-Specific Gaps Summary

| Requirement                  | Status                 | Evidence                                                                                         |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| GSTIN format validation      | **Exists but unwired** | `validate.ts:32-35` (unused in `server.ts:325`)                                                  |
| GSTIN external verification  | **Missing**            | No API integration, no verification fields on `Supplier`                                         |
| HSN/SAC codes                | **Implemented**        | `hsn-gst.ts:55+`, `schema.prisma:1303,3241,3394,1875`                                            |
| HSN mandatory enforcement    | **Missing**            | `hsnCode` is `String?` on all models                                                             |
| 80:20 procurement rule       | **Missing**            | Docs only (`SRG_REALCON_TEAM_WORKFLOWS.md:118,565,656`)                                          |
| Reverse charge (RCM)         | **Missing**            | No field in schema, no service, no UI                                                            |
| E-way bill capture           | **Partial**            | GRN-level only (`receive/route.ts:77-142`), not on invoice model                                 |
| Credit note / GST reversal   | **Partial**            | GL posting + credit note number (`supplier-return.ts:242-280`), no validation or invoice linkage |
| Supplier registration status | **Missing**            | No `isRegistered` field on `Supplier`                                                            |
| ITC eligibility tracking     | **Missing**            | No spend-split reporting by supplier registration                                                |
