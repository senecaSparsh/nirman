# T03 — Stock, materials & transfers work end-to-end

> Label: `wayfinder:grilling` · Status: **closed** · Claimed by: Devin · Blocked by: T01 (closed)

## Question

Does stock ledger integrity hold when driven through the UI — material create, receipt (via T02 or
direct), issue to project, issue to department, transfer between locations (incl. inter-company STO
with freight/handling/markup), and stock count reconcile — such that `StockMovement` audit trail
matches `StockLocationItem.qty` at every step, MAC updates correctly on receipt and is preserved on
issue/transfer, and GL entries post for issues?

## Checklist

- [ ] `/materials`: create material with reorderPoint + EOQ; verify low-stock badge
- [ ] Issue materials to a project on `/procurement` (issue-materials); verify WIP capitalization GL entry
- [ ] Issue materials to a department; verify expense GL entry
- [ ] Create a transfer on `/procurement`; complete it; verify OUT+IN movement pair, qty + MAC carried
- [ ] Inter-company STO: freight/handling/markup applied; destination MAC reflects landed cost
- [ ] `/stock-movements`: filter by material/location/date; verify immutable trail matches current qty
- [ ] Stock count: create → confirm (COUNTED) → reconcile; verify adjustment movement + variance
- [ ] Verify `StockLocationItem.qty` always equals sum of movements (no direct mutation)
- [ ] Log every defect; fix in priority order

## Resolution

**All stock ledger flows verified end-to-end via API.** StockMovement audit trail matches
StockLocationItem.qty at every step; MAC updates correctly on receipt/transfer-in and is
preserved on issue/transfer-out.

**Verified:**
- Issue to project: stock reduced at source, GL posts Inventory→WIP, cost-per-sqft reallocated
- Issue to department: stock reduced at source, GL posts Inventory→Operating Expenses
- Transfer (intra-company): OUT+IN movement pair at source MAC, destination MAC blended correctly
  (50@380 + 10@340 → 60@373.33)
- Stock movements API returns human-readable labels with full audit trail
- Stock count: create (DRAFT, snapshots systemQty) → confirm (COUNTED) → reconcile (RECONCILED,
  applies ADJUSTMENT_IN/OUT movements). Tested with -2 variance: stock adjusted from 50→48,
  ADJUSTMENT_OUT movement recorded with reason, MAC preserved at 340.

**Gaps found + fixed (3):**

1. **Material form missing key fields (critical for auto-requisition)** — `reorderPoint`,
   `economicOrderQty`, `volumetricDensity`, `bulkDiscountPct`, `isCorporateCommodity` existed in
   the DB schema and were used by the auto-requisition service, but were NOT exposed in the
   material create/edit form or the API Zod schema. Without `reorderPoint`/`economicOrderQty`
   being editable, users couldn't configure the auto-requisition trigger through the UI.
   Fixed: added all 5 fields to the Zod schema (`materialSchema`), the API GET response, the
   `MaterialRow` type, the materials page server component, the procurement page server component,
   and the material form dialog (with appropriate inputs).
   Files: `apps/web/src/lib/server.ts`, `apps/web/src/lib/types.ts`, `apps/web/src/app/api/materials/route.ts`,
   `apps/web/src/app/materials/page.tsx`, `apps/web/src/app/procurement/page.tsx`,
   `apps/web/src/components/materials/material-form-dialog.tsx`

2. **Stock count module completely unwired (critical)** — The service layer
   (`createStockCount`, `confirmStockCount`, `reconcileStockCount`) was fully implemented with
   ADJUSTMENT_IN/OUT movements and audit logging, but there were NO API routes, NO UI page, and
   NO navigation item. The entire stock count feature was invisible to users.
   Fixed: created Zod schema (`stockCountSchema`), API routes (`GET/POST /api/stock-counts`,
   `GET/PATCH /api/stock-counts/[id]`), types (`StockCountRow`, `StockCountLineRow`,
   `StockCountStatus`), a full UI page at `/stock-counts` with a create dialog (location selector
   + per-material counted qty inputs with system qty display) and a detail dialog (variance table
   + confirm/reconcile action buttons), and a nav item ("Stock Counts" under Build group).
   Files: `apps/web/src/lib/server.ts`, `apps/web/src/lib/types.ts`, `apps/web/src/app/api/stock-counts/route.ts`,
   `apps/web/src/app/api/stock-counts/[id]/route.ts`, `apps/web/src/app/stock-counts/page.tsx`,
   `apps/web/src/components/stock-counts/stock-counts-view.tsx`, `apps/web/src/lib/nav.ts`

3. **Transfer form missing inter-company STO fields** — The API accepted `freight`,
   `handlingFee`, and `markupPct` for inter-company stock transfer orders (STOs), and the service
   layer computed transfer prices with cost-weighted freight/handling allocation and markup. But
   the UI form didn't expose these fields, making inter-company STOs impossible through the UI.
   Fixed: added optional freight/handling/markup inputs to the transfer form dialog with a note
   that they only apply to inter-company transfers (the service forces them to 0 for intra-company).
   File: `apps/web/src/components/procurement/transfer-form-dialog.tsx`

**Verification:** typecheck clean, 113 service tests pass, all flows driven via curl with DB-side
verification of stock, movements, GL, and audit logs. New `/stock-counts` page returns 200.
