# T10 — Approvals queue & RBAC enforcement work end-to-end

> Label: `wayfinder:grilling` · Status: **open** · Blocked by: T01

## Question

Does the approval workflow + RBAC matrix work in practice — `/approvals` shows the right queue
(DRAFT POs + SUBMITTED requisitions) for approvers, approve/reject transitions work with correct
permissions, and across all 6 roles (OWNER/ADMIN/MANAGER/SUPERVISOR/SALES/ACCOUNTANT) each sees the
correct nav items, gets 403 on actions they lack permission for, and `RolePermission` overrides
additively grant access — so the permission model is verified, not just defined?

## Checklist

- [ ] `/approvals`: with an approver, verify queue shows DRAFT POs + SUBMITTED requisitions
- [ ] Approve a PO + a requisition; verify state transitions + `approvedById`/`approvedAt` set
- [ ] Reject a requisition; verify state + audit log
- [ ] As a non-approver, verify `/approvals` is empty/hidden + approve API returns 403
- [ ] For each of the 6 roles: sign in, verify nav items match `roles` array in `lib/nav.ts`
- [ ] Pick 3 representative permission-gated actions (e.g. `sale.create`, `stock.transfer`,
      `expense.create`); verify allowed roles succeed + disallowed roles get 403
- [ ] Add a `RolePermission` override granting a normally-disallowed role a permission; verify
      additive grant works
- [ ] Verify `usePermissions()` hook on a client view reflects server-side `hasPermission()`
- [ ] Log every defect; fix in priority order

## Resolution

_(filled on close)_
