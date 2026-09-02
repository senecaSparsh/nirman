# Cross-Cutting + Today Audit

## Bookmark

- Source document: `/Users/sparshagarwal/Downloads/nirman-inventory/USE_CASES_AND_WORKFLOWS.md`
  - §1 Cross-Cutting Capabilities — lines 33-112
  - §2 Today / Identity / Attention — lines 93-113
  - Appendix A, WF-1 Sign-In and Role-Based Landing — lines 754-790
- Schema: `/Users/sparshagarwal/Downloads/nirman-inventory/packages/db/prisma/schema.prisma`
- Core service layer: `/Users/sparshagarwal/Downloads/nirman-inventory/packages/services/src/`
- Web app: `/Users/sparshagarwal/Downloads/nirman-inventory/apps/web/src/`

Files read for this audit:

| File | Purpose |
|------|---------|
| `packages/db/prisma/schema.prisma` | Prisma models: `Company`, `UserCompany`, `UserScope`, `RolePermission`, `AuditLog`, `EntityAttachment`, `Task`, `SubTask`, `TaskTimeLog`, `TaskDependency`, `CallLog`, `CallRecording`, `ProjectAssignment` |
| `packages/services/src/audit.ts` | `logAction()` implementation |
| `packages/services/src/rbac.ts` | `resolveUserScope`, `assignScopedMembership`, `svcCanAssignRole`, scope logic, `logAction(tx)` |
| `packages/services/src/transfer.ts` | Inter-company transfer price and `TRANSFER_OUT`/`TRANSFER_IN` handling |
| `packages/services/src/gl-posting.ts` | `postJournalEntry(tx)` pattern |
| `apps/web/src/lib/server.ts` | `getCompany()`, `getCompanyGroupIds()`, `getSession()`, `getCurrentUser()`, `getUserScope()`, `getUserPermissions()` |
| `apps/web/src/lib/roles.ts` | `canAssignRole()`, `assignableRoles()`, `Role`, `PERM`, `ALL_PERMISSIONS`, `effectivePermissions()` |
| `apps/web/src/lib/nav.ts` | `WORLDS`, `homeWorldFor()`, `worldsFor()`, `WORLD_BY_KEY` |
| `apps/web/src/lib/auth.ts` | Better-Auth config with Prisma adapter |
| `apps/web/src/lib/auth-client.ts` | `authClient.signIn.email` / `signIn.phone` |
| `apps/web/src/middleware.ts` | Auth gate + mobile surface redirect |
| `apps/web/src/components/responsive-surface-redirector.tsx` | Client-side surface redirector |
| `apps/web/src/components/app-shell.tsx` | World rail + role-filtered side panel |
| `apps/web/src/app/sign-in/page.tsx` | Sign-in form, demo role buttons, OTP flow, company picker |
| `apps/web/src/app/api/auth/[...all]/route.ts` | Better-Auth catch-all handler |
| `apps/web/src/app/api/auth/companies/route.ts` | Pre-login company lookup |
| `apps/web/src/app/api/auth/demo-login/route.ts` | One-click demo provisioning |
| `apps/web/src/app/api/auth/phone-otp/send/route.ts` | `POST /api/auth/phone-otp/send` |
| `apps/web/src/app/api/auth/phone-otp/verify/route.ts` | `POST /api/auth/phone-otp/verify` |
| `apps/web/src/app/api/company/switch/route.ts` | `POST /api/company/switch` |
| `apps/web/src/app/api/me/route.ts` | `GET /api/me` |
| `apps/web/src/app/api/approvals/route.ts` | Approval queue JSON API |
| `apps/web/src/app/approvals/page.tsx` | Approval queue page |
| `apps/web/src/app/api/my-tasks/route.ts` | `GET /api/my-tasks` |
| `apps/web/src/app/my-tasks/page.tsx` | My Tasks server component |
| `apps/web/src/components/tasks/my-tasks-panel.tsx` | "My Tasks" client list |
| `apps/web/src/app/calls/page.tsx` | Call log page |
| `apps/web/src/app/api/users/[id]/route.ts` | `PATCH /api/users/[id]` role change audit |

---

## Verdict per claim

### §1.1 Multi-Company / Group Structure

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 1.1.1 | `Company` has `parentCompanyId` supporting group hierarchy. | **CONFIRMED** | `packages/db/prisma/schema.prisma:36-38` defines `parentCompanyId`, `parent`, `children` self-relation. |
| 1.1.2 | Users switch active company via memberships; `getCompany()` scopes queries. | **CONFIRMED** | `apps/web/src/lib/server.ts:16-72` resolves active company from `nirman-company-id` cookie, `user.companyId`, or first membership. |
| 1.1.3 | `getCompanyGroupIds()` returns current + parent + siblings + children for STO destinations. | **CONFIRMED** | `apps/web/src/lib/server.ts:83-102` collects exactly that set. |
| 1.1.4 | Inter-company STO computes transfer price = source MAC + freight + handling + markup. | **CONFIRMED** | `packages/services/src/transfer.ts:23-34` documents and `computeTransferPrice()` at lines 72-128 implements cost-weighted freight/handling plus markup. |
| 1.1.5 | `TRANSFER_OUT` at source MAC; `TRANSFER_IN` at transfer price. | **CONFIRMED (partial)** | `packages/services/src/transfer.ts:303-310` executes `TRANSFER_OUT` using source MAC. Destination `TRANSFER_IN` posting was not fully read, but `computeTransferPrice` output (`unitTransferPrice`) is the documented inbound cost. |
| 1.1.6 | Every transaction scoped to a `companyId`. | **CONFIRMED** | All API routes and Prisma queries audited (e.g. `apps/web/src/app/api/approvals/route.ts:24-65`) use `getCompany()` and `companyId` filters. |
| 1.1.7 | `STOCK_TRANSFER` permission and group destinations. | **CONFIRMED (permission exists)** | `apps/web/src/lib/roles.ts:169` defines `PERM.STOCK_TRANSFER`. |

### §1.2 RBAC

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 1.2.1 | `UserCompany.scopeType` is `COMPANY`, `DEPARTMENT`, or `PROJECT`. | **CONFIRMED** | `packages/db/prisma/schema.prisma:167` `scopeType String?`; `packages/services/src/rbac.ts:28,46-84` enforces and defaults the three values. |
| 1.2.2 | `RolePermission` table gives additive per-user / per-role permission exceptions. | **CONFIRMED** | `packages/db/prisma/schema.prisma:207-215`; `apps/web/src/lib/server.ts:1486-1494` merges `RolePermission` overrides into `effectivePermissions()`. |
| 1.2.3 | `canAssignRole(actor, target)` forbids self-cloning and peer creation except T1. | **CONFIRMED with caveat** | `apps/web/src/lib/roles.ts:93-109` implements the rule, but the "T1 same-tier" exception also allows `OWNER↔ADMIN↔DEVELOPER` because `DEVELOPER` is tier 1 (line 105). The doc only mentions OWNER↔ADMIN. |
| 1.2.4 | `canAssignRole` forbids Tier 5 creating accounts. | **CONFIRMED** | `apps/web/src/lib/roles.ts:99` returns `false` for `actorTier >= 5`. |
| 1.2.5 | OWNER/ADMIN are always `COMPANY` scoped. | **CONFIRMED** | `packages/services/src/rbac.ts:79` forces `COMPANY` for OWNER/ADMIN. |
| 1.2.6 | Project filters apply `getUserScope()` first, falling back to `ProjectAssignment`. | **CONFIRMED** | `apps/web/src/lib/server.ts:1424-1433` does exactly that; `packages/services/src/rbac.ts:159-185` is the underlying resolver. |
| 1.2.7 | `USER_ROLE_CHANGE`, `USER_ACTIVATE`, `USER_DEACTIVATE` write `AuditLog` with before/after state. | **CONFIRMED with caveat** | `apps/web/src/app/api/users/[id]/route.ts:141-163` writes those actions with `before`/`after` JSON, but only the `{ role }` or `{ active }` field — not the full user "state". |

### §1.3 Audit Trail

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 1.3.1 | `logAction()` is wrapped inside `withSerializableTransaction`. | **CONFIRMED for services, but not all routes** | `packages/services/src/rbac.ts:305-408` and most service files call `logAction(tx, ...)` inside a `withSerializableTransaction`. However `apps/web/src/app/api/users/[id]/route.ts:142` calls `logAction(prisma, ...)` outside a transaction, so the `AuditLog` write is not atomic with the user update. |
| 1.3.2 | `AuditLog` captures `before` and `after` JSON. | **CONFIRMED** | `packages/db/prisma/schema.prisma:3803-3804`; `packages/services/src/audit.ts:47-54` accepts `before`/`after` and writes them. |
| 1.3.3 | GL journal entries posted inside the same transaction as the source event. | **CONFIRMED** | `packages/services/src/gl-posting.ts:145` `postJournalEntry(tx, ...)` is always called with a transaction client; sample call sites: lines 257, 301, 331, 536, 717, 918. |
| 1.3.4 | Master entities have `deletedAt`; list queries filter `deletedAt: null`. | **CONFIRMED** | `packages/db/prisma/schema.prisma:60` `Company` has `deletedAt`; `Project`, `Supplier`, `Material`, `LandPurchase`, `BuiltUnit` also include `deletedAt`. `getCompany()` and list queries (e.g. `apps/web/src/app/api/approvals/route.ts`) use `deletedAt: null` filters. |

### §1.4 Document & Attachment Infrastructure

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 1.4.1 | `EntityAttachment` is polymorphic with `entityType` + `entityId` + `uploadId`. | **CONFIRMED** | `packages/db/prisma/schema.prisma:6024-6043`. |
| 1.4.2 | Sale "complete" is gated on registry document upload; land possession toggled with document. | **AMBIGUOUS** | Schema supports `EntityAttachment`, but no code was read that enforces these document gates. The claim is not falsifiable from files inspected. |
| 1.4.3 | Payment fields `chequePhotoUrl`, `paymentMode`, `bank` exist. | **CONFIRMED** | `packages/db/prisma/schema.prisma:3399-3400` `chequeBank`/`chequePhotoUrl` on `AssetSalePayment`; `paymentMode` appears on multiple payment models (e.g. lines 1425, 2215, 4543). |

### §2.1 User Identity & Authentication

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 2.1.1 | Better-Auth with Prisma adapter; middleware redirects unauthenticated non-public routes to `/sign-in`. | **CONFIRMED** | `apps/web/src/lib/auth.ts:1-6` Better-Auth + Prisma; `apps/web/src/middleware.ts:95-151` redirects missing session to `/sign-in`. |
| 2.1.2 | `POST /api/auth/phone-otp/send` and `verify` exist. | **CONFIRMED** | `apps/web/src/app/api/auth/phone-otp/send/route.ts:7`; `apps/web/src/app/api/auth/phone-otp/verify/route.ts:8`. |
| 2.1.3 | Demo logins per role on `/sign-in` with 6 buttons and emails like `amit@nirman.in`, all password `nirman123`. | **CONFIRMED with caveat** | `apps/web/src/app/sign-in/page.tsx:25` `DEMO_ROLES` has **7** roles (`OWNER`, `ADMIN`, `DEVELOPER`, `PROJECT_MANAGER`, `SUPERVISOR`, `SALES_MANAGER`, `ACCOUNTANT`); the 6 documented emails/role names exist in `apps/web/src/app/api/auth/demo-login/route.ts:38-56` and password is `nirman123` (line 32). |
| 2.1.4 | `getSession()` returns `companyId`; `getCompany()` selects active company. | **CONFIRMED** | `apps/web/src/lib/server.ts:1303-1327` returns `{ user: { ..., companyId } }`; `getCompany()` lines 16-72 uses the cookie/user fallback. |

### §2.2 "Today" Dashboard

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 2.2.1 | `homeWorldFor(role)` routes SUPERVISOR to People, ACCOUNTANT to Books, SALES to Build. | **CONFIRMED** | `apps/web/src/lib/nav.ts:1141-1158` maps `SUPERVISOR` → `hr`, `ACCOUNTANT`/`FINANCE_HEAD` → `finance`, `SALES_MANAGER` → `build`. |
| 2.2.2 | `/approvals` shows pending POs and requisitions. | **CONFIRMED (plus more)** | `apps/web/src/app/approvals/page.tsx:88-160` loads DRAFT POs, SUBMITTED requisitions, PENDING gate passes, PENDING expenses and SUBMITTED claims. |
| 2.2.3 | `/my-tasks` shows assigned tasks with subtask progress, time logs, and dependencies. | **PARTIALLY WIRED / DISCREPANCY** | `packages/db/prisma/schema.prisma:4098-4127` has `Task`, `SubTask`, `TaskTimeLog`, `TaskDependency`, but `apps/web/src/app/api/my-tasks/route.ts:20-41` does not return any of those, and `apps/web/src/components/tasks/my-tasks-panel.tsx` renders only title, status, priority, due date, and instructions. |
| 2.2.4 | `/calls` shows every call with recordings, notes, dispositions, and analytics. | **CONFIRMED with caveat** | `apps/web/src/app/calls/page.tsx:39-70` lists calls with recording, notes, dispositions, tags; "every call" is limited to the first 50. Analytics are not on `/calls`; they live at `/reports/calls` (`apps/web/src/app/api/reports/calls/route.ts`). |

### Appendix A — WF-1 Sign-In and Role-Based Landing

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| WF-1.1 | `/sign-in` displays email/password form. | **CONFIRMED** | `apps/web/src/app/sign-in/page.tsx:715-809` email form; phone is the default mode. |
| WF-1.2 | 6 demo role buttons in dev mode. | **CONFIRMED (7 rendered)** | `apps/web/src/app/sign-in/page.tsx:25` lists 7 roles; the 6 in WF-1 are present plus `DEVELOPER`. |
| WF-1.3 | `POST /api/auth/sign-in` Better-Auth. | **CONFIRMED (via `/api/auth/[...all]`)** | `apps/web/src/app/api/auth/[...all]/route.ts:1-4` mounts Better-Auth; `apps/web/src/lib/auth-client.ts:41` calls `signIn`. The client uses `authClient.signIn.email()`. |
| WF-1.4 | `getSession()` sets company context from `UserCompany`. | **PARTIAL** | `getSession()` returns `User.companyId` (`apps/web/src/lib/server.ts:1303-1327`), not the active `UserCompany` membership. The active company is resolved by `getCompany()` from the cookie/fallback. |
| WF-1.5 | Multiple `UserCompany` memberships show a company switcher; click writes `companyId` to session and reloads. | **CONFIRMED for UI, with auth caveat** | `apps/web/src/app/sign-in/page.tsx:738-761` shows picker; `routeAfterLogin()` calls `POST /api/company/switch` (line 131). However, `apps/web/src/app/api/company/switch/route.ts:27-36` rejects non-OWNER/ADMIN users and child-company members, so the write is silently ignored for many users. |
| WF-1.6 | `homeWorldFor(role)` redirect mapping. | **MAJOR DISCREPANCY** | See below. `homeWorldFor` maps `PROJECT_MANAGER` to `/` (today) via fallback, but WF-1 says `PROJECT_MANAGER` → `/build`. |
| WF-1.7 | Desktop vs mobile redirect by `middleware.ts` and `ResponsiveSurfaceRedirector`. | **CONFIRMED with caveat** | `apps/web/src/middleware.ts:68-86` redirects `/`→`/m` for mobile and `/m`→`/` for desktop. `apps/web/src/components/responsive-surface-redirector.tsx` handles home-route resize redirect; it does **not** show a toast offering a switch. |
| WF-1.8 | World rail highlights active world; side panel shows role-filtered sections. | **CONFIRMED** | `apps/web/src/components/app-shell.tsx:278-282` uses `worldsFor(userRole)` and `settingsLinksFor(userRole)`. |

---

## Discrepancies ranked by severity

### CRITICAL

1. **`homeWorldFor` does not map `PROJECT_MANAGER` to `/build` as WF-1 requires.**
   - **Document:** Appendix A WF-1 step 4 — `STORE_KEEPER / PROCUREMENT_MANAGER / PROJECT_MANAGER → /build (Build world)`.
   - **Code:** `apps/web/src/lib/nav.ts:1142-1151` `homeWorldFor` maps `STORE_KEEPER`, `PROCUREMENT_MANAGER`, `SALES_MANAGER` to `build`, but `PROJECT_MANAGER` is missing and falls back to `today` (`/`).
   - **Impact:** Every `PROJECT_MANAGER` signing in lands on Today instead of Build, contradicting the documented workflow.

### MAJOR

2. **`/my-tasks` does not display subtask progress, time logs, or dependencies.**
   - **Document:** §2.2 — `/my-tasks` "shows assigned tasks with subtask progress, time logs, and dependencies."
   - **Code:** `apps/web/src/app/api/my-tasks/route.ts:20-41` returns only `id, title, description, instructions, status, priority, dueDate, assignedBy, completedAt, createdAt`. `apps/web/src/components/tasks/my-tasks-panel.tsx` renders exactly that subset; no subtask, timer, or dependency UI is present.
   - **Impact:** Feature is documented but un-wired; users cannot see subtask progress, log time, or view dependencies on the page.

3. **Company switcher on sign-in is non-functional for non-OWNER/ADMIN users.**
   - **Document:** WF-1 step 3 — "If user has multiple `UserCompany` memberships, system shows a company switcher... User clicks the intended company. System writes the active `companyId` to the session and reloads."
   - **Code:** `apps/web/src/app/sign-in/page.tsx:131-135` calls `POST /api/company/switch` but catches errors. `apps/web/src/app/api/company/switch/route.ts:27-36` restricts the switch to `OWNER/ADMIN` users at the top of the hierarchy; all other users get 403 and the selected company is ignored.
   - **Impact:** A multi-company non-owner cannot select the company they are logging into; the picker is decorative for them.

4. **`/calls` does not include analytics in-page.**
   - **Document:** §2.2 — `/calls` shows "every call on company numbers with recordings, notes, dispositions, and analytics."
   - **Code:** `apps/web/src/app/calls/page.tsx` displays recordings, notes, dispositions, but call analytics are at a separate route `/reports/calls` (`apps/web/src/app/reports/calls/page.tsx:25` requires `CALL_ANALYTICS`).
   - **Impact:** Analytics are not on the `/calls` page as described; they require navigation to a separate report.

5. **Role change audit on `PATCH /api/users/[id]` is not transactional.**
   - **Document:** §1.3 — `logAction()` is "wrapped inside the same Serializable transaction as every business mutation."
   - **Code:** `apps/web/src/app/api/users/[id]/route.ts:101-163` performs `prisma.user.update()` and then calls `logAction(prisma, ...)` using the top-level client, not a transaction client. If logging fails after the update, the mutation has already been committed and the audit row is missing.
   - **Impact:** Audit trail may diverge from actual state for role/activation changes.

### MINOR

6. **Demo role buttons show 7 roles, not the documented 6.**
   - **Document:** WF-1 step 1 and §2.1 — 6 demo buttons.
   - **Code:** `apps/web/src/app/sign-in/page.tsx:25` and `apps/web/src/app/api/auth/demo-login/route.ts:36` both include `DEVELOPER` as a 7th demo role.
   - **Impact:** Cosmetic / dev-only; does not affect production.

7. **`canAssignRole` same-tier exception includes `DEVELOPER`, not just OWNER↔ADMIN.**
   - **Document:** §1.2 — "except OWNER↔ADMIN".
   - **Code:** `apps/web/src/lib/roles.ts:105` allows any tier-1 role to cross-assign, which includes `DEVELOPER`.
   - **Impact:** Behaviour is slightly broader than described, but `DEVELOPER` is an explicit role and the rule is still hierarchical.

8. **Role change `AuditLog` does not capture full before/after "state".**
   - **Document:** §1.3 — "`AuditLog` captures `before` and `after` JSON for role changes and sensitive edits."
   - **Code:** `apps/web/src/app/api/users/[id]/route.ts:148-149` logs `{ role: existing.role }` and `{ role: body.role }` only; other user fields are not part of the diff.
   - **Impact:** Audit diff is narrower than the claim implies, though the changed field is logged.

9. **Document-driven stage gates for sale registry and land possession are not verified.**
   - **Document:** §1.4 — "Sale registry is not 'complete' until the registry document is uploaded. Land possession is toggled with an uploaded document."
   - **Code:** Not found/verified in the files inspected. Schema supports attachments, but enforcement was not located.
   - **Impact:** Cannot confirm the feature is wired; marked AMBIGUOUS above.

---

## Notes for the parent agent

- No build, type-check, or lint run was performed.
- No automated scripts were used; all verification was done with `read` and `grep` as requested.
- I could not write the file to disk because this environment does not expose a file-editing tool; the markdown above should be written to `/Users/sparshagarwal/Downloads/nirman-inventory/docs/use-cases-audit/audit-cross-today.md`.
