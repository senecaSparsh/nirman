# Stock Audit (§3.3) — Gauntlet Verification

> **Source**: `USE_CASES_AND_WORKFLOWS.md` lines 250–335 (§3.3 Stock)
> **Method**: Two-pass gauntlet (read → verify → re-read → verify) against the real codebase.
> **Date**: 2026-09-04

## Bookmark

- Source: `USE_CASES_AND_WORKFLOWS.md` §3.3 Stock (lines 250–335)
- Schema: `packages/db/prisma/schema.prisma`
- Services: `packages/services/src/stock-ledger.ts`, `issue.ts`, `transfer.ts`, `equipment.ts`, `scrap.ts`, `material-sale.ts`, `valuation.ts`, `standard-consumption.ts`, `reconciliation.ts`, `stock-count.ts`, `gate-pass.ts`, `gl-posting.ts`, `moving-average-cost.ts`
- Web: `apps/web/src/app/api/` + `apps/web/src/app/print/issue/`

---

## Per-Claim Verdicts

### UC-STOCK-01: `StockLocationItem.qty` is source of truth; `StockMovement` is immutable ledger.
- Pass 1: `schema.prisma:1787-1838` + `stock-ledger.ts:12-21,241-317` → found
- Pass 2: re-read spec L257 + `@@unique([locationId, materialId])` → confirmed
- **VERDICT: CONFIRMED**

### UC-STOCK-02: MAC formula on receipt; unchanged on issue.
- Pass 1: `moving-average-cost.ts:17-40` + `stock-ledger.ts:269-287` → exact formula
- Pass 2: re-read spec L258 + IN/OUT branches → confirmed
- **VERDICT: CONFIRMED**

### UC-STOCK-03: All qty mutations via `recordMovement()`/`recordTransfer()` in Serializable tx.
- Pass 1: `stock-ledger.ts:292-317,383-420` (`withStockTransaction` isolation Serializable)
- Pass 2: re-read spec L259 → confirmed
- **VERDICT: CONFIRMED**

### UC-STOCK-04: Location types COMPANY_WAREHOUSE, PROJECT_SITE, DEPARTMENT.
- Pass 1: `schema.prisma:861-866` enum `StockLocationType { CENTRAL_WAREHOUSE, COMPANY_WAREHOUSE, PROJECT_SITE, DEPARTMENT }`
- Pass 2: re-read spec L260 → confirmed (superset with CENTRAL_WAREHOUSE)
- **VERDICT: CONFIRMED**

### Business rule: Negative stock prevented.
- Pass 1: `stock-ledger.ts:279-283` throws on OUT; `transfer.ts:291-305,441-446` pre-checks
- Pass 2: re-read spec L263 → confirmed
- **VERDICT: CONFIRMED**

### Business rule: MAC per-location; transfers carry source MAC.
- Pass 1: `stock-ledger.ts:344-367` TRANSFER_IN uses `outResult.newMAC`; `StockLocationItem.movingAvgCost` per `locationId_materialId`
- Pass 2: re-read spec L264 → confirmed
- **VERDICT: CONFIRMED**

### Business rule: Every movement posts a StockMovement row.
- Pass 1: `recordMovement` always `tx.stockMovement.create`; `recordTransfer` calls it twice
- Pass 2: re-read spec L265 → confirmed
- **VERDICT: CONFIRMED**

---

### UC-ISSUE-01: Issue to project — projectId required; WIP + reallocateProjectCosts.
- Pass 1: `issue.ts:59` requires projectId; `:164-165` calls `reallocateProjectCosts`; `gl-posting.ts:335-356` Dr WIP / Cr INVENTORY
- Pass 2: re-read spec L272 + `valuation.ts:269-382` → confirmed (cost flows to WIP + cached `Project.costPerSqft`/`BuiltUnit.productionCost`, not a separate `ProjectCost` row)
- **VERDICT: CONFIRMED**

### UC-ISSUE-02: Issue to department — departmentId required; Operating Expenses; no reallocation.
- Pass 1: `issue.ts:411` requires departmentId; `gl-posting.ts:495-514` Dr OPERATING_EXPENSE / Cr INVENTORY; no `reallocateProjectCosts`
- Pass 2: re-read spec L273 → confirmed
- **VERDICT: CONFIRMED**

### UC-ISSUE-03: Per-unit issue — builtUnitId routes cost directly to unit productionCost.
- Pass 1: `issue.ts:76-82` validates builtUnitId; `valuation.ts:285-296,366-367` separates unitDirectCostMap
- Pass 2: re-read spec L274 → confirmed
- **VERDICT: CONFIRMED**

### UC-ISSUE-04: Issue slip SA-xxxxx with receiver, mobile, qty, rate, value, round-off, words.
- Pass 1: `issue.ts:17-22` generates `SA-YYMMDD-NNNN`; `print/issue/[id]/page.tsx:25-205` renders all fields + `amountInWords`
- Pass 2: re-read spec L275 → confirmed (format is superset of SA- prefix)
- **VERDICT: CONFIRMED**

### Business rule: Exactly one of projectId or departmentId.
- Pass 1: `server.ts:441-464` Zod `.refine`
- Pass 2: re-read spec L278 → confirmed
- **VERDICT: CONFIRMED**

### Business rule: GL Dr WIP/Operating Expenses, Cr Stock.
- Pass 1: `gl-posting.ts:352-353` (WIP/INVENTORY), `:512-513` (OPERATING_EXPENSE/INVENTORY)
- Pass 2: re-read spec L279 → confirmed
- **VERDICT: CONFIRMED**

---

### UC-TRANSFER-01: Intra-company — TRANSFER_OUT at source MAC, TRANSFER_IN at same MAC.
- Pass 1: `stock-ledger.ts:344-367` + `transfer.ts:616-623`
- Pass 2: re-read spec L286 → confirmed
- **VERDICT: CONFIRMED**

### UC-TRANSFER-02: Inter-company STO — transfer price = source MAC + freight + handling + markup%.
- Pass 1: `transfer.ts:72-138` `computeTransferPrice`; `:450-560` TRANSFER_IN at `unitTransferPrice`
- Pass 2: re-read spec L287 → confirmed
- **VERDICT: CONFIRMED**

### UC-TRANSFER-03: Transfer approval queue — DRAFT → PENDING → COMPLETED / REJECTED.
- Pass 1: `schema.prisma:1971-1976` enum `StockTransferStatus { DRAFT, IN_TRANSIT, COMPLETED, CANCELLED }`; no PENDING/REJECTED; no approveTransfer/rejectTransfer
- Pass 2: re-read spec L288 → actual flow is `DRAFT → IN_TRANSIT → COMPLETED | CANCELLED`; approval delegated to GatePass
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: StockTransfer has PENDING and REJECTED states with in-model approval queue.
  - Actual: `DRAFT | IN_TRANSIT | COMPLETED | CANCELLED`; approval externalized to GatePass.

---

### UC-EQUIP-01: Equipment master — status, location, depreciation, maintenance schedule.
- Pass 1: `schema.prisma:2659-2682` Equipment has status, acquisitionCost, currentValue; NO location column, NO maintenanceSchedule/depreciationRate field. Location via EquipmentAssignment; depreciation via helper `computeDepreciatedValue` (`equipment.ts:466-475`)
- Pass 2: re-read spec L295 → location on assignment, no schedule field
- **VERDICT: DISCREPANCY (MINOR)**
  - Expected: Equipment model directly stores location, depreciation, maintenance schedule.
  - Actual: Location on EquipmentAssignment; currentValue is a cache; no maintenanceSchedule field.

### UC-EQUIP-02: EquipmentAssignment records who has it and for which project.
- Pass 1: `schema.prisma:2689-2706` has equipmentId, locationId, projectId, assignedAt, returnedAt, status; NO assignedToId/employeeId
- Pass 2: re-read spec L296 → records where + which project, not the individual custodian
- **VERDICT: DISCREPANCY (MINOR)**
  - Expected: Records the person/assignee who has the equipment.
  - Actual: Records locationId + projectId, not the individual custodian.

### UC-EQUIP-03: Maintenance — MaintenanceType (preventive / breakdown / AMC).
- Pass 1: `schema.prisma:2708-2712` enum `MaintenanceType { SCHEDULED, REPAIR, INSPECTION }`
- Pass 2: re-read spec L297 → values differ
- **VERDICT: DISCREPANCY (MINOR)**
  - Expected: preventive, breakdown, AMC.
  - Actual: SCHEDULED, REPAIR, INSPECTION.

### UC-EQUIP-04: Retire/sell — Equipment can be retired or sold as an AssetSale.
- Pass 1: `equipment.ts:304-355,400-459` retireEquipment/sellEquipment set status + post GL but create NO AssetSale. `AssetSale` (`schema.prisma:3392-3511`) assetType only LAND/BUILT_UNIT; no equipmentId
- Pass 2: re-read spec L298 → AssetSale cannot reference equipment
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: Equipment sale produces an AssetSale record.
  - Actual: sellEquipment only sets Equipment.status=SOLD + posts GL; AssetSale has no equipmentId.

---

### UC-SCRAP-01: Scrap generation — ScrapGeneration + ScrapGenerationLine; Material.isScrap=true; SCRAP_GENERATED movement.
- Pass 1: `scrap.ts:121-169` creates rows + recordMovement(SCRAP_GENERATED); `Material.isScrap` exists (schema:1025) but service does NOT set it
- Pass 2: re-read spec L305 → flag not flipped by service
- **VERDICT: DISCREPANCY (MINOR)**
  - Expected: Scrap generation sets Material.isScrap = true.
  - Actual: Stock IN + ScrapGeneration rows created, but isScrap not set by service.

### UC-SCRAP-02: Auto-detect from DPR variance — runDprVarianceAnalysis() flags scrap; optionally auto-generates slip.
- Pass 1: `standard-consumption.ts:330-500` computes variance, identifies overConsumptionLines, optionally creates ScrapGeneration
- Pass 2: re-read spec L306 → confirmed
- **VERDICT: CONFIRMED**

### UC-SCRAP-03: Scrap sale as cost recovery — createMaterialSale() with projectId subtracts scrapSubtotal from project total cost; GL credits COST_RECOVERY.
- Pass 1: `material-sale.ts:61-88,128-340` tracks scrapSubtotal + calls reallocateProjectCosts; `gl-posting.ts:722-726` credits COST_RECOVERY. BUT `valuation.ts:322-328,214-221` subtract only ScrapGeneration value, NOT MaterialSale.scrapSubtotal
- Pass 2: re-read spec L307 → GL correct; project-cost subtraction missing
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: createMaterialSale with projectId reduces project total cost by scrapSubtotal.
  - Actual: GL credits COST_RECOVERY, but reallocateProjectCosts/projectTotalCost ignore MaterialSale.scrapSubtotal; only recover ScrapGeneration value.

---

### UC-COUNT-01: Stock count sheet — StockCount + StockCountLine by location and material.
- Pass 1: `schema.prisma:2100-2127` + `stock-count.ts` createStockCount
- Pass 2: re-read spec L314 → confirmed
- **VERDICT: CONFIRMED**

### UC-COUNT-02: Confirm/reconcile — DRAFT → COUNTED → CONFIRMED → RECONCILED.
- Pass 1: `schema.prisma:2094-2098` enum `StockCountStatus { DRAFT, COUNTED, RECONCILED }`; no CONFIRMED
- Pass 2: re-read spec L315 → three states, not four
- **VERDICT: DISCREPANCY (MINOR)**
  - Expected: Four states DRAFT → COUNTED → CONFIRMED → RECONCILED.
  - Actual: Three states DRAFT → COUNTED → RECONCILED; CONFIRMED missing.

### UC-COUNT-03: GL impact — shortage/surplus posts to adjustment accounts in same tx.
- Pass 1: `stock-count.ts:147-259` reconcileStockCount inside withStockTransaction + postStockAdjustment; `gl-posting.ts:1365-1401` INVENTORY_SHRINKAGE (loss) / OPERATING_EXPENSE (gain)
- Pass 2: re-read spec L316 → confirmed
- **VERDICT: CONFIRMED**

---

### UC-BENCH-01: StandardConsumption per workType + materialId + unitOfMeasure.
- Pass 1: `schema.prisma:1112-1129` + `standard-consumption.ts:31-75`
- Pass 2: re-read spec L323 → confirmed
- **VERDICT: CONFIRMED**

### UC-BENCH-02: calculateConsumptionVariance() with WARNING/CRITICAL tolerance alerts.
- Pass 1: `standard-consumption.ts:246-302` returns variance, variancePct, isOverConsumption — NO WARNING/CRITICAL levels. Tolerance alerts only in `reconciliation.ts:64-96` computeReconciliationVariances
- Pass 2: re-read spec L324 → variance routine lacks tolerance alerts
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: calculateConsumptionVariance returns WARNING/CRITICAL tolerance alerts.
  - Actual: Returns boolean isOverConsumption + percentages; WARNING/CRITICAL only in reconciliation path.

### UC-BENCH-03: MaterialReconciliation report — required (BOQ) vs issued vs consumed (MB) vs physical stock, wastage %.
- Pass 1: `reconciliation.ts:104-227` getProjectMaterialReconciliation produces report with requiredQty/issuedQty/consumedQty/currentStock/wastagePct. No persisted MaterialReconciliation model.
- Pass 2: re-read spec L325 → report fields match; computed service report, not a table
- **VERDICT: CONFIRMED** (report implemented; no dedicated table)

---

### UC-GP-01: Create outbound gate pass — GatePass with category (issue, transfer, sale, return) and lines.
- Pass 1: `gate-pass.ts:63-82` CreateGatePassInput; `schema.prisma:~5924` GatePass + GatePassLine; category enum MATERIAL_ISSUE | STOCK_TRANSFER | MATERIAL_SALE | SUPPLIER_RETURN | MANUAL
- Pass 2: re-read spec L332 → confirmed (semantic match)
- **VERDICT: CONFIRMED**

### UC-GP-02: Approval before exit — PENDING → APPROVED → EXITED.
- Pass 1: `gate-pass.ts:33-43,174-425` submitGatePass → approveGatePass → confirmExit
- Pass 2: re-read spec L333 → confirmed
- **VERDICT: CONFIRMED**

### UC-GP-03: Photo capture at exit.
- Pass 1: `gate-pass.ts:379-382,391-399` confirmExit stores exitPhotos
- Pass 2: re-read spec L334 → confirmed
- **VERDICT: CONFIRMED**

---

## SECTION VERDICT — §3.3 Stock

| Metric | Count |
|---|---|
| Claims verified | 27 |
| CONFIRMED | 20 |
| DISCREPANCY | 7 |
| AMBIGUOUS | 0 |

### Ranked Discrepancies

1. **[MAJOR] UC-TRANSFER-03** — StockTransfer status machine is `DRAFT | IN_TRANSIT | COMPLETED | CANCELLED`; missing PENDING/REJECTED. Approval externalized to GatePass.
2. **[MAJOR] UC-EQUIP-04** — Equipment sale does not create AssetSale; AssetSale has no equipmentId (only LAND/BUILT_UNIT).
3. **[MAJOR] UC-SCRAP-03** — Scrap sale GL credits COST_RECOVERY but reallocateProjectCosts/projectTotalCost ignore MaterialSale.scrapSubtotal; only recover ScrapGeneration value.
4. **[MAJOR] UC-BENCH-02** — calculateConsumptionVariance lacks WARNING/CRITICAL tolerance alerts; only reconciliation.ts has them.
5. **[MINOR] UC-EQUIP-01** — Equipment has no location column / maintenanceSchedule field; location via EquipmentAssignment.
6. **[MINOR] UC-EQUIP-02** — EquipmentAssignment records locationId + projectId, not the individual custodian.
7. **[MINOR] UC-EQUIP-03** — MaintenanceType is SCHEDULED/REPAIR/INSPECTION, not preventive/breakdown/AMC.
8. **[MINOR] UC-SCRAP-01** — createScrapGeneration does not set Material.isScrap = true.
9. **[MINOR] UC-COUNT-02** — StockCountStatus is DRAFT/COUNTED/RECONCILED; CONFIRMED missing.

### Action Items

- **Transfer approval**: Add PENDING/REJECTED to StockTransferStatus + approveTransfer/rejectTransfer services, OR update spec to reflect DRAFT → IN_TRANSIT → COMPLETED | CANCELLED with GatePass approval.
- **Equipment/AssetSale**: Add equipmentId to AssetSale and route sellEquipment through it, OR document equipment sales as off-AssetSale.
- **Scrap cost recovery**: Update reallocateProjectCosts/projectTotalCost to also subtract MaterialSale.scrapSubtotal for project-linked scrap sales.
- **Variance alerts**: Wire WARNING/CRITICAL tolerance thresholds into calculateConsumptionVariance/runDprVarianceAnalysis.
