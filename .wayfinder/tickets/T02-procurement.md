# T02 — Procurement module works end-to-end

> Label: `wayfinder:grilling` · Status: **open** · Blocked by: T01

## Question

Does the full procurement lifecycle work when driven through the UI — requisition (manual +
auto-generated) → submit → approve → convert to PO → approve PO → order → receive goods → stock
appears at the right location with correct MAC — with correct GL entries and audit logs at each
step, and correct permission gating per role?

## Checklist

- [ ] Create a material requisition manually on `/requisitions`; verify DRAFT state
- [ ] Use "Auto-generate" button; verify a DRAFT requisition appears for low-stock materials
- [ ] Submit requisition; verify LCI routing decision (COMPANY vs PROJECT) is cached + visible
- [ ] Approve as a user with `requisition.approve`; reject a second one; verify state guards
- [ ] Convert approved requisition to PO; verify scope matches routing decision
- [ ] On `/procurement`, approve PO (`po.approve`), mark ordered, then receive goods
- [ ] After receipt: stock qty + MAC correct at destination location; GL receipt entry posted;
      audit log entries present for create/submit/approve/convert + PO create/approve/order/receive
- [ ] Verify a non-approver gets 403 on approve actions (both requisition + PO)
- [ ] Log every defect found; fix in priority order

## Resolution

_(filled on close)_
