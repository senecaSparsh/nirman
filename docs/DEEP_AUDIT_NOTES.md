# Deep Audit Notes — Nirman Inventory OS

> **Audit date**: 2026-09-03
> **Scope**: Audit-log completeness + Cascading update chains + Data-flow integrity
> **Method**: Gauntlet-style two-pass verification (read → verify → re-read → verify)
> **Status**: Read-only audit — no code changes made

---

## Executive Summary

| Area | Items checked | Passing | Failing | Critical | Major | Minor |
|------|--------------|---------|---------|----------|-------|-------|
| Audit-log completeness | 611 exported functions / 560 mutation sites | ~284 `logAction` calls | 41 confirmed unlogged mutations | 37 | 4 | 0 |
| Cascading update chains | 5 chains / 22 links | 19 links | 3 discrepancies | 1 | 2 | 1 |
| Soft-delete filters | 370 master-entity reads | ~326 | 44 | 28 | 4 | 12 |
| Permission gates | 548 route handlers | ~536 | 12 | 6 | 2 | 4 |
| Prisma singleton | 1 | 0 (no invalidation) | 1 (informational) | 0 | 0 | 0 |

**Top-line finding**: The AGENTS.md claim that "EVERY mutation calls `logAction()`" is **not fully realized** — ~41 true mutations have no audit trail, including core financial functions (`reallocateProjectCosts`, `recordMovement`, `recordTransfer`, `softDelete`). The cascading update chains are mostly transactionally sound, but there are two real bugs: a GL routing mismatch in sale payments (CRITICAL) and a missing scrap-sale cost recovery in project reallocation (MAJOR). Soft-delete filters are missing in 44 places, several allowing operations on archived master entities. 6 mutation API routes lack `requirePermission` gates.

---

## §1. Audit-Log Completeness

### Summary
- 82 service files in scope
- 58 files call `logAction(` (284 total calls)
- 16 files have Prisma mutations but NO `logAction`
- 41 confirmed unlogged true mutations

### CRITICAL findings — core financial/stock mutations with no audit log

| File | Function | Mutation | `userId` param? |
|------|----------|----------|-----------------|
| `valuation.ts:222` | `reallocateProjectCosts` | Updates `BuiltUnit.productionCost`, `Project.costPerSqft`/`totalProjectCost` | NO |
| `soft-delete.ts:27` | `softDelete` | Soft-deletes master entities (Company, Project, Material, Supplier, etc.) | NO |
| `soft-delete.ts:38` | `restoreEntity` | Restores master entities | NO |
| `stock-ledger.ts:49` | `recordMovement` | Creates `StockMovement`, `MaterialLot`, updates `StockLocationItem` qty + MAC | YES |
| `stock-ledger.ts:268` | `recordTransfer` | Creates `TRANSFER_OUT` + `TRANSFER_IN` movements | YES |
| `stock-ledger.ts:361` | `refreshMaterialCurrentCost` | Updates `Material.currentCost` | NO |
| `procurement-routing.ts:194` | `evaluateRequisitionRouting` | Caches LCI decision on `MaterialRequisition` | NO |
| `material-service.ts:20` | `autoFillHsnGst` | Updates `Material.hsnCode` and `Material.gstRate` | NO |
| `vehicle.ts:68` | `recordVehicleTrip` | Upserts `Vehicle`, creates `VehicleTrip` | NO |
| `hsn-gst.ts:163` | `seedHsnGstRates` | Upserts `HsnGstRate` master rows | NO |
| `tally.ts:343` | `syncEntryToTally` | Upserts/updates `TallySyncLog` | NO |
| `tally.ts:424` | `syncBatchToTally` | Writes `TallySyncLog` | NO |
| `tally.ts:663` | `syncFromTally` | Creates/updates `TallySyncLog` | NO |

### CRITICAL findings — notifications/push (background mutations)

| File | Function | Mutation | `userId` param? |
|------|----------|----------|-----------------|
| `notifications.ts:228` | `sendNotification` | Creates + updates `NotificationLog` | NO |
| `notifications.ts:308` | `notifyLowStock` | Creates `NotificationLog` | NO |
| `notifications.ts:334` | `notifyTaskAssignment` | Creates `NotificationLog` | NO |
| `notifications.ts:356` | `notifyQuoteApproval` | Creates `NotificationLog` | NO |
| `notifications.ts:385` | `notifyPaymentDue` | Creates `NotificationLog` | NO |
| `notifications.ts:502` | `createInAppNotification` | Creates `InAppNotification` | NO |
| `notifications.ts:549` | `markNotificationRead` | Updates `InAppNotification.isRead` | NO |
| `notifications.ts:559` | `markAllNotificationsRead` | `updateMany` on `InAppNotification` | NO |
| `notifications.ts:591` | `upsertNotificationPreference` | Upserts `NotificationPreference` | YES |
| `notification-handlers.ts:18` | `processPendingNotifications` | Updates `NotificationLog` status | NO |
| `notification-event-bus.ts:158` | `emitNotificationEvent` | Creates/batches `NotificationLog` | NO |
| `push.ts:29` | `sendPushToUser` | May update `PushSubscription.isActive` | NO |
| `push.ts:63` | `sendPushToApprovers` | May update `PushSubscription.isActive` | NO |

### CRITICAL findings — task sub-entities (all have `userId` param but no `logAction`)

| File | Function | Mutation |
|------|----------|----------|
| `task.ts:297` | `addSubTask` | Creates `SubTask` |
| `task.ts:311` | `toggleSubTask` | Updates `SubTask` completion |
| `task.ts:332` | `deleteSubTask` | Deletes `SubTask` |
| `task.ts:344` | `reorderSubTasks` | Updates `SubTask.order` (many) |
| `task.ts:357` | `addComment` | Creates `TaskComment` |
| `task.ts:368` | `deleteComment` | Deletes `TaskComment` |
| `task.ts:380` | `addDependency` | Creates `TaskDependency` |
| `task.ts:429` | `removeDependency` | Deletes `TaskDependency` |
| `task.ts:453` | `startTimer` | Creates `TaskTimeLog` |
| `task.ts:475` | `stopTimer` | Updates `TaskTimeLog` |

### Partially-logged files (at-risk, need per-function audit)

`subcontractor.ts`, `gate-pass.ts`, `quotation.ts`, `quality-control.ts`, `safety.ts`, `crm.ts`, `change-order.ts`, `boq.ts`, `equipment.ts`, `tenancy.ts`, `renovation.ts`, `standard-consumption.ts`, `supplier-invoice.ts`, `rate-analysis.ts`, `legal-docs.ts`, `built-unit.ts`, `supplier-payment.ts`, `procurement.ts` — all have more exported functions than `logAction` calls.

### Notable observations
- `notifications.ts` imports `logAction` but uses it only for `upsertNotificationTemplate`; `NotificationLog` writes are unlogged.
- `material-service.ts` imports `logAction` and uses it for `quickCreateMaterial`, but `autoFillHsnGst` does not.
- `tally.ts` imports `logAction` but never calls it.

---

## §2. Cascading Update Chains

### Chain 1 — PO Receive → Stock → GL → MAC
**Entry**: `receiveGoods()` in `procurement.ts:550`

| Link | Status | Notes |
|------|--------|-------|
| `receiveGoods` → `recordMovement(PURCHASE_RECEIPT)` | CONFIRMED | Inside `withStockTransaction` |
| `recordMovement` → `StockLocationItem` qty + MAC update | CONFIRMED | `computeMovingAverageCost` at `stock-ledger.ts:216` |
| `postPurchaseReceipt` (GL) | CONFIRMED | Inside same tx |
| `refreshMaterialCurrentCost` | CONFIRMED | Inside same tx |
| `logAction` | **DISCREPANCY (MINOR)** | Missing in `receiveGoods` |

**Verdict**: Financially intact. Audit-trail gap only.

### Chain 2 — Material Issue → Stock → GL → Project Cost
**Entry**: `issueMaterialsToProject()` in `issue.ts:56`

| Link | Status | Notes |
|------|--------|-------|
| `issueMaterialsToProject` → `recordMovement(ISSUE_TO_PROJECT)` | CONFIRMED | Inside `withStockTransaction` |
| `StockLocationItem.qty` decrease | CONFIRMED | MAC unchanged on OUT |
| `reallocateProjectCosts` | CONFIRMED | Inside same tx |
| `Project.costPerSqft` + `BuiltUnit.productionCost` updates | CONFIRMED | Inside same tx |
| `postMaterialIssue` (GL) | CONFIRMED | Inside same tx |
| `logAction` | CONFIRMED | Inside same tx |

**Direct-to-unit check**: When `MaterialIssue.builtUnitId` is set, `reallocateProjectCosts` correctly separates project-level (area-allocated) from unit-direct costs (`valuation.ts:236-249`, `314-316`). **CONFIRMED**.

**Verdict**: Fully intact.

### Chain 3 — Stock Transfer
**Entry**: `createTransfer()` in `transfer.ts:159`

**Important correction**: `createTransfer` only creates a DRAFT header. Stock movement happens in `dispatchTransfer()` and `completeTransfer()`.

| Link | Status | Notes |
|------|--------|-------|
| `createTransfer` → `recordTransfer` | **DISCREPANCY (MAJOR)** | `createTransfer` does not move stock; described chain is wrong |
| `completeTransfer` → `recordTransfer` | CONFIRMED | Inside `withStockTransaction` |
| `recordTransfer` → source OUT + dest IN at source MAC | CONFIRMED | `unitCost` for IN = `outResult.newMAC` |
| `StockLocationItem` qty updates | CONFIRMED | Inside same tx |
| `StockMovement` records | CONFIRMED | Inside same tx |

**Verdict**: Actual flow is correctly transactional but split across `dispatchTransfer`/`completeTransfer`. The AGENTS.md description of "transfer create → recordTransfer()" is misleading.

### Chain 4 — Sale + Payment
**Entry**: `sellAsset()` in `sale.ts:147` + `createMaterialSale()` in `material-sale.ts:65`

#### 4a. Asset sale
| Link | Status | Notes |
|------|--------|-------|
| `sellAsset` → `markAssetStatus` (SOLD/RESERVED) | CONFIRMED | Inside `withSerializableTransaction` |
| `postAssetSale` (GL revenue + COGS) | CONFIRMED | Inside same tx |
| `postPaymentReceived` (GL) | CONFIRMED | Inside same tx for immediate payment |
| `recordPayment` → `postPaymentReceived` | CONFIRMED | Inside `withSerializableTransaction` |

**CRITICAL semantic issue**: `recordPayment` posts `postPaymentReceived` (Dr Cash / Cr AR) for pre-completion payments, but `completeSale` expects pre-completion payments to be in **Customer Deposits** (`postDepositReceived`). If `recordPayment` is used for pre-completion installments, the books will be inconsistent when `completeSale` runs.

**Severity: CRITICAL** — GL routing mismatch causes books to diverge from sale lifecycle.

#### 4b. Scrap material sale
| Link | Status | Notes |
|------|--------|-------|
| `createMaterialSale` → `recordMovement(SALE)` | CONFIRMED | Inside `withStockTransaction` |
| `postMaterialSale` (GL incl. `COST_RECOVERY` credit) | CONFIRMED | Inside same tx |
| `reallocateProjectCosts` if `projectId` | CONFIRMED | Called inside same tx |

**MAJOR discrepancy**: `scrapSubtotal` is NOT subtracted from project total cost. `reallocateProjectCosts` only subtracts `ScrapGeneration` value (`valuation.ts:163-174`); `MaterialSale.scrapSubtotal` is never read. GL correctly credits `COST_RECOVERY`, but `Project.totalProjectCost` and `BuiltUnit.productionCost` will overstate cost for project-linked scrap sales.

**Severity: MAJOR** — GL and project cost allocation diverge.

### Chain 5 — Land Cost Component Recompute
**Entry**: `addLandCostComponent()` in `land-cost-component.ts:144`

| Link | Status | Notes |
|------|--------|-------|
| `addLandCostComponent` → `recomputeLandTotalCost` | CONFIRMED | Inside `withSerializableTransaction` |
| `postLandCostComponent` (GL delta) | CONFIRMED | Inside same tx |
| `LandPurchase.totalCost` update | CONFIRMED | Inside same tx |
| Parcel `acquisitionCost` pro-rata reprice | CONFIRMED | Inside same tx |
| `reallocateProjectCosts` if linked | CONFIRMED | Inside same tx |
| `logAction` | CONFIRMED | Inside same tx (when totalCost changes) |

**Verdict**: Fully intact.

---

## §3. Data-Flow Integrity

### 3a. Soft-Delete Filters (`deletedAt: null`)

**370 master-entity reads checked, 44 missing filters.**

#### CRITICAL — operations on archived master entities

| File | Line | Entity | Impact |
|------|------|--------|--------|
| `api/land-purchases/[id]/create-project/route.ts` | 35 | `landPurchase` | Can create project from soft-deleted land |
| `api/suppliers/[id]/route.ts` | 69 | `supplier` | DELETE guard doesn't filter deleted |
| `api/customers/[id]/route.ts` | 35 | `customer` | PATCH doesn't filter deleted |
| `api/customers/[id]/route.ts` | 68 | `customer` | DELETE doesn't filter deleted |
| `api/materials/route.ts` | 102,121,155 | `materialCategory` | Can create material under deleted category |
| `api/land-parcels/[id]/route.ts` | 72 | `landParcel` | DELETE doesn't filter deleted |
| `api/material-categories/route.ts` | 26 | `materialCategory` | Name-duplicate check ignores `deletedAt` |
| `api/requisitions/auto/route.ts` | 67 | `material` | Notifies for archived low-stock materials |
| `services/renovation.ts` | 65 | `builtUnit` | Renovation can attach to deleted unit |
| `services/renovation.ts` | 71 | `landParcel` | Renovation can attach to deleted parcel |
| `services/sale.ts` | 170 | `landParcel` | Sale can lock deleted parcel |
| `services/sale.ts` | 189,206 | `landPurchase` | Sale resolves deleted land purchase |
| `services/sale.ts` | 221 | `builtUnit` | Sale can lock deleted unit |
| `services/sale.ts` | 242 | `project` | Sale resolves deleted project |
| `services/land.ts` | 765,848,894,1091,1178 | `landPurchase` | Multiple reads ignore soft-delete |
| `services/partition.ts` | 393,473,482,555 | `landParcel` | Partition helpers ignore soft-delete |
| `services/partition.ts` | 242,430 | `landPurchase` | Notification/GL helpers ignore soft-delete |
| `services/built-unit.ts` | 241,314 | `builtUnit` | Unit status/detail lookups ignore soft-delete |

#### MAJOR / MINOR — additional missing filters
See full table in audit output. Notable: `api/approvals/route.ts:77` (project), `api/orbit/route.ts:240` (company parent), `api/companies/[id]/route.ts:24,126` (company, post-checked), `api/materials/[id]/last-purchase/route.ts:52` (material).

**Legitimate exceptions**: `api/materials/route.ts:129,206` — `material.findUnique({ where: { code } })` is deliberate archive-restore logic.

### 3b. Permission Gates on API Routes

**548 route handlers checked, 12 missing `requirePermission`.**

#### CRITICAL — mutation routes with no permission gate

| File | Method | Impact |
|------|--------|--------|
| `api/users/[id]/route.ts` | PATCH | Role/activation changes — any authenticated user can change roles |
| `api/requisitions/[id]/route.ts` | PATCH | Approve/reject/submit/convert — no `requisition.approve` gate |
| `api/purchase-orders/[id]/route.ts` | PATCH | Approve/order/cancel/receive — no `po.approve` gate |
| `api/approvals/batch/route.ts` | POST | Batch approval decisions — no permission gate |
| `api/uploads/route.ts` | POST | File upload — no permission gate |
| `api/uploads/route.ts` | DELETE | File delete — no permission gate |

#### MAJOR
| File | Method | Impact |
|------|--------|--------|
| `api/assistant/route.ts` | POST | Assistant action — no permission gate |
| `api/telephony/consent/accept/route.ts` | POST | Consent accept — no permission gate |

#### MINOR (self-service / role-checked inline)
`api/me/change-password/route.ts` (POST), `api/me/profile/route.ts` (PATCH), `api/feedback/route.ts` (POST), `api/feedback/[id]/route.ts` (PATCH)

### 3c. Prisma Singleton Cache

**File**: `packages/db/src/index.ts`

Pattern confirmed as described in AGENTS.md. `globalForPrisma` caches `PrismaClient` in `globalThis` with no invalidation mechanism. After `pnpm db:generate`, a full `pnpm dev` restart is required. **Severity: INFO** — not a bug, but a documented operational constraint.

---

## Ranked Discrepancies (all areas)

### CRITICAL (must fix)

1. **Sale payment GL routing mismatch** — `recordPayment` posts AR for pre-completion payments but `completeSale` expects Customer Deposits. Books diverge from sale lifecycle. (`sale.ts:971` vs `completeSale`)

2. **41 unlogged mutations** — including `reallocateProjectCosts`, `recordMovement`, `recordTransfer`, `softDelete`, `restoreEntity`. No audit trail for core financial/stock/master-data changes. (See §1 table)

3. **6 mutation API routes with no `requirePermission`** — `users/[id]` PATCH, `requisitions/[id]` PATCH, `purchase-orders/[id]` PATCH, `approvals/batch` POST, `uploads` POST/DELETE. Any authenticated user can perform these actions. (See §3b)

4. **28 missing `deletedAt: null` filters on master-entity reads** — allows operations on archived entities (sales locking deleted parcels/units, projects created from deleted land, materials created under deleted categories). (See §3a)

### MAJOR (should fix)

5. **Scrap sale cost recovery not reflected in project reallocation** — `MaterialSale.scrapSubtotal` not subtracted from `projectTotalCost()`. Unit `productionCost` overstates cost for project-linked scrap sales. (`valuation.ts:163-174`)

6. **Transfer chain description mismatch** — `createTransfer` does not move stock; actual movement is in `dispatchTransfer`/`completeTransfer`. Not a bug, but AGENTS.md description is misleading.

7. **4 additional missing `deletedAt` filters** (MAJOR severity) + **2 missing permission gates** (MAJOR severity). See §3a/§3b tables.

### MINOR

8. **Missing `logAction` in `receiveGoods`** — PO receive has no audit trail entry (financial links are intact).
9. **12 additional missing `deletedAt` filters** (MINOR severity) + **4 missing permission gates** (MINOR, self-service routes).
10. **Prisma singleton has no invalidation** — operational constraint, documented.

---

## Recommendations

### Immediate (CRITICAL fixes)
1. **Fix sale payment GL routing**: Either (a) make `recordPayment` post `postDepositReceived` for pre-completion payments, or (b) restrict `recordPayment` to completed sales only.
2. **Wire `logAction` into core mutations**: `reallocateProjectCosts`, `recordMovement`, `recordTransfer`, `refreshMaterialCurrentCost`, `softDelete`, `restoreEntity` first. Add `userId` param where missing.
3. **Add `requirePermission` gates** to the 6 CRITICAL mutation routes.
4. **Add `deletedAt: null` filters** to the 28 CRITICAL master-entity reads, especially in `sale.ts`, `partition.ts`, `land.ts`, `built-unit.ts`, `renovation.ts`.

### Short-term (MAJOR fixes)
5. **Incorporate `MaterialSale.scrapSubtotal`** into `projectTotalCost()` / `reallocateProjectCosts()`.
6. **Fix the 4 MAJOR `deletedAt` gaps** and **2 MAJOR permission gates**.
7. **Audit the 18 partially-logged service files** for additional unlogged mutations.

### Ongoing
8. **Add a lint/test rule**: any exported async function in `packages/services/src/` that calls Prisma `.create`/`.update`/`.delete` must also call `logAction`.
9. **Update AGENTS.md** to correct the transfer chain description (createTransfer → dispatchTransfer → completeTransfer, not createTransfer → recordTransfer).
10. **Consider a Prisma client invalidation mechanism** (schema hash check) to avoid stale-cache runtime errors.
