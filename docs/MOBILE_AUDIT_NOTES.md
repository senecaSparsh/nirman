# Mobile App Audit Notes — Wayfinder + Gauntlet Loop

## Audit Progress Bookmark
- Spec document: `AGENTS.md`
- Last completed section: §6 (Construction Execution Layer)
- Next section: NONE — audit complete
- Total sections: 6
- Sections audited: 6/6
- Audit scope: mobile app (`/m/*` routes, mobile components, mobile API chains)
- Dev server: http://localhost:3000 (AUTH_BYPASS=true)
- Status: COMPLETE — all pages 200, 0 typecheck errors, 0 lint errors, 194/194 tests pass

## Section Map
- §1: Commands (lines 3–10)
- §2: Conventions (lines 12–355) — largest section, many sub-claims
- §3: Package Layout (lines 357–363)
- §4: Gotchas (lines 365–392)
- §5: Design System (lines 396–530)
- §6: Construction Execution Layer H1–H8 (lines 531–622)

---

## Audit Log

### §1. Commands — GAUNTLET VERDICT
Claims verified: 7 | CONFIRMED: 7 | DISCREPANCIES: 0

INFRASTRUCTURE NOTE: vitest config points to `nirman_inventory_test` DB which does not exist.
22 integration tests fail (DB connection). 169 pure unit tests pass.
Fix: `createdb nirman_inventory_test && pnpm --filter @nirman/db push` (needs separate env).

### §2. Conventions — GAUNTLET VERDICT (partial — core conventions)
Claims verified: 20+ | CONFIRMED: 19 | DISCREPANCIES: 1 (MAJOR: 1)

DISCREPANCIES:
1. [MAJOR] /m/scrap-generations/[id]/page.tsx — No company scoping on Prisma query.
   Expected: filter by `companyId` via `getCompany()` (multi-tenant rule).
   Actual: `findUnique({ where: { id } })` — cross-company data leak possible.
   FIX APPLIED: Changed to `findFirst({ where: { id, companyId: company.id } })` + added `getCompany()` import.

CONFIRMED:
- schema.prisma at correct path, @nirman/db exports prisma + types ✓
- Decimal(14,2) for money (141 fields), Decimal(14,3) for quantities (44 fields) ✓
- recordMovement/recordTransfer in stock-ledger.ts, Serializable transaction ✓
- StockMovement + StockLocationItem models exist ✓
- movingAvgCost field, computeMovingAverageCost function, 8 unit tests ✓
- reallocateProjectCosts, costPerSqft on Project, productionCost on BuiltUnit ✓
- MaterialIssue.builtUnitId for per-unit issuance ✓
- All 10 master entities have deletedAt ✓
- procurementScope on PurchaseOrder ✓
- LandPartition model + PARTITIONED status ✓
- All 13 mobile API routes have requirePermission/requireUser ✓
- All 10 mobile list pages use connection() + Suspense ✓
- 6 roles, 44+ permissions in roles.ts ✓
- 65/88 mobile pages use getUserRole/hasPermission/getCompany (23 are redirects/client components) ✓
- logAction in 38 service files, 146 calls ✓
- postJournalEntry + 8 domain GL helpers all exist ✓
- 26 GL accounts in ACCT const ✓
- DPR approval: 4 functions (subAdminApprove/adminApprove/reject/resubmit) ✓
- GPS attendance: "Capture GPS location" button, enableHighAccuracy:true, timeout:10000 ✓
- Portal listing: create/sync/delist functions exist ✓

### §3. Package Layout — GAUNTLET VERDICT
Claims verified: 3 | CONFIRMED: 3 | DISCREPANCIES: 0
- packages/db: schema.prisma + prisma export + types export ✓
- packages/services: stock-ledger.ts (recordMovement/recordTransfer) + valuation.ts (materialInventoryValue/unsoldAssetValue/projectPnl/reallocateProjectCosts) ✓
- apps/web: API routes under app/api/ (90+ route dirs), auth.ts exists ✓

### §4. Gotchas — GAUNTLET VERDICT
Claims verified: 7 | CONFIRMED: 7 | DISCREPANCIES: 0
- Postgres port 5433 in docker-compose (5433:5432 mapping) ✓
- .env uses port 5432 (native Postgres, not Docker) — configuration note, not discrepancy
- cacheComponents: true in next.config.ts (PPR enabled) ✓
- No force-dynamic on any mobile page (correct for Next 16 PPR) ✓
- 65 mobile pages use connection() + Suspense pattern ✓
- Default exports are sync, async children in Suspense (PPR-safe) ✓
- PageLoading component exists at components/page-loading.tsx ✓
- formatCurrency/formatNumber/formatDate in lib/utils.ts ✓

### §5. Design System — GAUNTLET VERDICT
Claims verified: 19 | CONFIRMED: 16 | DISCREPANCIES: 3 (MAJOR: 0, MINOR: 3)

DISCREPANCIES:
1. [MINOR] Spec says "six worlds" but nav.ts has 4 worlds (today, build, hr, finance).
   Expected: 6 worlds (Today, Materials, Property, People, Money, Insights) + Setup.
   Actual: 4 worlds — Materials+Property consolidated into "build", Money+Insights into "finance".
   Note: Intentional redesign documented in nav.ts comment "4 worlds + settings gear". Spec is stale.

2. [MINOR] Spec says "five tabs" per persona but executive has 4, sales has 4.
   Expected: 5 tabs per persona.
   Actual: executive=4 (Today, Approvals, Insights, More), sales=4 (Units, Customers, Sales, Me).

3. [MINOR] EmptyState and NoAccess are in separate files (empty-state.tsx, no-access.tsx),
   not in @/components/page.tsx as the spec implies ("Build pages from these").
   Actual: They exist but in separate files. Functionally equivalent.

CONFIRMED:
- All 6 helper functions exist (worldsFor, linksFor, worldForPath, linkForPath, homeWorldFor, badgeLinksFor) ✓
- All layout vocabulary components exist (Page, Section, Toolbar, MetricGrid, Metric, Figure, StatusPill, Hint, PageHeader) ✓
- statusColor/statusMeaning/humanStatus in @/components/page.tsx ✓
- 56px rows (min-h-14) in mobile primitives ✓
- Focus ring: 2px solid var(--color-ring) which is oklch(0.635 0.155 55) — amber/ochre ✓
- tabColor() function in mobile-nav.ts ✓
- PERSONAS with 5 persona types (executive, ops, field, sales, finance) ✓

### §6. Construction Execution Layer H1–H8 — GAUNTLET VERDICT
Claims verified: 8 | CONFIRMED: 7 | DISCREPANCIES: 1 (MINOR: 1)

DISCREPANCIES:
1. [MINOR] Spec says model name is `MbEntry` but actual model is `MeasurementBookEntry`.
   Expected: `MbEntry` (per AGENTS.md line 539).
   Actual: `MeasurementBookEntry` (schema.prisma line 3140). API uses `prisma.measurementBookEntry`.
   Note: Functional — just a naming discrepancy between spec and code.

CONFIRMED:
- H1: BoqItem, WbsNode, WbsDependency models exist ✓ (MbEntry → MeasurementBookEntry, minor name diff)
- H1: boq.ts + scheduling.ts services exist ✓
- H1: All 11 API endpoints exist (/api/boq/items, /api/boq/tree, /api/wbs/nodes, /api/wbs/tree,
  /api/wbs/dependencies, /api/mb-entries, /api/material-take-off, /api/evm, /api/cost-overrun,
  /api/node-evm, /api/schedule) ✓
- H2: SubcontractorWorkOrder, SubcontractorWorkOrderLine, RaBill, RaBillLine models exist ✓
- H2: subcontractor.ts service + /api/work-orders endpoint exist ✓
- H4: RateContract model exists ✓
- H4: Company.poApprovalThresholdManager + poApprovalThresholdAdmin fields exist ✓
- H4: procurement-advanced.ts + all 4 APIs (vendor-ratings, rate-contracts, approval-routing, project-commitments) ✓
- H5: crm.ts service + /api/payment-schedules + /api/milestone-payments/check exist ✓
- H6: finance-advanced.ts + all 4 APIs (profit-center, cash-flow, job-costing, budget-variance) ✓
- H7: reconciliation.ts + both APIs (material-reconciliation, site-stock-valuation) ✓
- H8: AssetSale.builtUnitId field exists (back-relation to BuiltUnit) ✓

---

## FINAL AUDIT SUMMARY

Total claims verified: 64
- CONFIRMED: 59
- DISCREPANCIES: 5 (MAJOR: 1, MINOR: 4)
- AMBIGUOUS: 0

### Discrepancies (ranked by severity):

1. [MAJOR] /m/scrap-generations/[id]/page.tsx — No company scoping on Prisma query.
   Expected: filter by companyId via getCompany() (multi-tenant rule).
   Actual: findUnique({ where: { id } }) — cross-company data leak possible.
   STATUS: **FIXED** — Changed to findFirst({ where: { id, companyId: company.id } }).

2. [MINOR] Spec says "six worlds" but nav.ts has 4 worlds (intentional redesign, spec is stale).
3. [MINOR] Spec says "five tabs" per persona but executive and sales have 4 tabs.
4. [MINOR] EmptyState/NoAccess in separate files, not in @/components/page.tsx as spec implies.
5. [MINOR] Spec says `MbEntry` model but actual name is `MeasurementBookEntry`.

### Infrastructure Notes:
- Test database `nirman_inventory_test` does not exist — 22 integration tests fail.
  169 pure unit tests pass. Fix: `createdb nirman_inventory_test && pnpm --filter @nirman/db push`.
- .env uses port 5432 (native Postgres), docker-compose maps 5433:5432. Not a discrepancy.

### Post-Audit Functional Testing — 6 More Bugs Found & Fixed

After the spec audit, deep functional testing of all mobile form/approval chains found 6 additional bugs:

1. [MAJOR] **Attendance 500 on time-only checkIn/checkOut** — `new Date("09:00")` = Invalid Date.
   FIX: Added `combineTimeWithDate()` helper in hr.ts that combines time-only strings with the attendance date.
   Files: packages/services/src/hr.ts, apps/web/src/app/api/attendance/route.ts

2. [MAJOR] **Attendance date filter timezone mismatch** — `?date=2026-08-13` couldn't find records stored on that date.
   FIX: Changed GET handler to use UTC date range `{ gte: "2026-08-13T00:00:00.000Z", lte: "2026-08-13T23:59:59.999Z" }`.
   Files: apps/web/src/app/api/attendance/route.ts

3. [MAJOR] **DPR timezone offset** — `startOfDay()` shifted dates back 1 day in IST. DPR for Aug 14 stored as Aug 13.
   FIX: Added `dateOnlyUTC()` helper that creates UTC-midnight Date for `@db.Date` columns. Used in both DPR and attendance paths.
   Files: packages/services/src/hr.ts

4. [MEDIUM] **DPR reject field name mismatch** — DPR reject expected `body.reason` but requisition reject used `body.rejectReason`. Inconsistent API.
   FIX: Accept both `body.reason` and `body.rejectReason` in DPR reject handler.
   Files: apps/web/src/app/api/dprs/[id]/route.ts

5. [MEDIUM] **DPR upsert doesn't reset approvalStatus** — Re-submitting a DPR for a date that already had an APPROVED DPR kept the old status.
   FIX: Reset `approvalStatus` to `SUBMITTED` and clear all approval fields on upsert.
   Files: packages/services/src/hr.ts

6. [LOW] **Material sale cancel only accepted POST, not PATCH** — All other action endpoints use PATCH.
   FIX: Added PATCH handler alias for cancel action.
   Files: apps/web/src/app/api/material-sales/[id]/route.ts

### Lint Errors Fixed (11 total)

1. MobileDprsList.tsx — useMemo called after early return (rules-of-hooks)
2. MobileLandDetailClient.tsx — 3 hooks called after early return + native confirm() → useConfirm hook
3. MobileProcurementList.tsx — `<a>` element → `<Link>` for internal navigation
4. MobileNewProcurementClient.tsx — setState in useMemo → moved to useEffect
5. home/page.tsx — `any` type → proper typed parameter
6. inventory-interactive.tsx — empty object type `{}` → no params
7. pulse/attention/page.tsx — unescaped `'` → `&apos;`
8. settings/notifications/page.tsx — variable accessed before declaration → moved function above useEffect

### Documentation Drift Fixed (4 items in AGENTS.md)

1. "six worlds" → "four worlds + settings" (nav.ts was redesigned)
2. "five tabs per persona" → "4-5 tabs per persona" (executive/sales have 4)
3. `MbEntry` model name → `MeasurementBookEntry` (actual name)
4. EmptyState/NoAccess location → clarified they're in separate files

### Final Verification
- All 89 mobile pages: 200 (71 static + 18 dynamic with real IDs)
- Typecheck: 0 errors
- Lint: 0 errors (139 warnings — unused imports, non-blocking)
- Tests: 194/194 pass (16 test files)
- Test database: created nirman_inventory_test, schema pushed
