# Nirman Inventory OS — Agent Guide

## Commands

- `pnpm dev` — run web dev server (Turbopack). Uses port 3000, falls back to 3001.
- `pnpm build` / `pnpm lint` / `pnpm typecheck` — workspace-wide via Turbo.
- `pnpm db:generate` — regenerate Prisma client after schema changes. **You MUST restart `pnpm dev` after regenerating** — the `globalForPrisma` singleton in `packages/db/src/index.ts` caches the `PrismaClient` instance in `globalThis`, which survives Turbopack hot reloads. A stale cached client will cause runtime `Cannot read properties of undefined (reading 'findMany')` errors for any model added after the client was first loaded.
- `pnpm db:push` — push schema to DB (dev). `pnpm db:migrate` for migrations.
- `pnpm db:studio` — Prisma Studio.
- `pnpm --filter @nirman/services test` — run service unit tests (vitest).

## Conventions

- **DB**: all Prisma models live in `packages/db/prisma/schema.prisma`. Import the client and
  types from `@nirman/db` (`import { prisma, ... } from "@nirman/db"`). After any schema change,
  run `pnpm db:generate` (and `pnpm db:push` against a running Postgres).
- **Money/quantities**: use `Decimal` (`@db.Decimal(14,2)` for money, `(14,3)` for quantities).
  Never use JS `number` for money in the DB layer.
- **Stock ledger**: NEVER mutate stock by updating a "current stock" column directly. Always use
  `recordMovement()` or `recordTransfer()` from `@nirman/services` — these append an immutable
  `StockMovement` AND atomically update the `StockLocationItem` (qty + MAC) inside one
  Serializable transaction. Current stock = `StockLocationItem.qty`; full audit = `StockMovement`.
- **Moving Average Cost (MAC)**: material cost is tracked per-location in `StockLocationItem.movingAvgCost`.
  On receipt: `newMAC = (oldQty×oldMAC + recvQty×recvCost) / (oldQty+recvQty)`. On issue: MAC is
  unchanged; the issue's `unitCost` = current MAC. Transfers carry the source MAC to the destination.
  The pure MAC function is in `@nirman/services` (`computeMovingAverageCost`) — 8 unit tests.
- **Cost-per-sqft allocation**: bulk materials are issued to a *project*, not individual units. To
  estimate a unit's production cost, call `reallocateProjectCosts()` from `@nirman/services`:
  `costPerSqft = totalProjectCost / totalSellableArea`, then `unit.productionCost = costPerSqft × unit.area`.
  Cached on `Project.costPerSqft` + `BuiltUnit.productionCost`. Re-run after material issues / project
  costs / land purchases change. **Per-unit issuance**: if `MaterialIssue.builtUnitId` is set, the
  cost goes directly to that unit's `productionCost` (on top of the area allocation) — not
  area-allocated across all units. The reallocation function separates project-level costs
  (area-allocated pool) from unit-direct costs (added to the specific unit).
- **Soft deletes**: master entities (Company, Project, StockLocation, MaterialCategory, Material,
  Supplier, Customer, LandPurchase, LandParcel, BuiltUnit) have `deletedAt: DateTime?`. NEVER hard-
  delete these — set `deletedAt = now()`. All queries MUST filter `deletedAt: null` unless explicitly
  querying archived records. Transactional records (StockMovement, GoodsReceipt, etc.) are already
  immutable — no soft delete needed.
- **Procurement scope**: every `PurchaseOrder` must set `procurementScope` (COMPANY or PROJECT).
  COMPANY → receive into a company warehouse location; PROJECT → receive into a project site.
- **Land partition**: atomic transaction — validate Σ child area = parent area, create children,
  set parent `status = PARTITIONED`, record `LandPartition`.
- **UI**: shadcn-style primitives in `apps/web/src/components/ui/`. Use `cn()` from `@/lib/utils`.
  Tailwind v4 with theme tokens in `globals.css` (`@theme`). Sidebar nav config in `src/lib/nav.ts`.
- **API**: Route Handlers under `apps/web/src/app/api/`. Auth via Better-Auth
  (`src/lib/auth.ts`, handler at `api/auth/[...all]`). Every route handler MUST
  call `requirePermission(PERM.X)` or `requireUser()` at the top of its body —
  `apiHandler` only checks authentication, not authorization. Permission keys
  are in `@/lib/roles` (`PERM.*`). `requirePermission` returns a typed
  `CurrentUser` ({ id, role, companyId, ... }) and throws `ForbiddenError` (→403).
- **Auth / sign-in**: Better-Auth email+password with Prisma adapter. The
  middleware gates all non-public routes (redirecting to `/sign-in?redirect=…`)
  in ALL environments unless `AUTH_BYPASS=true` is set explicitly. API routes
  (`/api/*`) are NOT redirected by middleware — they pass through and return
  401 JSON from `apiHandler` when there's no session; the client-side 401
  fetch interceptor (in `AppShell`/`MobileShell`) then redirects to `/sign-in`.
  `getSession()` in `src/lib/server.ts` returns a real Better-Auth session by
  default; only with `AUTH_BYPASS=true` does it return a synthetic dev user
  (first OWNER/ADMIN in the DB). Set `AUTH_BYPASS=true` in `apps/web/.env` for
  headless dev where you don't want to sign in. Sign-out is the `LogOut` icon
  in the world rail (`AppShell`) — calls `authClient.signOut()` then redirects
  to `/sign-in`. One-click role login (dev only): the `/sign-in` page shows a
  row of 6 role buttons below the form. Each calls `POST /api/auth/demo-login`
  which idempotently provisions a credential `Account` with the shared demo
  password (`nirman123`) for that role's user, then runs the real
  `signIn.email` flow — so the session is real, not a bypass. Demo users:
  `amit@nirman.in` (OWNER), `anita@nirman.in` (ADMIN), `sneha@nirman.in`
  (MANAGER), `ravi@nirman.in` (SUPERVISOR), `karan@nirman.in` (SALES),
  `priya@nirman.in` (ACCOUNTANT) — all password `nirman123`.
- **RBAC**: 6 roles (OWNER, ADMIN, MANAGER, SUPERVISOR, SALES, ACCOUNTANT) with
  a View+Manage permission matrix in `@/lib/roles.ts`. 44 permissions covering
  all modules + approval actions (`po.approve`, `requisition.approve`,
  `stock.transfer`, `stock.issue`, `sale.create`, `expense.create`,
  `asset.sell`, `land.partition`). OWNER/ADMIN = "*" (all permissions).
  Fine-grained overrides via `RolePermission` table (additive to the matrix).
  Multi-company via `UserCompany` join (role per membership). Server Components
  gate UI by calling `getUserRole()` + `hasPermission()` and passing a
  `permissions` prop to client views. Client components can use the
  `usePermissions()` hook from `@/lib/permissions`. Nav items are role-gated
  via the `roles` array in `src/lib/nav.ts`.
- **Approvals**: POs go DRAFT→APPROVED (requires `po.approve`), requisitions go
  SUBMITTED→APPROVED (requires `requisition.approve`). The `/approvals` page
  shows the queue for approvers. Approval columns: `approvedById`/`approvedAt`
  on PurchaseOrder and MaterialRequisition.
- **Audit logging**: `logAction()` from `@nirman/services` writes immutable
  `AuditLog` entries. Wired into EVERY mutation across all services: PO
  create/approve/order/cancel/receive, requisition create/submit/approve/reject/
  convert, transfer create, sale create/payment/cancel, issue create, equipment
  create/assign/return/maintenance/retire, stock-count create/confirm/reconcile,
  supplier-return create/submit/complete/cancel, built-unit create/status/valuation,
  project-cost add/delete, land purchase + partition + valuation + status, and
  auto-requisition generation. Every mutation service function takes an optional
  `userId` and wraps its writes in a transaction that includes the `logAction` call.
- **General Ledger (GL) + GST**: `postJournalEntry()` and the domain helpers
  (`postPurchaseReceipt`, `postMaterialIssue`, `postAssetSale`,
  `postPaymentReceived`, `postProjectCost`, `postExpense`, `postSupplierReturn`,
  `postLandPurchase`) from `@nirman/services` post balanced double-entry
  `JournalEntry` + `JournalLine` rows INSIDE the same transaction as the source
  mutation (so the books never diverge from reality). The chart of accounts is
  `GlAccount` (26 system accounts). Account codes are in the `ACCT` const. Input GST (ITC) is debited
  on purchases; Output GST is credited on sales. Seed via `seedChartOfAccounts()`.
  Reporting: `trialBalance()` + `accountLedger()`. UI at `/gl` (PPR page +
  client drill-down). API at `/api/gl/trial-balance`, `/api/gl/ledger`,
  `/api/gl/accounts`.
- **Auto-requisition**: `generateAutoRequisition()` from `@nirman/services`
  operationalizes the `reorderPoint` / `economicOrderQty` fields — when a
  material's total stock drops to/below its reorderPoint, it raises a DRAFT
  `MaterialRequisition` (one per call, batching all due materials for a
  project). De-duplicates against open requisitions. Qty = EOQ if set, else
  replenish-to-2×-reorder. Humans still review/submit — automation raises the
  request, humans approve the spend. API at `POST /api/requisitions/auto`.
  UI: "Auto-generate" button on the Requisitions page.
- **Comparative Quote Engine**: `@nirman/services`/`quote-comparison.ts` —
  purchasers must collect ≥3 vendor quotes (PDF/image uploads) per
  requisition. The system flags the cheapest by landed (delivered-to-site)
  total. An approver (`po.approve`) selects the winning quote — they may
  override the cheapest with a reason. The min-quotes gate (default 3,
  configurable per-requisition via `minQuotesRequired`) blocks PO
  conversion until enough quotes are uploaded, unless waived by an
  approver (`waiveQuoteRequirement()` with a reason). On conversion,
  `getWinningQuoteLineCosts()` auto-fills the PO line costs from the
  winner. Schema: `VendorQuote` + `VendorQuoteLine` +
  `MaterialRequisition.{minQuotesRequired, quotesWaived, quotesWaivedById,
  quotesWaivedReason, quotesLockedAt}` + `PurchaseOrder.selectedQuoteId`.
  Pure helpers (`cheapestQuoteId`, `quoteVariances`,
  `isQuoteGateSatisfied`, `winningLineCosts`) are unit-tested (15 tests).
  API: `POST/GET /api/quotes`, `GET/PATCH/DELETE /api/quotes/[id]`,
  `POST /api/quotes/[id]/select`, `PATCH /api/requisitions/[id]` with
  `action: "waiveQuotes"`. UI: `ComparativeQuotePanel` embedded in the
  Convert-to-PO dialog; `QuoteUploadDialog` for file+price entry.
- **Purchaser Performance Report**: `getPurchaserPerformance()` from
  `@nirman/services`/`quote-comparison.ts` — per-purchaser metrics
  derived from the quote engine: quotes uploaded, requisitions handled,
  cheapest-selection rate, total spend, and potential savings (max quote
  − selected quote per requisition). API at
  `GET /api/reports/purchaser-performance`. UI at
  `/reports/purchaser-performance` (date-range filter, CSV export, print).
- **Scrap / "Create" Material Generation**: `@nirman/services`/`scrap.ts` —
  internally generated material (scrap, by-products) added to stock at a
  scrap valuation via `SCRAP_GENERATED` movement type (IN movement with
  user-specified unit cost; MAC recalculated). Schema: `ScrapGeneration` +
  `ScrapGenerationLine` + `Material.isScrap` flag. Each generation gets a
  slip number (SG-YYMMDD-NNNN). API at `GET/POST /api/scrap-generations`,
  `GET /api/scrap-generations/[id]`. UI at `/scrap-generations`.
  **Scrap sale as project cost recovery**: when scrap material is sold via
  `createMaterialSale()` and the sale is linked to a `projectId`, the
  `scrapSubtotal` (persisted on `MaterialSale`) is subtracted from the
  project's total cost in `projectTotalCost()` and
  `reallocateProjectCosts()` — reducing each unit's `productionCost`
  proportionally. The GL also credits `ACCT.COST_RECOVERY` (contra-expense)
  for the scrap portion of the sale.
- **DPR Multi-Tier Approval**: `DailyProgressReport.approvalStatus`
  (`SUBMITTED → SUB_ADMIN_APPROVED → APPROVED | REJECTED`). Sub-Admins
  (MANAGER, `dpr.approve_sub_admin`) approve first; Admins (OWNER/ADMIN,
  `dpr.approve_admin`) give final approval. Rejected DPRs can be
  resubmitted. Service: `subAdminApproveDpr()`, `adminApproveDpr()`,
  `rejectDpr()`, `resubmitDpr()` in `@nirman/services`/`hr.ts`. API:
  `PATCH /api/dprs/[id]` with `action: "subAdminApprove" |
  "adminApprove" | "reject" | "resubmit"`. UI: approval status badges +
  action buttons on the DPR list page.
- **Standard Consumption Benchmarks**: `@nirman/services`/
  `standard-consumption.ts` — defines how much of a material SHOULD be
  consumed per unit of work (e.g. 1.5 t steel per 100 sqft of foundation).
  Schema: `StandardConsumption` (workType, materialId, standardQty,
  unitOfMeasure). CRUD service + `calculateConsumptionVariance()` compares
  actual vs standard. API at `GET/POST /api/standard-consumptions`,
  `GET/PATCH/DELETE /api/standard-consumptions/[id]`. UI at
  `/standard-consumptions` (grouped by work type).
- **Auto-Scrap Detection from DPR**: `runDprVarianceAnalysis()` from
  `@nirman/services`/`standard-consumption.ts` — when a DPR has a
  `workType`, compares actual material lines against standard consumption
  benchmarks. Over-consumption deltas are auto-flagged as scrap and
  optionally auto-generate a `ScrapGeneration` (with `SCRAP_GENERATED`
  stock movements at 50% of standard cost). Schema additions:
  `DailyProgressReport.{workType, varianceAnalysis (JSON),
  autoScrapGenerationId}` + back-relation `ScrapGeneration.dprAutoScrap`.
  API at `POST /api/dprs/[id]/variance` (with `autoGenerateScrap` +
  `scrapToLocationId` options). UI: DPR cards show work type badge; DPR
  detail dialog shows variance analysis table (actual vs standard vs
  variance %).
- **Tally ERP Integration**: `@nirman/services`/`tally.ts` — generates
  Tally-compatible XML vouchers from `JournalEntry` + `JournalLine`
  records and syncs them via a pluggable `TallyProvider` (stub logs XML;
  real provider POSTs to Tally's HTTP API on port 9000). Maps source
  types to Tally voucher types (Purchase, Sales, Receipt, Payment,
  Journal, Credit Note). Schema: `TallySyncLog` (one per journal entry,
  tracks sync status PENDING→SYNCED/FAILED, XML payload, Tally voucher
  number). `generateTallyVoucherXml()` builds the ENVELOPE/TALLYMESSAGE
  structure. `syncBatchToTally()` syncs all unsynced entries.
  `getTallySyncStats()` for dashboard. API at `GET/POST /api/tally/sync`,
  `GET /api/tally/log`. UI: `TallySyncPanel` on the `/gl` page (sync
  button, stats, log viewer).
- **WhatsApp / Notification Alerts**: `@nirman/services`/
  `notifications.ts` — pluggable `WhatsAppProvider` + `EmailProvider`
  (stubs log messages; real providers call WhatsApp Business API /
  SMTP). Templates per-company per-event-type with `{{variable}}`
  placeholders (`renderTemplate()`). Trigger functions: `notifyLowStock()`,
  `notifyTaskAssignment()`, `notifyQuoteApproval()`. Schema:
  `NotificationTemplate` (eventType, channel, template, isActive) +
  `NotificationLog` (status PENDING→SENT/FAILED, recipient, message,
  metadata). API at `GET/POST /api/notifications/templates`,
  `GET /api/notifications/log`, `POST /api/notifications/test`. UI:
  `NotificationsPanel` on the Settings page (template management, stats,
  delivery log).
- **GPS-Tagged Attendance**: `WorkerAttendance` now has `checkInLat`/
  `checkInLng`/`checkOutLat`/`checkOutLng` + `checkInLocation`/
  `checkOutLocation` fields. The mobile attendance form
  (`/m/site/attendance`) has a "Capture GPS location" button that uses
  `navigator.geolocation.getCurrentPosition()` (high accuracy, 10s
  timeout). GPS coordinates are attached to all attendance records in
  the bulk submission. Service: `recordAttendance()` +
  `bulkRecordAttendance()` accept the GPS fields. API:
  `POST /api/attendance` (bulk records include GPS fields); `GET
  /api/attendance` returns GPS fields.
- **99acres / Portal Listings Sync**: `@nirman/services`/
  `portal-listing.ts` — syncs available built units to property portals
  (99acres, MagicBricks, Housing.com) via a pluggable `PortalProvider`
  (stub logs listings; real provider calls portal REST APIs). Schema:
  `PortalListing` (builtUnitId, portalName, title, askingPrice,
  bedrooms, area, photos, status DRAFT→LISTED→DELISTED/SYNC_FAILED,
  listingId, listingUrl, syncError). `createPortalListing()` creates a
  draft; `syncListingToPortal()` pushes to the portal (create or
  update); `delistPortalListing()` removes from the portal. API at
  `GET/POST /api/portal-listings`, `POST /api/portal-listings/[id]?
  action=sync|delist`. UI at `/portal-listings` (grouped by portal,
  stats, create listing dialog with auto-fill from built unit, push/
  sync/delist buttons, link to live listing).
- **Per-Unit Material Issuance**: `MaterialIssue.builtUnitId` (optional) —
  when set, the issue's cost goes DIRECTLY to that unit's `productionCost`
  instead of being area-allocated across all units. The
  `reallocateProjectCosts()` function in `@nirman/services`/`valuation.ts`
  now separates project-level costs (area-allocated) from unit-direct costs
  (added on top of the area allocation for that specific unit). UI: the
  issue materials dialog shows a "Specific Unit (optional)" dropdown when
  a project is selected — choosing a unit routes the cost directly; leaving
  it blank keeps the legacy project-wide area allocation.
- **Auto-Delist from Portal on Sale**: `sellAsset()` in
  `@nirman/services`/`sale.ts` automatically delists all active portal
  listings (DRAFT/LISTED) when a built unit is marked SOLD — sets status
  to DELISTED + `delistedAt`. No manual intervention needed.
- **WhatsApp Notification Triggers (wired)**: notification triggers are
  now wired into actual approval workflows: (1) quote selection →
  `notifyQuoteApproval()` sends to the requisition's requester; (2) DPR
  sub-admin/admin approval → `sendNotification()` sends to the DPR
  submitter; (3) auto-requisition generation → `notifyLowStock()` sends
  to all OWNER/ADMIN/MANAGER members of the company. All notification
  calls are best-effort (wrapped in try/catch) — failures don't block
  the business operation. Requires `User.phone` field (added to schema)
  to be populated for WhatsApp delivery.
- **User.phone field**: added to the `User` model for WhatsApp
  notification delivery. Nullable — users without a phone number simply
  don't receive WhatsApp messages (email/in-app channels still work).
- **Inter-company Stock Transfer Order (STO)**: the transfer service
  (`@nirman/services`/`transfer.ts`) moves materials between locations in the
  same OR different companies. Inter-company STOs use a Transfer Price
  (TP = source MAC + freight + handling + markup%), computed by
  `computeTransferPrice()` (freight/handling allocated by cost weight). On
  completion: TRANSFER_OUT at source MAC, TRANSFER_IN at `unitTransferPrice`,
  per-line `unitCostAtSource`/`unitTransferPrice`/`lineTransferTotal` persisted.
  The destination's MAC reflects the markup — the prerequisite for inter-company
  accounting. **UI reachability**: the transfer dialog (`transfer-form-dialog.tsx`)
  offers destinations across the whole **company group** (current company +
  siblings/parent/children via `parentCompanyId`), grouped by company with an
  inter-company indicator + STO cost panel. `getCompanyGroupIds()` from
  `@/lib/server` scopes the destination list. Both sides see an STO: list
  queries use `OR: [{ fromLocation: { companyId } }, { toLocation: { companyId } }]`.
  `GET /api/transfers/[id]` returns the full STO economics and is visible to
  either the originating or receiving company. Completing an STO requires
  STOCK_TRANSFER permission in the **source** company (switch via the company
  switcher).
- **Hierarchical RBAC (Admin → Sub-Admin → Sub-Sub-Admin)**: the owner's
  system map specifies a 3-tier delegation hierarchy. It maps onto the
  existing role set: Admin = OWNER/ADMIN (scopeType COMPANY — unscoped),
  Sub-Admin = MANAGER (scopeType DEPARTMENT — sees their departments),
  Sub-Sub-Admin = SUPERVISOR (scopeType PROJECT — sees their sites). Schema:
  `UserCompany.scopeType` (COMPANY|DEPARTMENT|PROJECT) +
  `UserCompany.reportsToUserCompanyId` (self-relation — the reporting line,
  per-membership) + `UserScope` join table (multiple scope entries per
  membership — a Sub-Admin managing depts A+B has two rows; a Sub-Sub-Admin
  on sites P1+P2 has two rows). COMPANY-scoped memberships have no scope
  rows (unscoped = everything). Service: `@nirman/services`/`rbac.ts` —
  `resolveUserScope()` (DB-backed scope resolution for list filters),
  `assignScopedMembership()` (validates actor is above the target in the
  hierarchy, scope entries match scope type, entries belong to the company,
  reportsTo is same-company + cycle-free; atomically replaces scope entries
  + logs AuditLog), `getReportingChain()` / `getDirectReports()` (org chart).
  Pure helpers (`defaultScopeType`, `resolveScopeType`, `validateScopeEntries`,
  `wouldCreateCycle`, `_svcCanAssignRole`) are unit-tested (24 tests). API:
  `PATCH /api/companies/[id]/members/[memberId]` accepts `scopeType` +
  `reportsToUserCompanyId` + `scopeEntries` (routes through
  `assignScopedMembership`); a simple `{ role }` body still works (backwards
  compatible). `GET …/[memberId]?reports=1` → direct reports; otherwise →
  upward reporting chain. The members list GET now returns `scopeType` +
  `scopes[]` + `reportsToUserCompanyId`. UI: the Settings → Companies members
  table shows a Scope column (Company-wide / Depts (n) / Sites (n) with the
  detail list + "reports to X"). **Scope-filtered queries**: list pages call
  `getUserScope()` from `@/lib/server` and filter — PROJECT scope filters
  projects/DPRs/attendance/approvals to `projectId IN scope.projectIds`;
  DEPARTMENT scope filters the cost-centre consumption report to
  `departmentId IN scope.departmentIds`. `getAssignedProjectIds()` prefers
  the hierarchical UserScope and falls back to the legacy ProjectAssignment
  table. OWNER/ADMIN are always COMPANY-scoped (cannot be scoped down).
  **Account creation hierarchy**: `canAssignRole(actorRole, targetRole)` in
  `@/lib/roles` enforces that a role can only create/assign roles STRICTLY
  below its tier, OR at the same tier but a different role (OWNER↔ADMIN
  cross-assignment). Tier 3 (SUPERVISOR/SALES/ACCOUNTANT) cannot create any
  accounts. `assignableRoles(actorRole)` returns the filtered list for UI
  dropdowns. Enforced at: `POST /api/companies/[id]/members` (add member),
  `PATCH /api/companies/[id]/members/[memberId]` (change role + scope),
  `PATCH /api/users/[id]` (change role/active), and `assignScopedMembership()`
  in the service. The UI filters the "Add member" + inline role dropdowns to
  only show assignable roles, and hides the active-toggle / role-select for
  members at or above the actor's tier. The settings page gate is now
  `PERM.COMPANY_MANAGE` (which MANAGER has) instead of OWNER/ADMIN-only, so
  Sub-Admins can access the members management UI.
- **PWA / Field receiving**: `/field` page + `FieldReceive` client component
  with BarcodeDetector camera scanning + offline mutation queue
  (`@/lib/offline/queue`). Service worker at `public/sw.js`, registered by
  `SwRegister` in the root layout (production only). Manifest at
  `public/manifest.webmanifest`.
- **Responsive surface switching** (desktop `/` ↔ mobile `/m`): the app has
  two distinct UI surfaces on two route trees — desktop (`AppShell`, rail+
  panel) and mobile (`MobileShell`, persona tab bar). Switching is layered:
  (1) **initial load** — `middleware.ts` redirects a mobile UA at `/` to
  `/m`; the sign-in page checks `matchMedia("(max-width:1023px)")` once after
  login. (2) **live** — `ResponsiveSurfaceRedirector` (mounted in the root
  layout) watches the viewport and, on a surface mismatch, auto-redirects at
  **home routes** (`/` and persona homes `/m/{pulse,command,site,book,books}`)
  but on **deep routes** (forms, detail drawers, ledger drill-downs) only
  shows a non-blocking toast offering to switch — never yanks a user out of
  in-progress work. Both layers respect the `nirman-desktop=1` cookie
  (escape hatch set by `/?desktop=1`, surfaced from the mobile "More" tab):
  if set, mobile is never forced. Resize is debounced 250ms; the toast fires
  at most once per (mismatch, route) pair.
- **Formatting helpers**: `formatCurrency`, `formatNumber`, `formatDate` in `@/lib/utils`.
- **Task execution engine**: Tasks are not flat to-do lines — they are units of
  work composed of SubTasks (checkable steps driving a live progress %),
  TaskComments (threaded discussion), TaskActivity (an immutable, auto-generated
  per-task timeline), TaskDependencies (A blocks B; enforced server-side — a
  blocked task cannot move to IN_PROGRESS), and TaskTimeLogs (start/stop timers
  tracking real effort vs estimate). All mutations go through `@nirman/services`
  (`createTask`, `updateTaskStatus`, `reassignTask`, `addSubTask`,
  `toggleSubTask`, `deleteSubTask`, `addComment`, `deleteComment`,
  `addDependency`, `removeDependency`, `startTimer`, `stopTimer`,
  `getTaskDetail`) — each runs inside a Serializable transaction that appends a
  `TaskActivity` row (the per-task feed) AND an `AuditLog` row. The feed never
  diverges from reality. `TaskError` is a status-bearing error (→400/403/404/409).
  Pure helpers (`computeProgress`, `isBlocked`, `formatDuration`,
  `totalLoggedMinutes`) are unit-tested (17 tests). UI: the TaskDetailDrawer
  (slide-over) is the execution surface — tabs for Steps, Discussion, Activity,
  Links (dependencies), and Time. Wired into both `/tasks` (TasksManager) and
  `/my-tasks` (MyTasksPanel). The AssignTaskDialog supports initial subtask
  steps + a time estimate. API routes under `api/tasks/[id]/{subtasks,comments,
  dependencies,time}`.

## Package layout

- `packages/db` — Prisma schema + generated client (`@nirman/db`). Import `prisma` + types from here.
- `packages/services` — business logic: stock ledger (`recordMovement`, `recordTransfer`),
  MAC calculation, valuation (`materialInventoryValue`, `unsoldAssetValue`, `projectPnl`,
  `reallocateProjectCosts`). Import from `@nirman/services`.
- `apps/web` — Next.js app (UI, API routes, auth).

## Gotchas

- Postgres runs on **port 5433** (docker-compose) to avoid clashing with other local DBs.
- Docker must be running for `db:push`/`db:migrate`. Dashboard loads without DB.
- pnpm 11 reads build allow-list from `pnpm-workspace.yaml` (`onlyBuiltDependencies`), NOT from
  the `pnpm` field in package.json.
- Next.js 16: Partial Prerendering is enabled via `cacheComponents: true` in `next.config.ts`
  (not `experimental.ppr`). Because PPR is on, `export const dynamic = "force-dynamic"` is
  **not allowed** on route segments — it throws at build/runtime. To opt a Server Component
  page into dynamic rendering (e.g. pages that read from the DB), import `connection` from
  `next/server` and call `await connection()` inside the component.
- **PPR + Suspense pattern**: `connection()` and Prisma calls must NOT be at the top level of
  the default export — that blocks the whole route from prerendering and triggers the
  "Uncached data or `connection()` was accessed outside of `<Suspense>`" warning. Instead,
  make the default export a **sync** function that returns a static shell (PageHeader, etc.)
  wrapping an async child component in `<Suspense fallback={<PageLoading />}>`. The async child
  does `await connection()` + the DB fetches. Use `<PageLoading label="…" />` from
  `@/components/page-loading` for the fallback. See `app/page.tsx` or `app/projects/page.tsx`
  for the canonical pattern.
- **Data flow pattern**: Server Components fetch via `prisma` directly (use `getCompany()` from
  `@/lib/server` for the single-company scope, and `toNum()` to serialize Prisma `Decimal` →
  number before passing to client components). Mutations go through Route Handlers under
  `api/` (Zod-validated via schemas in `@/lib/server`); client forms `fetch()` them then call
  `router.refresh()` to re-render the server component. Soft deletes use `softDelete()` from
  `@nirman/services` (guards block deleting entities with stock/open orders). Toasts via `sonner`
  (`<Toaster>` mounted in root layout).
- The generated Prisma client is at `packages/db/src/generated/prisma` (gitignored). Always
  `pnpm db:generate` after checkout.

---

# Design System — "Warm Industrial Precision"

Derived from the owner's hand-drawn system map (`docs/source-material/IMG_0871–0873`).
Read this before changing any UI. If a page needs something not described here, the
thing probably belongs here rather than in the page.

## The three ideas

1. **Warm, not clinical.** Every neutral carries a trace of warmth (hue ~60–80). The app
   should feel like drafting paper and concrete, not a stainless-steel SaaS dashboard.
   Site staff use this in daylight; cold blue-greys wash out.
2. **One accent, earned.** Ochre (`--color-brand`) is the only chromatic accent in the
   chrome. It marks exactly one thing: *"you are here / act here."* If ochre appears
   twice on a screen competing for attention, the screen is wrong.
3. **Colour is wayfinding, not decoration.** Each of the six worlds owns a hue, used only
   as a 2px rule, a 6px dot or an icon tint — **never** a filled panel.

## Information architecture — four worlds + settings

The nav is **not** a flat list of modules. `src/lib/nav.ts` is the single source of truth
and mirrors the owner's map. The original six worlds (Today, Materials, Property, People,
Money, Insights) were consolidated into four for clarity — Materials+Property became "Build",
Money+Insights became "Finance". Settings is a gear at the bottom, not a world.

| World | Owner's term | Route root |
| --- | --- | --- |
| **Today** | — (cross-cutting) | `/`, `/my-tasks`, `/approvals`, `/tasks` |
| **Build** | Raw Material + Real Estate | `/materials`, `/procurement`, `/requisitions`, `/vendors`, `/field`, `/stock-*`, `/equipment`, `/projects`, `/land`, `/units`, `/renovations`, `/sales`, `/rentals`, `/customers` |
| **HR** | People | `/hr/*` |
| **Finance** | Accounts (Tally) + Analysis | `/finance`, `/gl`, `/reports/*` |
| ⚙ Settings | — | `/settings`, `/workflows` |

Rules:
- **Never add a top-level nav item.** Add a `NavLink` to the right `section` of the right
  `World` in `nav.ts`. The shell, command palette, mobile tabs and `/reports` hub all read
  from it, so they can never disagree.
- Every `NavLink` needs a **`hint`** — one plain-language line. It's reused as the page
  description, the palette sublabel and the tooltip. Write the explanation once.
- Every `NavLink` needs **`roles`**. A SALES user's nav must be genuinely smaller, not the
  same nav with dead ends.
- Add domain synonyms to `keywords` so people can search in their own words
  ("haziri" → Attendance, "indent" → Requisitions).
- Helpers: `worldsFor(role)`, `linksFor(role)`, `worldForPath()`, `linkForPath()`,
  `homeWorldFor(role)`, `badgeLinksFor(role)`.

## Shell

`components/app-shell.tsx` — 56px dark **world rail** (icons) + 224px light **world panel**
(that world's 5–8 links only) + content. The rail is dark and the panel is light on purpose:
that contrast makes "which world am I in" pre-attentive. Breadcrumb is `World / Page` with
the world-coloured dot. Panel collapse is a root `data-nav` attribute + CSS (set by an inline
script in `layout.tsx` before paint) — **never** React state restored in an effect.

## Layout vocabulary — `@/components/page`

Build pages from these; a page needing a seventh primitive means the primitive belongs here.
`<EmptyState>` is in `@/components/empty-state` and `<NoAccess>` is in `@/components/no-access`.

- `<Page>` — the page's vertical rhythm. Use instead of ad-hoc `space-y-*`.
- `<Section title description action bare>` — a titled block. `bare` drops card chrome.
- `<Toolbar>` / `<ToolbarCount>` — filters + search, visually joined to the data below.
- `<MetricGrid cols>` + `<Metric>` — a divided band, **not** a card grid. Six separate
  cards read as six things shouting; one band reads as an instrument panel.
- `<Figure>` — a labelled number for drawers and detail panels.
- `<StatusPill status>` + `humanStatus()` — **the one** definition of status colour, grouped
  by meaning (neutral / active / waiting / good / bad / alert). Never invent a local status
  colour map. Always includes a dot as well as colour (colour alone fails ~8% of men).
  `statusColor(status)` returns the raw CSS colour for dots/rails/borders where a pill is
  too heavy. `statusMeaning(status)` returns the meaning group string. Both draw from the
  same `STATUS_MEANING` map as `StatusPill`, so a dot and a pill for the same status can
  never disagree.
- `<Hint>` — a one-line inline explanation where a decision is made, not in a manual.
- `<PageHeader title description action secondaryActions stats>` — see below.
- `<EmptyState>` and `<NoAccess>` — see below.

## Non-negotiable rules

- **One primary action per page.** `PageHeader`'s `action` prop is it. Everything else goes
  in `secondaryActions` and renders quieter. Two `variant="default"` buttons on a screen
  means the screen has no primary action.
- **Button hierarchy**: `default` (ink) = the primary action · `brand` (ochre) = the single
  "start here" moment on an empty screen, never beside a `default` · `outline` = secondary ·
  `ghost` = tertiary/row actions · `destructive` = always paired with a confirm.
- **Every computed number explains itself.** Pass `provenance` to `Metric`/`Figure`/`KpiCard`
  (e.g. `"Σ qty × moving average cost, all locations"`). The user should never have to open
  a report to learn what a number means.
- **Numbers are `tnum`** (tabular mono) and right-aligned in tables — use `TDNum`/`THNum`
  from `ui/table`. Money and quantities must not jitter when they change.
- **Empty states answer three questions**: is this broken (no), why is it empty, what do I
  do now. If you can't answer the third, the page probably shouldn't exist.
- **Blocked screens are not dead ends.** Use `<NoAccess what="…" />` — it names what's
  restricted and points at Setup → Who Sees What. Never hand-roll a "no permission" div.
- **44px minimum touch target** on anything a field user taps. `Input`/`Select` are 44px
  below `sm:`, 36px above. `Button size="touch"` / `"icon-touch"` for field UI.
- **Focus is visible.** A 2px ochre `:focus-visible` ring is global — never `outline: none`
  without an equivalent replacement.
- **Status colour is defined in ONE place.** `StatusPill` / `statusColor()` /
  `statusMeaning()` in `@/components/page` are the single source of truth. Never create a
  local `STATUS_COLORS` / `STATUS_VARIANT` / `statusColor` map in a view component —
  import from `@/components/page` instead. The canonical `STATUS_MEANING` map covers all
  statuses across all modules (lifecycle, attendance, payroll, equipment, units, land,
  tasks, procurement, sales). If a new status is needed, add it to `STATUS_MEANING` in
  `page.tsx` — never branch on it locally.
- **Tabs are underlined, not segmented.** `TabsList` renders a horizontal row with a
  hairline border and a 2px active indicator attached to the content below. The old
  pill-in-a-well style breaks past 3–4 tabs and can't scroll. Use `TabsTrigger` with
  `font-semibold` for active and `font-medium text-muted-foreground` for inactive.

## Type scale

`text-micro` 10 · `text-caption` 11 · `text-meta` 12 · `text-body` 13 (default) ·
`text-section` 14/650 (block heading) · `text-figure` 19 mono (a number) ·
`text-title` 22/700 (page title) · `text-figure-lg` 26 mono · `text-label` 10 uppercase
tracked (field labels, table heads).

## Mobile — same worlds, fewer of them

"mobile + desktop 100%" (IMG_0873) means the two must never teach **two vocabularies**, not
that the desktop is crammed onto a phone. So:

- **What's on the tab bar** → the persona decides (`src/lib/mobile-nav.ts`). Curation by
  role is correct: 4–5 tabs, the things that role does on a phone. Executive and Sales
  personas use 4 tabs + a "More" link; Ops, Field, and Finance use 5 tabs.
- **What it's called** → the *world* decides. Labels, icons and colours come from `nav.ts`
  via `tabColor()`. A tab and its desktop sidebar entry must be visibly the same thing.
- A tab may promote one deep action (a supervisor's commonest act is "Receive", not
  "browse Materials"). It keeps its world's colour so it reads as a shortcut, not a new place.
- Mobile primitives (`components/mobile/mobile-primitives.tsx`) change only what a phone
  requires: 56px rows, lists instead of tables, `text-figure` numbers. Never labels or colour.

## Roles, in the owner's words

The map says admin → sub-admin → sub-sub-admin: the owner thinks in **delegation depth**,
which maps to **scope** (company → project → site), not to six unrelated job titles. Same UI
everywhere; scope decides what's in it. Gate UI with `hasPermission()` server-side and pass a
`permissions` prop down — never render a control the user can't use.

## Construction Execution Layer (H1–H8)

The system was expanded from basic inventory tracking to a comprehensive
construction-industry ERP. The expansion is organized into workstreams H1–H8:

- **H1: BOQ + WBS + Measurement Book**: Schema models `BoqItem`
  (hierarchical: SECTION→SUBSECTION→LINE_ITEM with qty/rate/amount),
  `WbsNode` (PROJECT_NODE→PHASE_NODE→ACTIVITY→SUB_ACTIVITY→MILESTONE with
  schedule dates, progress%, critical path), `MeasurementBookEntry` (site engineer's
  verified actual quantities per BOQ item, DRAFT→VERIFIED→APPROVED→REJECTED
  workflow), `WbsDependency` (FS/FF/SS/SF dependency types). Service:
  `@nirman/services`/`boq.ts` (CRUD + tree building + MTO generation).
  `@nirman/services`/`scheduling.ts` (CPM forward/backward pass, total
  float, critical path, EVM: PV/EV/AC/CPI/SPI/EAC/VAC, cost overrun
  forecast). API: `/api/boq/{items,tree}`, `/api/wbs/{nodes,tree,
  dependencies}`, `/api/mb-entries`, `/api/material-take-off`,
  `/api/evm`, `/api/cost-overrun`, `/api/node-evm`, `/api/schedule`. UI:
  `/boq`, `/wbs`, `/measurement-book`, `/project-control`.

- **H2: Subcontractor Management + RA Bills + TDS**: Schema models
  `SubcontractorWorkOrder` (scope=BOQ items, rates, retention%,
  advance, TDS category INDIVIDUAL/COMPANY/OTHER → 1%/2%/2%),
  `SubcontractorWorkOrderLine` (per-BOQ-item agreed rate),
  `RaBill` (from MB entries, DRAFT→SUBMITTED→APPROVED→PAID/REJECTED),
  `RaBillLine` (prevQty/thisQty/totalQty with prevAmount/thisAmount/
  totalAmount). Deductions: retention, TDS, advance recovery.
  Service: `@nirman/services`/`subcontractor.ts`. API:
  `/api/work-orders`, `/api/work-orders/[id]`. UI: `/work-orders`.

- **H3: Project Scheduling + EVM**: CPM scheduling with forward pass
  (ES/EF), backward pass (LS/LF), total float, critical path
  identification. EVM: PV from schedule×BOQ rate, EV from MB×BOQ rate,
  AC from actuals (material issues + RA bills), CPI/SPI/EAC/VAC.
  Cost overrun forecast per BOQ item: actual + committed vs budget.
  Resource leveling across projects (planned). Service:
  `@nirman/services`/`scheduling.ts`. API: `/api/schedule`,
  `/api/evm`, `/api/cost-overrun`, `/api/node-evm`. UI: `/project-control`.

- **H4: Advanced Procurement**: Vendor rating (auto-computed: 40%
  on-time delivery + 30% quality acceptance + 30% price
  competitiveness). Rate contract / framework agreement
  (`RateContract` model: supplier+material+agreedRate+validity period,
  auto-expiry, POs auto-fill rate). Value-based PO approval routing
  (company-configurable thresholds: default <₹50K manager, <₹5L admin,
  ≥₹5L owner). Commitment tracking (open requisitions + POs = committed
  cost). Service: `@nirman/services`/`procurement-advanced.ts`. API:
  `/api/vendor-ratings`, `/api/rate-contracts`,
  `/api/approval-routing`, `/api/project-commitments`. UI:
  `/vendor-ratings`, `/rate-contracts`.

- **H5: Real Estate CRM + Sales Workflow**: Payment schedule generation
  (CLP tied to WBS milestones — payment becomes DUE when milestone
  reaches 100% progress; TLP fixed installments; DPP down payment +
  installments). GST on real estate: residential affordable 1% on full
  price, residential non-affordable 5% on 2/3 (land 1/3 exempt),
  commercial 18% on full price. `computeRealEstateGst()` helper.
  Milestone payment checking: `checkMilestonePayments()` auto-marks
  CLP items as DUE when WBS nodes hit 100%. Payment recording against
  schedule items with automatic sale payment status updates.
  Service: `@nirman/services`/`crm.ts`. API: `/api/payment-schedules`,
  `/api/payment-schedules/items/[id]/pay`, `/api/milestone-payments/check`.

- **H6: Finance Enhancement**: Project profit centers (per-project P&L:
  revenue from asset sales + cost recovery from scrap, costs from land +
  materials + labour + equipment + subcontractor + overhead, gross
  profit + margin%, cost/revenue per sqft). Cash flow forecasting
  (inflows from due payment schedule items, outflows from open PO
  commitments + pending RA bills + pending payroll, net cash flow).
  Job costing (direct vs indirect costs, overhead absorption rate).
  Budget variance (BOQ budget vs actual cost by line item, with
  UNDER/ON_TRACK/OVER status flags). Service:
  `@nirman/services`/`finance-advanced.ts`. API: `/api/profit-center`,
  `/api/cash-flow`, `/api/job-costing`, `/api/budget-variance`. UI:
  `/profit-center`, `/budget-variance`.

- **H7: Material Reconciliation + Cost Control**: Per BOQ item
  reconciliation: required (BOQ) vs issued (MaterialIssue) vs consumed
  (MB entries) vs physical stock (StockLocationItem). Wastage %
  = (consumed - required) / required × 100. Tolerance-based alerts
  (default 5% → WARNING, 2× tolerance → CRITICAL). Site-wise stock
  valuation (per location: qty × MAC = value, sorted by value).
  Service: `@nirman/services`/`reconciliation.ts`. API:
  `/api/material-reconciliation`, `/api/site-stock-valuation`. UI:
  `/material-reconciliation`.

- **Schema additions**: `RateContract` model (supplier+material+rate+
  validity+min/max qty+totalReleasedQty+status ACTIVE/EXPIRED/CANCELLED).
  `Company` fields: `poApprovalThresholdManager` (default ₹50K),
  `poApprovalThresholdAdmin` (default ₹5L). `AssetSale` back-relation
  to `BuiltUnit` (was missing — `builtUnitId` existed but no relation).
  `BuiltUnit` back-relation `assetSales`. All back-relations added to
  `Supplier`, `Material`, `User` for `RateContract`.
