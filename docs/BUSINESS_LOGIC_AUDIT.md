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

## Verification

- Typecheck: 0 errors
- Tests: 194/194 pass (16 test files)
- All fixes verified against the gauntlet rubric
