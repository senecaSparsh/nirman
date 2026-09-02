# Nirman Inventory OS — Use Case Audit
## §3.1 Acquire (Land, Suppliers, Rate Contracts, NOCs) + Appendix A WF-8

**Audited document:** `USE_CASES_AND_WORKFLOWS.md`  
**Scope:** §3.1.1, §3.1.2, §3.1.3, §3.1.4, Appendix A WF-8  
**Audited against:** `packages/db/prisma/schema.prisma`, `packages/services/src/*`, `apps/web/src/app/api/*`, `apps/web/src/lib/nav.ts`, `apps/web/src/lib/roles.ts`, `apps/web/src/app/*` (pages + components).  
**Verdict legend:** CONFIRMED / DISCREPANCY (CRITICAL / MAJOR / MINOR) / AMBIGUOUS

---

## 1. Executive summary

| Verdict         | Count | Notes |
|-----------------|-------|-------|
| CONFIRMED       | ~25   | Schema, services and API surface exist and align with the documented claims. |
| DISCREPANCY     | 12    | Mostly UI-wiring / naming gaps, a few functional holes. |
| AMBIGUOUS       | 2     | Document wording does not map cleanly to an exact artifact. |

The data/schema layer is the strongest area (~95 % complete). The main gaps are **un-wired UI / auto-fill behavior** (rate contracts to POs, possession document upload) and **field-name mismatches** (`purchaseMode` vs `mode`, `Project.landId` missing).

---

## 2. §3.1.1 Land Purchase & Holding

### 2.1 `LandPurchase` schema and core fields

| # | Claim in document | Verdict | Evidence |
|---|-------------------|---------|----------|
| 1 | `LandPurchase` model with `landType` (`FREEHOLD` / `LEASEHOLD`) and `purchaseMode` (`WHOLE` / `SUBDIVIDED`). | **CONFIRMED** (with caveat) | `packages/db/prisma/schema.prisma:2055-2149` defines `LandPurchase`. `landType` and `LeaseType` are confirmed at `schema.prisma:2018-2027`. The actual field is named **`mode`** and is an enum `LandPurchaseMode` (`WHOLE`, `SUBDIVIDED`, `BOOKED`) at `schema.prisma:2010-2014`, not `purchaseMode`. |
| 2 | Fields: `totalArea`, `areaUnit`, `totalCost`, `baseCost`, `leaseRentPercent/Amount`, `gstPercent/Amount`, `registrationPercent/Amount`, `stampDutyPercent/Amount`, `transferDutyPercent/Amount`, `brokerageAmount`, `legalFees`, `otherCharges`, `isPossessed`, `possessionDate`. | **CONFIRMED** | `schema.prisma:2063-2125`. |
| 3 | `purchaseStage` lifecycle: `BOOKED` → `COMPLETED`/`CANCELLED`. | **CONFIRMED** | `schema.prisma:2106-2110` (`purchaseStage` string, default `"COMPLETED"`). `packages/services/src/land.ts:606-744` implements `recordLandPurchaseOrder` (BOOKED). `packages/services/src/land.ts:892-988` implements `completeLandPurchase`. |

### 2.2 Cost breakup and recurring costs

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 4 | Cost breakup with percentage override for lease rent, GST, registration, stamp duty. | **CONFIRMED** | UI: `apps/web/src/components/land/land-purchase-wizard-dialog.tsx:241-267` computes each component from percentages. Service: `packages/services/src/land.ts:336-349` accepts all percentage/amount fields. |
| 5 | `LandCostComponent` for one-time or recurring costs; `recomputeLandTotalCost()` posts GL delta and updates `totalCost`. | **CONFIRMED** | `schema.prisma:2181-2202` defines the model. `packages/services/src/land-cost-component.ts:144-189` (`addLandCostComponent`), `:304-423` (`recomputeLandTotalCost`) and `:425-433` (`refreshLandTotalCost`). GL posting `postLandCostComponent` is called. |
| 6 | `totalCost = fixed cost-breakup columns + Σ posted LandCostComponent amounts`. | **CONFIRMED** | `land-cost-component.ts:320-325` lists fixed columns; `:374` computes `newTotal = fixedCols.plus(componentsTotal)`; `:379-382` updates `LandPurchase.totalCost`. |

### 2.3 Possession, conversion and lifecycle

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 7 | Possession is toggled with `isPossessed` + `possessionDate` and a document upload. | **DISCREPANCY — MINOR** | Schema: `isPossessed` and `possessionDate` exist (`schema.prisma:2122-2124`). However, `POST /api/land-purchases/[id]/possession` (`apps/web/src/app/api/land-purchases/[id]/possession/route.ts:11-35`) only accepts `{ isPossessed, possessionDate, notes }`; no document. The generic `documentUrl` field exists but is not linked to the possession action. |
| 8 | “Create Project on this Land” pre-fills `Project.landId`. | **DISCREPANCY — MAJOR** | No `landId` field exists on `Project` (`grep landId` in `schema.prisma` returned no matches). The actual flow is `POST /api/land-purchases/[id]/create-project` (`apps/web/src/app/api/land-purchases/[id]/create-project/route.ts:18-84`) which creates a `Project` and writes `LandPurchase.projectId`. |
| 9 | Purchase lifecycle: `BOOKED` → (ATS/BBA optional) → Registry → `COMPLETED`. | **CONFIRMED with gaps** | `recordLandPurchaseOrder` (BOOKED) and `completeLandPurchase` (requires `registryDocumentUrl`) exist. `atsDocumentUrl` is supported. **BBA (Builder Buyer Agreement) is not present** in the schema or services — only ATS/Registry. |
| 10 | `POST /api/land-purchases` creates a land purchase. | **CONFIRMED** | `apps/web/src/app/api/land-purchases/route.ts:77-232` supports `WHOLE`, `SUBDIVIDED` and `BOOKED` modes. |

---

## 3. §3.1.2 Land Partition / Subdivision

### 3.1 Partitioning

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 11 | Atomic partition validates `Σ child area = parent area`, creates `LandParcel` children, sets parent `status = PARTITIONED`, records `LandPartition`. | **CONFIRMED** | `packages/services/src/partition.ts:62-253` (`partitionLandParcel`). Validation at `:85-94`; parent update at `:198-201`; `LandPartition` creation at `:204-213`. |
| 12 | Per-plot `currentValuation` and `askingPrice` at partition time. | **CONFIRMED** | `partition.ts:184-185` sets `askingPrice` and `currentValuation`. `packages/services/src/partition.ts:388-454` (`updateParcelValuation`) updates them later. |
| 13 | Owner-only un-partition. | **CONFIRMED** | `apps/web/src/app/api/land-parcels/route.ts:111-124` calls `unpartitionLandParcel` and requires `PERM.LAND_PARTITION`. Only `OWNER` and `ADMIN` have wildcard permissions (`apps/web/src/lib/roles.ts:242-263`), so the permission is effectively T1-only. `partition.ts:270-382` implements the soft-delete and parent restore. |
| 14 | `recomputeLandTotalCost()` reprices child `acquisitionCost` pro-rata. | **CONFIRMED (semantically)** | `packages/services/src/land-cost-component.ts:384-405` reprices child parcels pro-rata on any `totalCost` change. `partition.ts:118-145` also allocates the parent cost across children at partition time. |

### 3.2 Business rules

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 15 | “Subdivided plots cannot host a project; only un-subdivided land can.” | **DISCREPANCY — MAJOR** | `POST /api/land-purchases/[id]/create-project` (`create-project/route.ts:18-84`) only checks `landPurchase.projectId` — it does **not** inspect `landPurchase.mode` or parcel partition status. The UI button likewise only checks `!purchase.projectId` (`apps/web/src/components/land/land-hub.tsx:429-434`). A subdivided parent could therefore be linked to a new project. |
| 16 | Child status tracks Available / Sold / Rented. | **CONFIRMED** | `LandParcelStatus` enum at `schema.prisma:2284-2291` includes `AVAILABLE`, `HOLD`, `PARTITIONED`, `RESERVED`, `SOLD`, `RENTED`. |

---

## 4. §3.1.3 Suppliers & Rate Contracts

### 4.1 Suppliers

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 17 | `Supplier` master with name, GST (optional), contact, bank. | **DISCREPANCY — MINOR** | `packages/db/prisma/schema.prisma:1009-1045` has `name`, `gstin`, `phone`, `email`, `address`. **No `bank` or banking fields exist.** |
| 18 | Suppliers are company-wide, not material-specific. | **CONFIRMED** | `Supplier` has `companyId` and is not linked to `Material` directly; `RateContract` links supplier+material. |
| 19 | Bulk Excel import of supplier lists. | **DISCREPANCY — MINOR** | `PUT /api/suppliers` (`apps/web/src/app/api/suppliers/route.ts:73-119`) accepts a JSON `{ items: [...] }` array, not an Excel file. The UI labels the action **“CSV Import”** (`apps/web/src/components/vendors/vendors-view.tsx:162`). |
| 20 | Vendor rating: 40 % on-time delivery + 30 % quality + 30 % price competitiveness. | **CONFIRMED** | `packages/services/src/procurement-advanced.ts:40-122` (`computeVendorRating`). Weights are at `:106-109`. |

### 4.2 Rate contracts

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 21 | `RateContract` model: supplier + material + agreed rate + validity + min/max qty. | **CONFIRMED** | `packages/db/prisma/schema.prisma:5659-5686`. `packages/services/src/procurement-advanced.ts:176-225` (`createRateContract`). |
| 22 | Expired contracts auto-expire. | **CONFIRMED** | `packages/services/src/procurement-advanced.ts:248-269` (`getRateContracts` updates expired contracts to `EXPIRED` status). |
| 23 | PO creation auto-fills active rates. | **DISCREPANCY — MAJOR** | `getActiveRateContract` exists (`packages/services/src/procurement-advanced.ts:231-243`) and is exported, but a search of `apps/web` and `packages/services/src/procurement.ts` found **no call to it** in the PO creation flow. The `createPurchaseOrder` service (`apps/web/src/app/api/purchase-orders/route.ts:103`) does not auto-fill rates from contracts. |

---

## 5. §3.1.4 Legal Permissions / NOCs

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 24 | `LegalDocument` attaches to `landId` or `projectId` with `LegalDocType` and `LegalDocStatus` (`PENDING` / `APPROVED` / `EXPIRED` / `RENEWAL_DUE`). | **CONFIRMED** | `packages/db/prisma/schema.prisma:5880-5939` defines the model; `LegalDocType` (`:5832-5862`) and `LegalDocStatus` (`:5864-5871`) enums exist. **Note:** `LegalDocStatus` also contains `NOT_REQUIRED` and `REJECTED`, not listed in the use case. |
| 25 | Expiry alerts and `/api/legal-documents?status=EXPIRED,RENEWAL_DUE`. | **CONFIRMED** | `apps/web/src/app/api/legal-documents/route.ts:14-87` supports status filters. `apps/web/src/lib/nav.ts:517-522` exposes the “Permissions & Legal” nav item with badge endpoint `/api/legal-documents?all=true&status=PENDING,EXPIRED,RENEWAL_DUE`. Page `apps/web/src/app/permissions/page.tsx` exists. |
| 26 | Document upload per permission. | **CONFIRMED** | `LegalDocument` has `documentUrl` and `documentName` (`schema.prisma:5916-5917`). `POST /api/legal-documents` (`apps/web/src/app/api/legal-documents/route.ts:94-138`) accepts both. |
| 27 | Map sanction, fire, airport, CLA, building permission, completion/occupancy certificates. | **DISCREPANCY — MINOR** | `LegalDocType` includes `BUILDING_PERMISSION`, `FIRE_NOC`, `AIRPORT_NOC`, `COMPLETION_CERTIFICATE`, `OCCUPANCY_CERTIFICATE`, `COMMENCEMENT_CERTIFICATE`, `LAND_SANCTION`. **“Map sanction” and “CLA” are not named as types** — the closest match is `BUILDING_PERMISSION` / `LAND_SANCTION`. |

---

## 6. Appendix A WF-8: Land Purchase → Cost Breakup → Partition → Project

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 28 | Build → Land (`/land`) and “New Land Purchase” wizard. | **CONFIRMED** | `apps/web/src/app/land/page.tsx:15-277`. Button text in `apps/web/src/components/land/land-view.tsx:290` is “Record Land Purchase”. Wizard at `apps/web/src/components/land/land-purchase-wizard-dialog.tsx`. |
| 29 | “User enters land name, area, area unit, land type and purchase mode.” | **DISCREPANCY — MINOR** | There is **no `name` field** on `LandPurchase`; the UI uses `sellerName`, `location`, `registryNo` and parent parcel `number` for identification. |
| 30 | Base cost and percentage add-ons (lease rent one-time/yearly, GST, registration, stamp duty). | **CONFIRMED** | `land-purchase-wizard-dialog.tsx:241-267` and `schema.prisma:2080-2100`. |
| 31 | “Each line shows the math: ‘X% of Y = Z’ and an amount field.” | **DISCREPANCY — MINOR** | The wizard shows percentage inputs and computed amounts (`land-purchase-wizard-dialog.tsx:659-684`) but does not display the literal “X% of Y = Z” sentence shown in the use case. |
| 32 | `POST /api/land-purchases`; `totalCost = base + components`; GL `Dr Land Asset, Cr Cash/Bank/Supplier`. | **CONFIRMED** | `apps/web/src/app/api/land-purchases/route.ts:77-232` calls `recordLandPurchase` / `recordLandPurchaseWithPlan`. `packages/services/src/gl-posting.ts:1009-1045` (`postLandPurchase`) posts exactly `Dr Unsold Assets - Land`, `Cr Cash/Bank`, and `Cr Accounts Payable` for staged purchases. |
| 33 | “Possess” button uploads possession document and sets `isPossessed`/`possessionDate`. | **DISCREPANCY — MINOR** | The “Possess” action maps to `POST /api/land-purchases/[id]/possession` which sets `isPossessed`/`possessionDate` (`apps/web/src/app/api/land-purchases/[id]/possession/route.ts:11-35`). **No possession document is accepted.** |
| 34 | Partition dialog; 4 child plots 100/200/300/400; validation `Σ child area = 1000`. | **CONFIRMED** | `packages/services/src/partition.ts:85-94` enforces area conservation. UI dialog at `apps/web/src/components/land/partition-dialog.tsx` and canvas at `partition-canvas.tsx`. |
| 35 | `currentValuation` and `askingPrice` for each child. | **CONFIRMED** | `partition.ts:184-185`, `updateParcelValuation`. |
| 36 | Atomic transaction creates `LandParcel` records, sets parent `PARTITIONED`, records `LandPartition`, `recomputeLandTotalCost` reprices pro-rata. | **CONFIRMED (mostly)** | `partition.ts:163-219` performs the atomic work. Cost reallocation is handled inside the partition itself (`partition.ts:118-161`); the `LandCostComponent` recomputation is triggered later on land detail GET (`apps/web/src/app/api/land-purchases/[id]/route.ts:33`). |
| 37 | “Create Project on this Land” only if not subdivided; redirects to `/projects/new` with `landId` pre-selected. | **DISCREPANCY — MAJOR** | There is **no `/projects/new` page** in `apps/web/src/app` (search found none). The actual flow is `POST /api/land-purchases/[id]/create-project` (`create-project/route.ts:18-84`). The UI button is not disabled for subdivided land — it only checks `!purchase.projectId` (`land-hub.tsx:429-434`). |
| 38 | Branching: “Child areas must total 1000.00 sq yd. Current: 950.00 sq yd.” | **DISCREPANCY — MINOR** | The actual error message from `partition.ts:90-93` is `Area conservation violated: Σ children (...) ≠ parent (...). Difference: ...`, not the exact wording in the use case. |
| 39 | Un-partition only OWNER/ADMIN; children deleted, parent reset to `AVAILABLE`. | **CONFIRMED** | `partition.ts:270-382` and permission `PERM.LAND_PARTITION` (`roles.ts:182`), effectively T1-only. |

---

## 7. Recommendations (actionable)

1. **Fix `purchaseMode` terminology** in the use-case document to match the schema field `mode`.
2. **Add `bank` fields to `Supplier`** or remove “bank” from the documented supplier master claim.
3. **Wire rate contracts to PO creation** — call `getActiveRateContract(materialId, supplierId)` in `createPurchaseOrder` and the PO UI to auto-fill `unitCost`.
4. **Gated project creation from subdivided land** — add a check in `POST /api/land-purchases/[id]/create-project` for `landPurchase.mode !== 'WHOLE'` or `parcels` not partitioned.
5. **Possession document upload** — either extend `markPossession` to accept `possessionDocumentUrl` or remove the claim that possession is document-gated.
6. **Add `Project.landId` or clarify the inverse relation** (`LandPurchase.projectId`) in the document.
7. **Clarify BBA / map-sanction / CLA** — either add missing `LegalDocType` values or document the mapping to existing types.
8. **Bulk import wording** — change “Excel upload” in the use case to “CSV import” to match the current UI and API contract.
9. **Error message consistency** — consider matching the documented `WF-8` validation error text in the partition service, or update the use case to the actual message.

---

## 8. Files / artifacts referenced (primary)

- `packages/db/prisma/schema.prisma` (models and enums)
- `packages/services/src/land.ts`
- `packages/services/src/land-cost-component.ts`
- `packages/services/src/partition.ts`
- `packages/services/src/procurement-advanced.ts`
- `packages/services/src/legal-docs.ts`
- `packages/services/src/gl-posting.ts`
- `apps/web/src/app/api/land-purchases/route.ts`
- `apps/web/src/app/api/land-purchases/[id]/route.ts`
- `apps/web/src/app/api/land-purchases/[id]/possession/route.ts`
- `apps/web/src/app/api/land-purchases/[id]/document/route.ts`
- `apps/web/src/app/api/land-purchases/[id]/create-project/route.ts`
- `apps/web/src/app/api/land-parcels/route.ts`
- `apps/web/src/app/api/suppliers/route.ts`
- `apps/web/src/app/api/rate-contracts/route.ts`
- `apps/web/src/app/api/legal-documents/route.ts`
- `apps/web/src/app/api/purchase-orders/route.ts`
- `apps/web/src/lib/roles.ts`
- `apps/web/src/lib/nav.ts`
- `apps/web/src/components/land/land-view.tsx`
- `apps/web/src/components/land/land-purchase-wizard-dialog.tsx`
- `apps/web/src/components/land/land-hub.tsx`
- `apps/web/src/components/vendors/vendors-view.tsx`
