# T15 — Hierarchical RBAC (Admin → Sub-Admin → Sub-Sub-Admin)

> Label: `wayfinder:build` · Status: **open** · Claimed by: — · Blocked by: T10 (approvals/RBAC verification)

## Question

The brother's design specifies a multi-tier delegation hierarchy:
- **Admin**: Full system control & oversight
- **Sub-Admin**: Regional/Department Heads (inventory approvals, project-wide HR, comparative analysis)
- **Sub-Sub-Admin**: Site Managers / Field Supervisors (daily field activities, DPRs, material receipts, attendance)

The current app has 6 flat roles (OWNER, ADMIN, MANAGER, SUPERVISOR, SALES, ACCOUNTANT) with a
permission matrix. There's no hierarchical delegation — no concept of "Sub-Admin 1 manages regions
A,B" or "Sub-Sub-Admin reports to Sub-Admin 1".

## What exists

- 6 roles with a flat permission matrix in `lib/roles.ts`
- `RolePermission` table for fine-grained additive overrides
- `UserCompany` join for multi-company membership (role per membership)
- No hierarchical delegation, no reporting lines, no scope-by-region/department

## What needs to be built

### A. Reporting Hierarchy
- Add `reportsTo` / `managerId` to `User` or `UserCompany` (who does this user report to?)
- Add `scopeType` to roles: COMPANY (all), REGION (filtered by region), DEPARTMENT (filtered by dept), PROJECT (filtered by project)
- Add `scopeId` to `UserCompany` or a new `UserScope` table (which region/dept/project does this user manage?)

### B. Role Mapping
- **Admin** → OWNER/ADMIN (already exists, full access)
- **Sub-Admin** → MANAGER (already exists, but needs scope filtering — only sees their regions/departments)
- **Sub-Sub-Admin** → SUPERVISOR (already exists, but needs project-level scope + DPR/attendance permissions from T13)

### C. Scope-Filtered Queries
- All list APIs need to filter by user scope (e.g., a Sub-Admin only sees projects in their region)
- Nav items filtered by scope (a Sub-Sub-Admin only sees their assigned project)
- Approval queues filtered by scope

### D. Delegation UI
- Admin can assign Sub-Admins to regions/departments
- Sub-Admin can assign Sub-Sub-Admins to projects
- Org chart view (optional)

## Resolution

_(not started — depends on T10 RBAC verification + T13 HR module for DPR/attendance permissions)_
