# T11 — Settings & multi-company work end-to-end

> Label: `wayfinder:grilling` · Status: **open** · Blocked by: T01

## Question

Does the settings + multi-company system work end-to-end — create/edit company, add/switch
members per company with per-membership roles, switch active company context (data scoping
changes), manage stock locations, users, subcontractors, employees — so that a user belonging to
two companies sees only the active company's data after switching, and role per membership is
enforced?

## Checklist

- [ ] `/settings`: edit current company (name, LCI config); verify persistence
- [ ] Create a second company; add the current user as a member with a different role
- [ ] Use company switcher; verify active company context changes + data re-scopes
- [ ] Verify a user with MANAGER role in company A but SALES in company B gets the right
      permissions after switching
- [ ] Manage stock locations: create warehouse + project site + department stock room; verify CRUD
- [ ] Manage users: create a user; verify CRUD + role assignment
- [ ] Manage subcontractors + employees; verify CRUD
- [ ] Verify soft delete on each master entity (archive, not hard delete; excluded from lists)
- [ ] Log every defect; fix in priority order

## Resolution

_(filled on close)_
