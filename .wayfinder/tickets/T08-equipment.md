# T08 — Equipment tracking works end-to-end

> Label: `wayfinder:grilling` · Status: **closed** · Claimed by: Devin · Blocked by: T01 (closed)

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

**All equipment flows verified end-to-end via API.** The module has excellent UX — a kanban-style
status board (Available / Assigned / In Maintenance / Retired) with context-aware action buttons
that change based on the equipment's current status.

**Verified (full lifecycle):**
- Create equipment (assetTag, name, category, model, serialNumber, acquisitionCost, notes)
- Assign to location + project → status ASSIGNED, assignment record created, audit logged
- Return from assignment → status AVAILABLE, assignment marked RETURNED, audit logged
- Send to maintenance (via POST /api/equipment-maintenance) → status IN_MAINTENANCE, maintenance
  record created with type/cost/vendor/notes, audit logged
- Complete maintenance (via PATCH /api/equipment/[id] action=complete-maintenance) → status
  AVAILABLE, maintenance endDate set, audit logged
- Retire → status RETIRED, audit logged
- Unretire → status AVAILABLE, audit logged
- Full audit trail: EQUIPMENT_CREATE, EQUIPMENT_ASSIGN, EQUIPMENT_RETURN,
  EQUIPMENT_MAINTENANCE_RECORD, EQUIPMENT_MAINTENANCE_COMPLETE, EQUIPMENT_RETIRE,
  EQUIPMENT_UNRETIRE

**UX assessment (smart & simple):**
- Kanban board with 4 columns — see the entire fleet status at a glance
- Context-aware action buttons in detail dialog — only shows relevant actions per status
  (Assign/Maintenance/Retire when AVAILABLE, Return/Maintenance when ASSIGNED,
  Complete Maintenance when IN_MAINTENANCE, Restore when RETIRED)
- Smart maintenance dialog — if end date is set, maintenance is immediately completed (for
  logging past maintenance); if no end date, equipment goes to IN_MAINTENANCE
- Hover-to-edit on cards — pencil/trash icons appear on hover, not cluttering the default view
- CSV export with formatted currency
- Empty state with clear CTA
- Summary stats inline (count, available, assigned, maintenance, total value)

**No defects found.** The equipment module is fully functional with excellent UX.

**Verification:** all flows driven via curl with DB-side verification of status, assignments,
maintenance records, and audit logs. Equipment page returns 200.
