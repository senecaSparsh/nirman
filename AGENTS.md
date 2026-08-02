# Nirman Inventory OS — Agent Guide

## Commands

- `pnpm dev` — run web dev server (Turbopack). Uses port 3000, falls back to 3001.
- `pnpm build` / `pnpm lint` / `pnpm typecheck` — workspace-wide via Turbo.
- `pnpm db:generate` — regenerate Prisma client after schema changes.
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
  costs / land purchases change.
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
- **RBAC**: 6 roles (OWNER, ADMIN, MANAGER, SUPERVISOR, SALES, ACCOUNTANT) with
  a View+Manage permission matrix in `@/lib/roles.ts`. ~25 permissions covering
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
  `GlAccount` (13 system accounts: 7 asset, 2 liability, 1 equity, 1 revenue,
  2 expense). Account codes are in the `ACCT` const. Input GST (ITC) is debited
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
- **PWA / Field receiving**: `/field` page + `FieldReceive` client component
  with BarcodeDetector camera scanning + offline mutation queue
  (`@/lib/offline/queue`). Service worker at `public/sw.js`, registered by
  `SwRegister` in the root layout (production only). Manifest at
  `public/manifest.webmanifest`.
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
