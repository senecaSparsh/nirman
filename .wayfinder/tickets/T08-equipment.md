# T08 — Equipment tracking works end-to-end

> Label: `wayfinder:grilling` · Status: **open** · Blocked by: T01

## Question

Does the equipment lifecycle work end-to-end — create equipment → assign to location/project →
return → record maintenance → complete maintenance → retire → unretire — with depreciated value
computed correctly, assignments visible on the status board, and audit logs at each transition?

## Checklist

- [ ] `/equipment`: create a piece of equipment with cost + depreciation rate
- [ ] Assign to a project; verify assignment visible + status board updates
- [ ] Return from assignment; verify release
- [ ] Record maintenance (SCHEDULED/REPAIR/INSPECTION); complete it; verify state transitions
- [ ] Retire equipment; verify it's excluded from active lists but retained for audit
- [ ] Unretire; verify restoration
- [ ] `computeDepreciatedValue()` matches displayed value
- [ ] Audit log entries present for create/assign/return/maintenance/retire
- [ ] Log every defect; fix in priority order

## Resolution

_(filled on close)_
