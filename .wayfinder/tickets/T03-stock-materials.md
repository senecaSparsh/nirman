# T03 — Stock, materials & transfers work end-to-end

> Label: `wayfinder:grilling` · Status: **open** · Blocked by: T01

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

_(filled on close)_
