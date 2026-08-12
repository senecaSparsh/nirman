# Business Logic & Technical Audit Notes

## Audit Progress Bookmark
- Last completed section: All sections audited
- Total sections: 4 (Stock+Procurement, Sales+GL+Land, Equipment+DPR+Tasks, API Routes)
- Sections audited: 4/4
- Audit type: Business logic gaps + technical issues
- Method: wayfinder (read spec) → gauntlet (verify against code) → gap detection

## Audit Scope
Used 4 parallel gauntlet subagents to verify ~50 claims from AGENTS.md against the actual codebase.
Each claim went through a read→verify→re-read→verify loop.

---

## Issues Found and Fixed

### CRITICAL (3) — Cross-company data leaks via missing company scoping

1. **POST /api/issue-materials** — No `getCompany()` call. Users could issue materials from any company's location if they knew the ID. The service layer (`issueMaterialsToProject`) validated project/location existence but NOT company ownership.
   - **Fix**: Added `getCompany()` + pre-validation that the source location belongs to the user's company.

2. **POST /api/equipment-assignments** — No `getCompany()` call. Users could assign equipment from any company.
   - **Fix**: Added `getCompany()` + pre-validation that the equipment belongs to the user's company.

3. **POST /api/equipment-maintenance** — No `getCompany()` call. Users could record maintenance for any company's equipment.
   - **Fix**: Added `getCompany()` + pre-validation that the equipment belongs to the user's company.

4. **PATCH /api/equipment-assignments/[id]** — No `getCompany()` call for the return action.
   - **Fix**: Added `getCompany()` + pre-validation that the assignment belongs to the user's company.

### MAJOR (3) — Business logic gaps

5. **issueMaterialsToProject() — builtUnitId not validated** — The `builtUnitId` parameter was accepted but never validated to belong to the project being issued to. This allowed cross-project cost allocation (issue to Project A but attribute cost to Project B's unit).
   - **Fix**: Added validation that `builtUnitId` belongs to `projectId` before processing.

6. **material-sale.ts — not using Serializable isolation** — `createMaterialSale()` and `cancelMaterialSale()` used `prisma.$transaction()` without specifying Serializable isolation level, while all other stock-modifying services use `withStockTransaction()` (which sets Serializable). This could cause race conditions on concurrent material sales.
   - **Fix**: Replaced `prisma.$transaction()` with `withStockTransaction()`.

7. **retireEquipment() — doesn't check active assignments** — Equipment could be retired while still assigned to a project/site, leaving the assignment record orphaned in ACTIVE state.
   - **Fix**: Auto-returns any active assignment before retiring the equipment.

### MEDIUM (2) — Validation gaps

8. **rejectDpr() — doesn't validate reason is non-empty** — The `reason` parameter was stored without checking for empty/whitespace strings, making the rejection audit trail meaningless.
   - **Fix**: Added `if (!reason?.trim()) throw new HrError("Rejection reason is required", 400)`.

9. **Task dependency cycle detection — only checked direct reverse edge** — `addDependency()` only checked if the exact reverse edge existed (A→B when adding B→A), but didn't detect transitive cycles (A→B→C→A would be allowed).
   - **Fix**: Replaced with DFS-based transitive cycle detection that follows the full dependency chain.

---

## Issues Found but NOT Fixed (noted for future)

### LOW — Incomplete notification event bus coverage
The notification event bus (`emitNotificationEvent`) is wired for 3 services (procurement, requisition, HR/DPR) but not for 7 others (issue, transfer, material-sale, equipment, stock-count, supplier-return, scrap, task). The old trigger functions (`notifyLowStock`, `notifyTaskAssignment`, `notifyQuoteApproval`) are dead code — superseded by the event bus pattern but not yet wired everywhere.

### LOW — MAC unit test count
AGENTS.md claims "8 unit tests" for `computeMovingAverageCost` but only 5 exist. Missing: recvQty=0 edge case, negative cost edge case, precision test.

### LOW — Can't reject approved requisitions
`requisition.ts` blocks rejecting an already-approved requisition. This may be intentional business logic but should be documented.

### INFO — postExpense() called from API route, not service
The `postExpense()` GL posting function is called from the API route handler (`/api/expenses/route.ts`) rather than from a dedicated expense service file. This is an architectural inconsistency (all other GL postings happen in service files) but not a functional gap.

### INFO — 87% of API routes have all security checks
70+ routes have proper permission checks, company scoping, zod validation, and error handling. The 4 routes fixed above were the exceptions.

---

## False Positives (subagent errors corrected)

1. **"postExpense() never called"** — FALSE. It IS called from `/api/expenses/route.ts` line 67, just not from a service file.
2. **"Notification triggers are dead code"** — PARTIALLY FALSE. The old `notifyLowStock`/`notifyTaskAssignment`/`notifyQuoteApproval` functions ARE dead code, but they've been superseded by `emitNotificationEvent()` which IS called from procurement, requisition, and HR services.
3. **"recordMovement doesn't guarantee Serializable"** — MISLEADING. `recordMovement` takes a `tx` parameter and is always called from within `withStockTransaction()` (which sets Serializable) by all callers. The function itself doesn't set the isolation level, but it's never called outside a Serializable transaction.

---

## Extended Workflow Testing (25 workflows, 90+ test cases)

### Issues Found and Fixed

#### MAJOR — Task dependency cycle detection followed wrong edge direction
- **File**: `packages/services/src/task.ts` (`addDependency`)
- **Bug**: The DFS followed `blockedById` edges (what blocks me) instead of `blockerId` edges (what I block). This allowed cycles (A→B→C→A) because the traversal couldn't detect them — it was looking in the wrong direction.
- **Fix**: Reversed the edge direction in the DFS — now follows `blockerId` edges (what the current task blocks) to see if we reach the proposed blocker.

#### MAJOR — Task dependency enforcement used wrong Prisma relation
- **File**: `packages/services/src/task.ts` (`updateTaskStatus`, `getTaskDetail`)
- **Bug**: The Prisma relation `task.blockedBy` (confusingly named) actually contains the tasks THAT THIS TASK blocks (not the tasks blocking it). The correct relation is `task.blocking`. This meant:
  - Blocked tasks could be started (blockers not checked)
  - Unblocked tasks were incorrectly blocked (showed wrong blocker names)
- **Fix**: Swapped `blockedBy` → `blocking` in both `updateTaskStatus` and `getTaskDetail`.

#### MAJOR — Task status state machine allowed reopening terminal states
- **File**: `packages/services/src/task.ts` (`updateTaskStatus`)
- **Bug**: No terminal-state check — a COMPLETED task could be set back to IN_PROGRESS or PENDING. A CANCELLED task could be reactivated.
- **Fix**: Added terminal state guards — COMPLETED and CANCELLED are now terminal (throw 409 on any status change attempt).

#### MAJOR — PO creation bypassed comparative quote gate
- **File**: `apps/web/src/app/api/purchase-orders/route.ts`
- **Bug**: The POST handler silently accepted `requisitionId` in the body but passed it to `createPurchaseOrder()` which ignores it. This allowed creating a PO from a requisition with fewer than `minQuotesRequired` quotes, completely bypassing the quote engine.
- **Fix**: Reject `requisitionId` in POST /api/purchase-orders. Requisition-to-PO conversion must go through PATCH /api/requisitions/[id] with action:"convert" (which enforces the quote gate via `isQuoteGateSatisfied()`).

#### MEDIUM — Concurrent stock operations returned raw Prisma errors
- **File**: `packages/services/src/stock-ledger.ts` (`withStockTransaction`)
- **Bug**: Serializable isolation causes write conflicts on concurrent stock modifications. The raw Prisma error ("Transaction failed due to a write conflict") was passed through to the user.
- **Fix**: Added retry logic (3 attempts with exponential backoff: 50ms, 100ms, 200ms) for write conflicts/deadlocks. Returns clean 409 error on persistent conflicts. Verified: 3 concurrent issues all succeed with retries.

#### MEDIUM — recordPayment() accepted payments on completed sales
- **File**: `packages/services/src/sale.ts` (`recordPayment`)
- **Bug**: Only checked for CANCELLED status, not COMPLETED saleStage. Allowed payment attempts on completed sales (which would fail with confusing "Overpayment" error).
- **Fix**: Added `saleStage === "COMPLETED"` check.

### Workflows Tested (all pass)

| # | Workflow | Tests | Status |
|---|----------|-------|--------|
| 1 | Procurement (requisition → PO → receive) | 8 | ✅ |
| 2 | Stock (issue → transfer → stock count) | 6 | ✅ |
| 3 | Sales (create → payment → complete → GL) | 6 | ✅ |
| 4 | DPR (submit → sub-admin → admin → reject → resubmit) | 5 | ✅ |
| 5 | Equipment (create → assign → return → maintenance → retire) | 7 | ✅ |
| 6 | Land (purchase → partition → sell) | 5 | ✅ |
| 7 | Finance (expense → GL → trial balance) | 4 | ✅ |
| 8 | Supplier returns (create → submit → complete) | 5 | ✅ |
| 9 | Scrap + material sale (cost recovery) | 5 | ✅ |
| 10 | Edge cases (invalid IDs, concurrent ops, state machine) | 14 | ✅ |
| 11 | Tasks (create → assign → dependencies → cycles) | 11 | ✅ |
| 12 | Comparative quote engine (upload → select → waive → convert) | 7 | ✅ |
| 13 | Auto-requisition (reorder point trigger) | 1 | ✅ |
| 14 | Direct purchase (bypass PO) | 1 | ✅ |
| 15 | Supplier payments + GL | 1 | ✅ |
| 16 | BOQ + RA bills | 2 | ✅ |
| 17 | GPS-tagged attendance (bulk) | 2 | ✅ |
| 18 | Portal listings (create → sync → delist) | 3 | ✅ |
| 19 | Standard consumption benchmarks | 2 | ✅ |
| 20 | DPR variance analysis | 1 | ✅ |
| 21 | Project costs (add → delete → GL) | 2 | ✅ |
| 22 | Built unit lifecycle (state machine) | 7 | ✅ |
| 23 | Tally sync (push batch) | 1 | ✅ |
| 24 | Audit log | 1 | ✅ |
| 25 | Notifications (test send) | 1 | ✅ |

---

## Verification

- Typecheck: 0 errors
- Tests: 194/194 pass (16 test files)
- All fixes verified against the gauntlet rubric
- GL trial balance verified balanced after every workflow
- Stock quantities verified exact after every operation
- State machines verified (PO, requisition, DPR, equipment, task, built unit, sale)
- Concurrent operations verified (3 parallel stock issues with retry logic)
