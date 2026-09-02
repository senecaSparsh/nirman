# Procure Audit

## Bookmark

- **Source document:** `/Users/sparshagarwal/Downloads/nirman-inventory/USE_CASES_AND_WORKFLOWS.md`
- **Sections audited:**
  - §3.2.1 Material Indents (Requisitions) — lines 177–191
  - §3.2.2 Comparative Quotations — lines 193–209
  - §3.2.3 Purchase Orders — lines 210–224
  - §3.2.4 Goods Receipt (GRN) & Gate Entry — lines 225–238
  - §3.2.5 Supplier Returns — lines 239–247
  - Appendix A WF-2: Create and Approve a Material Requisition — lines 792–845
  - Appendix A WF-3: Auto-Generate Low-Stock Requisition — lines 848–879
  - Appendix A WF-4: Collect Quotations and Convert to Purchase Order — lines 883–937
  - Appendix A WF-5: Approve and Order a Purchase Order — lines 941–975
  - Appendix A WF-6: Receive Goods via Gate Entry and GRN — lines 978–1021
- **Codebase roots checked:**
  - `packages/db/prisma/schema.prisma`
  - `packages/services/src/requisition.ts`
  - `packages/services/src/procurement.ts`
  - `packages/services/src/procurement-advanced.ts`
  - `packages/services/src/quote-comparison.ts`
  - `packages/services/src/quotation.ts`
  - `packages/services/src/auto-requisition.ts`
  - `packages/services/src/supplier-return.ts`
  - `packages/services/src/stock-ledger.ts`
  - `packages/services/src/moving-average-cost.ts`
  - `packages/services/src/gl-posting.ts`
  - `packages/services/src/notifications.ts`
  - `apps/web/src/app/api/requisitions/...`
  - `apps/web/src/app/api/purchase-orders/...`
  - `apps/web/src/app/api/quotes/...`
  - `apps/web/src/app/api/goods-receipts/...`
  - `apps/web/src/app/api/supplier-returns/...`
  - `apps/web/src/app/api/gate-passes/...`
  - `apps/web/src/app/requisitions/page.tsx`
  - `apps/web/src/app/quotations/page.tsx`
  - `apps/web/src/app/procurement/page.tsx`
  - `apps/web/src/app/field/page.tsx`
  - `apps/web/src/app/gate-passes/page.tsx`
  - `apps/web/src/app/m/requisitions/page.tsx`
  - `apps/web/src/app/m/procurement/page.tsx`
  - `apps/web/src/app/m/gate-pass/page.tsx`
  - `apps/web/src/components/requisitions/...`

## Verdict per claim

| # | Claim from §3.2 / Appendix A | Verdict | Evidence |
|---|------------------------------|---------|----------|
| 1 | `MaterialRequisition` model has project/site, needed-by date, lines with material + qty. | **CONFIRMED** | `packages/db/prisma/schema.prisma:2608–2659`; `requisitionId: string`, `materialId: string`, `qtyRequested` at `packages/db/prisma/schema.prisma:2661–2681`; `neededByDate` at `schema.prisma:2617`. |
| 2 | Requisition captures current closing stock, last supplier, last rate/date. | **MINOR DISCREPANCY** | `packages/db/prisma/schema.prisma:2671–2673` stores `currentStock`, `lastRate`, `lastRateDate`. `preferredSupplierId` exists (`schema.prisma:2670`) but is user-selected, not the "last supplier". No `lastSupplierId` field. |
| 3 | Requisition status is `DRAFT → SUBMITTED → APPROVED`. | **MAJOR DISCREPANCY** | `packages/db/prisma/schema.prisma:2600–2605` defines `RequisitionStatus` as `DRAFT`, `SUBMITTED`, `APPROVED`, `CONVERTED`, `REJECTED`. `packages/services/src/requisition.ts:128,168,219,333,522` uses all five. The document omits `CONVERTED` and `REJECTED`. |
| 4 | Approval is a 3-tier "purchaser → store → MD" workflow. | **CRITICAL DISCREPANCY** | No such tiered routing in code. `apps/web/src/app/api/requisitions/[id]/route.ts:131–137` only requires `PERM.REQUISITION_APPROVE`. `packages/services/src/requisition.ts:203–224` sets status to `APPROVED` without role-tier enforcement. No "store" or "MD" roles in `apps/web/src/lib/roles.ts` (per `AGENTS.md`). |
| 5 | `requisition.approve` permission is required for approval. | **CONFIRMED** | `apps/web/src/app/api/requisitions/[id]/route.ts:132` uses `PERM.REQUISITION_APPROVE`; `AGENTS.md` lists `requisition.approve`. |
| 6 | `generateAutoRequisition()` raises a DRAFT indent when `totalStock ≤ material.reorderPoint`. | **CONFIRMED** | `packages/services/src/auto-requisition.ts:46–171`; `packages/db/prisma/schema.prisma:774` has `reorderPoint`. |
| 7 | Auto-requisition numbering is `RQ-YYMMDD-NNNN`. | **MAJOR DISCREPANCY** | `packages/services/src/auto-requisition.ts:126` uses `AREQ-${ymd}-`. Manual requisitions use `REQ-${ymd}-` (`packages/services/src/requisition.ts:26`). No `RQ-` prefix. |
| 8 | Auto-requisition de-duplicates against open requisitions and uses EOQ or `2 × reorderPoint − totalStock`. | **CONFIRMED** | `packages/services/src/auto-requisition.ts:70–106`; logs `AUTO_REQUISITION_GENERATE` at `auto-requisition.ts:148`. |
| 9 | `notifyLowStock()` sends alerts to OWNER/ADMIN/MANAGER. | **CONFIRMED** | `packages/services/src/notifications.ts:308`; `apps/web/src/app/api/requisitions/auto/route.ts:54–96` calls it for owners, admins, directors, PMs, procurement managers. |
| 10 | `unitLandedCost = unitPrice + (unitPrice × gstRate/100) + freightPerUnit + handlingPerUnit`. | **CRITICAL DISCREPANCY** | The documented formula is materially wrong. Real implementation: `packages/services/src/quotation.ts:74–99` and `packages/db/prisma/schema.prisma:2816–2817` compute `unitLandedCost = (unitPrice − discount + packing) × (1 + gstRate/100) + freight + loading + insurance + handling + buyerTransport`. The doc omits discount, packing, loading, insurance, buyerTransport, and uses the wrong GST base. |
| 11 | `VendorQuote` / `VendorQuoteLine` models exist and capture landed-cost components. | **CONFIRMED** | `packages/db/prisma/schema.prisma:2710–2827`; `unitLandedCost`, `freightPerUnit`, `handlingPerUnit`, `loadingPerUnit`, `insurancePerUnit`, `discountPerUnit`, `packingPerUnit`, `buyerTransportPerUnit` all present. |
| 12 | Default `minQuotesRequired = 3` and is configurable per requisition; `isQuoteGateSatisfied()` blocks PO conversion unless met or waived. | **CONFIRMED** | `packages/db/prisma/schema.prisma:2634`; `packages/services/src/quote-comparison.ts:73–80`; `packages/services/src/requisition.ts:423–428` enforces the gate. `apps/web/src/app/api/requisitions/[id]/route.ts:145–153` implements waiver with `action: "waiveQuotes"`. |
| 13 | `PurchaseOrder` status lifecycle is `DRAFT → APPROVED → ORDERED → PARTIAL → RECEIVED → CANCELLED`. | **CONFIRMED** | `packages/db/prisma/schema.prisma:1337–1344`; `packages/services/src/procurement.ts:340–403` implements state transitions. |
| 14 | Value-based PO approval thresholds default to <₹50K manager, <₹5L admin, ≥₹5L owner. | **MAJOR DISCREPANCY** | `packages/services/src/procurement-advanced.ts:320–359` returns `PROJECT_MANAGER`, `ADMIN`, `OWNER` and defaults `50000`/`500000`. But `packages/services/src/procurement.ts:29–37` `ROLE_RANK` only has `MANAGER: 1`, `ADMIN: 2`, `OWNER: 3`; `PROJECT_MANAGER`/`PROCUREMENT_MANAGER` are not ranked, so they fall to `0` and can never satisfy `MANAGER` requirement. |
| 15 | `procurementScope` is mandatory and enforced as `COMPANY`/`PROJECT`. | **CONFIRMED** | `packages/db/prisma/schema.prisma:1350`; `packages/services/src/procurement.ts:104–125` and `packages/services/src/procurement.ts:587–592` enforce `COMPANY_WAREHOUSE` vs `PROJECT_SITE`. |
| 16 | `projectCommitments` is computed from open requisitions and open POs. | **CONFIRMED** | `packages/services/src/procurement-advanced.ts:382–` (`getProjectCommitments`). |
| 17 | Fiscal-year numbering for PO/GRN. | **AMBIGUOUS / NOT VERIFIED** | No fiscal-year counter logic found in `packages/services/src/procurement.ts` or `packages/services/src/requisition.ts`. Document labels it "(in progress)". |
| 18 | `GoodsReceipt` + `GoodsReceiptLine` create `MaterialLot`s. | **CRITICAL DISCREPANCY** | `packages/db/prisma/schema.prisma:832` has `MaterialLot` model, but `packages/services/src/procurement.ts:550–717` never passes `lotNumber`/`companyId` to `recordMovement`. `packages/services/src/stock-ledger.ts:152–167` only auto-creates a `MaterialLot` when `input.lotNumber && input.companyId` are supplied. Therefore `MaterialLot` rows are **not** created on GRN, even though `GoodsReceiptLine.lotNumber` is stored. |
| 19 | GRN records quality `inspectionStatus` and uses `recordMovement()` IN, `computeMovingAverageCost()`, and `postPurchaseReceipt()` GL. | **CONFIRMED** | `packages/services/src/procurement.ts:627–636` calls `recordMovement` with `PURCHASE_RECEIPT`; `packages/services/src/stock-ledger.ts:216` calls `computeMovingAverageCost`; `packages/services/src/procurement.ts:752–758` calls `postPurchaseReceipt`; `packages/services/src/gl-posting.ts:281` exists. |
| 20 | `/field` is the PWA page for GRN and uses `BarcodeDetector` and offline queue. | **PARTIALLY CONFIRMED / MINOR DISCREPANCY** | `apps/web/src/app/field/page.tsx` exists and uses `FieldReceive`. `apps/web/src/components/mobile/barcode-scanner.tsx` uses `BarcodeDetector`. Offline queue is asserted in the `FieldReceive` area, but not independently verified here. |
| 21 | GRN uses three-way match foundation for supplier invoices. | **CONFIRMED** | `packages/db/prisma/schema.prisma:1457–1480` `SupplierInvoice` model with `matchStatus` and `matchNotes`; `packages/services/src/supplier-invoice.ts` exists. |
| 22 | `SupplierReturn` lines reference the GRN/lot and qty. | **CRITICAL DISCREPANCY** | `packages/db/prisma/schema.prisma:3005–3018` `SupplierReturnLine` only has `materialId`, `qty`, `unitCost`, `reason`. No `goodsReceiptId`, `goodsReceiptLineId`, or `lotId` fields. `packages/services/src/supplier-return.ts:39–45` input is the same. |
| 23 | `SupplierReturn` status `DRAFT → SUBMITTED → COMPLETED / CANCELLED`. | **CONFIRMED** | `packages/db/prisma/schema.prisma:2965–2970`; `packages/services/src/supplier-return.ts:85,115,219,240`. |
| 24 | `postSupplierReturn()` posts GL. | **CONFIRMED** | `packages/services/src/supplier-return.ts:205–214`; `packages/services/src/gl-posting.ts:936`. |
| 25 | `GatePass` / `GateEntry` records inbound vehicle/supplier/challan before the truck reaches the store. | **CRITICAL DISCREPANCY** | No `GateEntry` model. `packages/db/prisma/schema.prisma:5281–5346` `GatePass` is **outbound** (categories `MATERIAL_ISSUE`, `STOCK_TRANSFER`, `MATERIAL_SALE`, `SUPPLIER_RETURN`, `MANUAL`). It has no `INBOUND` category. Inbound gate data is captured in `GoodsReceipt` (vehicle, driver, challan, etc.), not a pre-receipt `GatePass`. No `/m/gate-entry` page exists; mobile is `/m/gate-pass`. |
| 26 | Desktop `/requisitions`, `/quotations`, `/procurement` pages exist. | **CONFIRMED** | `apps/web/src/app/requisitions/page.tsx`, `apps/web/src/app/quotations/page.tsx`, `apps/web/src/app/procurement/page.tsx` found. |
| 27 | UI components `RequisitionForm` and `MobileRequisitionForm`. | **MAJOR DISCREPANCY** | No `MobileRequisitionForm` in `apps/web/src`. The desktop page uses `RequisitionFormDialog` (`apps/web/src/components/requisitions/requisition-form-dialog.tsx:35`). |
| 28 | `ComparativeQuotePanel`, `QuoteUploadDialog`, `PoCard`, `MobilePipelineStepper` exist. | **CONFIRMED** | `apps/web/src/components/requisitions/comparative-quote-panel.tsx`, `apps/web/src/components/requisitions/quote-upload-dialog.tsx`, `apps/web/src/app/m/procurement/MobileProcurementList.tsx:467` (`PoCard`), `apps/web/src/components/mobile/v2/primitives.tsx:554` (`MobilePipelineStepper`). |
| 29 | `PATCH /api/requisitions/[id]` with `action: "approve"` and `action: "waiveQuotes"`. | **CONFIRMED** | `apps/web/src/app/api/requisitions/[id]/route.ts:117–179`. |
| 30 | `POST /api/quotations/[id]/approve` for quote winner selection. | **MAJOR DISCREPANCY** | Actual endpoint is `POST /api/quotes/[id]/select` (`apps/web/src/app/api/quotes/[id]/select/route.ts:1–88`), calling `selectWinningQuote` (`packages/services/src/quote-comparison.ts`). |
| 31 | `PATCH /api/purchase-orders/[id]` with `action: "approve"` / `action: "order"`. | **CONFIRMED** | `apps/web/src/app/api/purchase-orders/[id]/route.ts:121–176`. |
| 32 | PO `ORDERED` records `orderedAt`. | **MINOR DISCREPANCY** | `packages/db/prisma/schema.prisma:1355` has `orderDate`, not `orderedAt`. `packages/services/src/procurement.ts:347` writes `orderDate: new Date()`. |
| 33 | `/grn` desktop page and `/m/gate-entry` / `/m/grn` pages. | **CRITICAL DISCREPANCY** | No `apps/web/src/app/grn/page.tsx`, no `apps/web/src/app/m/grn/page.tsx`, no `apps/web/src/app/m/gate-entry/page.tsx`. WF-6 URLs are not wired. GRN is `/field`; gate entry is `/m/gate-pass`. |
| 34 | `notifyRequisitionSubmitted()` function exists. | **AMBIGUOUS** | No function with that exact name. `packages/services/src/requisition.ts:191–198` emits `NotificationEventType.REQUISITION_SUBMITTED` via the event bus, but the handler name is not `notifyRequisitionSubmitted`. |

## Discrepancies ranked by severity

### CRITICAL

1. **No pre-receipt inbound `GateEntry` / `INBOUND GatePass`.**  
   The `GatePass` model is strictly outbound (`MATERIAL_ISSUE`, `STOCK_TRANSFER`, `MATERIAL_SALE`, `SUPPLIER_RETURN`, `MANUAL`). WF-6's security gate entry step is not implemented; the `/m/gate-entry` page and `INBOUND` gate pass do not exist.  
   *Files:* `packages/db/prisma/schema.prisma:5257–5346`, `apps/web/src/app/m/gate-pass/page.tsx`, missing `apps/web/src/app/m/gate-entry/page.tsx`.

2. **Supplier return lines do not reference the GRN or lot.**  
   `SupplierReturnLine` only stores `materialId`, `qty`, `unitCost`, `reason`. There is no `goodsReceiptId`, `goodsReceiptLineId`, or `lotId`, so the claim "lines reference the GRN/lot and qty" is false.  
   *Files:* `packages/db/prisma/schema.prisma:3005–3018`, `packages/services/src/supplier-return.ts:39–45`.

3. **`MaterialLot` rows are not created on GRN.**  
   Although the schema has `MaterialLot`, `packages/services/src/procurement.ts` never passes `lotNumber`/`companyId` to `recordMovement`, so `packages/services/src/stock-ledger.ts:152–167` cannot auto-create lots. The lot/batch tracking documented in WF-6 is therefore un-wired.  
   *Files:* `packages/services/src/procurement.ts:627–636`, `packages/services/src/stock-ledger.ts:152–167`, `packages/db/prisma/schema.prisma:832`.

4. **`unitLandedCost` formula in §3.2.2 is materially wrong.**  
   The published formula `unitPrice + (unitPrice × gstRate/100) + freight + handling` omits discount, packing, loading, insurance, and buyer transport, and computes GST on the wrong base. Real code uses `taxableValuePerUnit × (1 + gstRate/100) + freight + loading + insurance + handling + buyerTransport`.  
   *Files:* `packages/services/src/quotation.ts:74–99`, `packages/db/prisma/schema.prisma:2816–2817`.

5. **`QuotationRequest` standalone flow is not wired to the API.**  
   `QuotationRequest` model exists (`packages/db/prisma/schema.prisma:2881–2943`) and `createQuotationRequest` exists in `packages/services/src/quotation.ts`, but there is no `/api/quotation-requests` or `/api/quotations` route. UC-QUOTE-06 is therefore unreachable from the UI.  
   *Files:* missing `apps/web/src/app/api/quotation-requests/...`, `packages/services/src/quotation.ts`.

### MAJOR

6. **3-tier requisition approval is not implemented.**  
   The "purchaser → store → MD" hierarchy does not exist. Approval is a single permission gate (`REQUISITION_APPROVE`).  
   *Files:* `apps/web/src/app/api/requisitions/[id]/route.ts:131–137`, `packages/services/src/requisition.ts:203–224`.

7. **PO value-approval role mapping is broken.**  
   `getApprovalRouting` returns `PROJECT_MANAGER`/`ADMIN`/`OWNER`, but `ROLE_RANK` in `packages/services/src/procurement.ts:29–37` only knows `MANAGER`/`ADMIN`/`OWNER`. `PROJECT_MANAGER` gets rank `0` and can never approve, even for low-value POs.  
   *Files:* `packages/services/src/procurement-advanced.ts:340–359`, `packages/services/src/procurement.ts:29–37`.

8. **WF-6 URL paths are wrong or missing.**  
   `/grn`, `/m/grn`, and `/m/gate-entry` do not exist. Actual GRN is at `/field`; gate pass is at `/m/gate-pass`.  
   *Files:* missing `apps/web/src/app/grn/page.tsx`, `apps/web/src/app/m/grn/page.tsx`, `apps/web/src/app/m/gate-entry/page.tsx`.

9. **Requisition status machine is incomplete in the document.**  
   The document omits `CONVERTED` and `REJECTED`, which are real statuses.  
   *Files:* `packages/db/prisma/schema.prisma:2600–2605`.

10. **Requisition form component names mismatch.**  
    `MobileRequisitionForm` does not exist; the desktop form is `RequisitionFormDialog`, not `RequisitionForm`.  
    *Files:* `apps/web/src/components/requisitions/requisition-form-dialog.tsx:35`, missing `MobileRequisitionForm`.

11. **Auto-requisition number prefix mismatch.**  
    Document says `RQ-YYMMDD-NNNN`; actual prefix is `AREQ-YYMMDD-NNNN` (`packages/services/src/auto-requisition.ts:126`). Log action is `AUTO_REQUISITION_GENERATE`, not `AUTO_REQUISITION_GENERATED`.

12. **Quote selection route mismatch.**  
    Document says `POST /api/quotations/[id]/approve`; actual endpoint is `POST /api/quotes/[id]/select`.  
    *Files:* `apps/web/src/app/api/quotes/[id]/select/route.ts:1–88`.

### MINOR

13. **"Last supplier" not captured.**  
    `MaterialRequisitionLine` stores `lastRate`, `lastRateDate`, and `currentStock`, but not the last supplier. `preferredSupplierId` is user-selected.  
    *Files:* `packages/db/prisma/schema.prisma:2669–2673`.

14. **PO `orderedAt` vs `orderDate` field name mismatch.**  
    Document says `orderedAt`; schema and service use `orderDate`.  
    *Files:* `packages/db/prisma/schema.prisma:1355`, `packages/services/src/procurement.ts:347`.

15. **`notifyRequisitionSubmitted` exact function name not found.**  
    The event `REQUISITION_SUBMITTED` is emitted, but no function with the documented name exists.  
    *Files:* `packages/services/src/requisition.ts:191–198`.
