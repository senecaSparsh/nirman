# Nirman Inventory OS — Delivery Roadmap

## North star

One ERP that integrates **Inventory + Accounts + HR** across **as many
companies as the user needs**, organized into a configurable parent-child
hierarchy. Two inventory domains coexist under the same roof:

1. **Raw Material / Manufacturing** — central store, department-wise
   (cost-center) consumption, MAC costing, procurement, GL. Models the
   real Testify Overseas rice-mill paper trail.
2. **Real Estate / Construction** — land, parcels, built units,
   cost-per-sqft allocation, sales, customers. Models the original
   "Nirman Constructions" use case.

The user can create companies, nest them (Admin → Sub-admin → Sub-sub-
admin at the entity level), switch between them, and manage per-company
memberships and roles.

---

## What's built and verified (as of this commit)

| Module | State |
|---|---|
| **Multi-company** | Company hierarchy (parent/child), switcher, membership management, per-company role scoping. `getCompany()` honors a cookie + membership. |
| **Cost-center inventory** | Department master, `StockLocationType.DEPARTMENT`, `issueMaterialsToDepartment()`, Cost-Center Consumption report (digital version of the PDF "Stock Issue Summary"). |
| **Real-estate inventory** | Land purchase + parcel + partition (atomic, geometry-validated), built units, cost-per-sqft allocation, valuation. |
| **Stock ledger** | Immutable `StockMovement` + atomic `StockLocationItem` updates. MAC costing (8 unit tests). Transfers, stock counts, reconciliation. |
| **Procurement** | Requisitions (with auto-generation from reorder points), PO lifecycle (DRAFT→APPROVED→ORDERED→PARTIAL→RECEIVED), goods receipt, supplier returns. Procurement routing (LCI) for company vs. project receiving. **Comparative Quote Engine** — purchasers upload ≥3 vendor quotes (PDF/image), system flags the cheapest by landed total, approver selects the winner (with override+reason), line costs auto-fill from the winning quote on PO conversion. Min-quotes gate with waiver for emergency/single-source buys. |
| **Finance / GL** | Double-entry journal entries wired into every mutation. Chart of accounts (18 system accounts). Trial balance + account ledger. GST (input ITC + output). **Tally ERP sync** — XML voucher generation + pluggable provider. |
| **Sales** | Asset sales (built unit + land), staged payments, customers. |
| **Equipment** | Asset register, assignments, maintenance, retirement, NRV. |
| **Task execution** | SubTasks, comments, activity feed, dependencies, time logs, task detail drawer. |
| **RBAC** | 6 roles, ~27 permissions, additive overrides, multi-company membership. Hierarchical RBAC (Admin → Sub-Admin → Sub-Sub-Admin) with scope-based filtering. |
| **HR / Payroll** | Employee master, attendance (present/absent/half-day/leave), payroll periods with line items (earnings/deductions), leave requests with approval workflow, crews. DPR (Daily Progress Report) with material + labour lines and **multi-tier approval** (Sub-Admin → Admin). |
| **Scrap Generation** | Internally generated scrap / by-product material added to stock at scrap valuation via `SCRAP_GENERATED` movement type. `ScrapGeneration` + `ScrapGenerationLine` audit records with source-material tracking. **Scrap sale as cost recovery** — scrap sale revenue linked to a project reduces that project's total cost (and each unit's `productionCost`) via `reallocateProjectCosts()`. GL credits `ACCT.COST_RECOVERY`. |
| **Standard Consumption Benchmarks** | Per-work-type material consumption norms (e.g. 1.5 t steel / 100 sqft foundation). `StandardConsumption` model with CRUD + variance calculation. UI at `/standard-consumptions`. |
| **Auto-Scrap Detection** | DPR variance analysis: compares actual material consumption vs standard benchmarks by work type. Over-consumption deltas auto-generate `ScrapGeneration` records. `runDprVarianceAnalysis()` + `POST /api/dprs/[id]/variance`. Variance table shown on DPR detail. |
| **Tally ERP Integration** | Generates Tally XML vouchers from journal entries, syncs via pluggable `TallyProvider` (stub for dev). `TallySyncLog` tracks sync status per entry. Batch sync + stats. UI: `TallySyncPanel` on `/gl`. API at `/api/tally/sync`, `/api/tally/log`. |
| **WhatsApp / Notification Alerts** | Pluggable WhatsApp/email/in-app notification system with per-company templates (`{{variable}}` placeholders). Trigger functions for low-stock, task assignment, quote approval. `NotificationTemplate` + `NotificationLog` schema. UI: `NotificationsPanel` on Settings. API at `/api/notifications/{templates,log,test}`. |
| **GPS-Tagged Attendance** | Mobile attendance form captures GPS coordinates via `navigator.geolocation` on check-in. `WorkerAttendance` has `checkInLat/Lng`, `checkOutLat/Lng`, location labels. Bulk attendance API passes GPS fields. |
| **99acres / Portal Listings** | Sync available built units to property portals (99acres, MagicBricks, Housing.com) via pluggable `PortalProvider`. `PortalListing` model with DRAFT→LISTED→DELISTED lifecycle. Push/sync/delist operations. **Auto-delist on sale** — when a unit is marked SOLD, all active portal listings are automatically delisted. UI at `/portal-listings`. API at `/api/portal-listings`. |
| **Per-Unit Material Issuance** | Materials can be issued to a specific built unit (`MaterialIssue.builtUnitId`) — cost goes directly to that unit's `productionCost` instead of area-allocation. `reallocateProjectCosts()` separates project-level costs (area-allocated) from unit-direct costs. UI: unit selector in the issue materials dialog. |
| **WhatsApp Notification Triggers** | Wired into actual workflows: quote selection → purchaser notified, DPR approval → submitter notified, auto-requisition → low-stock alert to managers. `User.phone` field added for WhatsApp delivery. Best-effort (failures don't block operations). |
| **Reports** | Purchase register, issue register, stock movement summary, inventory value, purchase trends, cost-centre consumption, project progress, labour cost, comparative analysis, GST, profit, pending payments, expenses, payroll expense, sales revenue, **purchaser performance** (quotes uploaded, cheapest-selection rate, savings). |
| **Audit log** | Every mutation logs an immutable `AuditLog` entry. |
| **PWA / Field** | Offline mutation queue, service worker, barcode scanning. |
| **Testify seed** | 19 departments, 30 materials, 17 department-wise consumption entries mirroring the PDF's ₹1.49 Cr total. Run via `pnpm --filter @nirman/services seed:testify`. |

**Verification:** typecheck clean, 169 unit tests passing, production
build succeeds.

---

## What's missing — prioritized

### P0 — Gate entry / inbound logging

Real workflow stamps a Gate Entry (security gate register: Gate Entry
No., time, date, vehicle, supplier challan) before the goods reach the
store for GRN. No model exists.

**Needed:** `GateEntry` model with sequential per-fiscal-year
numbering, linked to the eventual `GoodsReceipt`.

### P1 — Fiscal-year document numbering

PO / issue / receipt numbers increment globally via `@unique`. Real
books reset each fiscal year (`P-000052` in May 2022 vs `P-000521` in
Jan 2021).

**Needed:** `FiscalYear` master + a numbering service that scopes
sequences per company + fiscal year.

### P2 — Catalog multi-company isolation

`MaterialCategory.name` is globally unique and `Material` /
`Supplier` have no `companyId`. This forces category-name prefixing
(see the Testify seed's `TO-` prefix) and means two companies share a
material catalog.

**Needed:** add `companyId` to `MaterialCategory`, `Material`, and
`Supplier`; migrate the unique constraints to `@@unique([companyId,
code/name])`. This is a schema migration with data backfill.

### P3 — Tally integration

~~Export voucher/sales/purchase data in Tally-compatible format (XML or
JSON via Tally's API). Requires external Tally credentials for testing.~~

**✅ Built** — `@nirman/services`/`tally.ts` generates Tally XML vouchers
from journal entries and syncs via a pluggable `TallyProvider`. The stub
provider logs XML for development; a real provider would POST to Tally's
HTTP API (port 9000). `TallySyncLog` tracks sync status per entry. UI:
`TallySyncPanel` on `/gl`. To go live: implement `HttpTallyProvider`
with real Tally credentials and test against a Tally instance.

### P4 — 99acres / property portal integration

~~Push built-unit listings to 99acres and other property portals.
Requires external API credentials for testing.~~

**✅ Built** — `@nirman/services`/`portal-listing.ts` syncs built units
to property portals via a pluggable `PortalProvider`. The stub provider
logs listings for development; real providers would call each portal's
REST API. `PortalListing` model with DRAFT→LISTED→DELISTED lifecycle.
UI at `/portal-listings`. To go live: implement real providers for
99acres / MagicBricks / Housing.com with their respective API credentials.

### Previously addressed

- ~~HR / Payroll~~ — ✅ Fully built: Employee, WorkerAttendance,
  PayrollPeriod, PayrollLine, DailyProgressReport, LeaveRequest,
  Crew. DPR multi-tier approval (Sub-Admin → Admin). **GPS-tagged
  attendance** on mobile.
- ~~Comparative Quote Engine~~ — ✅ Built: VendorQuote, VendorQuoteLine,
  cheapest-flagging, winner selection, min-quotes gate with waiver,
  auto-fill line costs on PO conversion.
- ~~Purchaser Performance Report~~ — ✅ Built: per-purchaser metrics
  (quotes uploaded, requisitions handled, cheapest-selection rate,
  total spend, potential savings).
- ~~Scrap / "Create" Material Generation~~ — ✅ Built: ScrapGeneration
  model, SCRAP_GENERATED movement type, isScrap flag on Material.
  **Auto-scrap detection** from DPR variance analysis.
- ~~Standard Consumption Benchmarks~~ — ✅ Built: per-work-type
  consumption norms, variance calculation, auto-scrap detection.
- ~~WhatsApp / Notification Alerts~~ — ✅ Built: pluggable WhatsApp/
  email/in-app notification system with templates and triggers.
- ~~Tally Integration~~ — ✅ Built: Tally XML voucher generation +
  pluggable provider + sync log.
- ~~99acres / Portal Listings~~ — ✅ Built: pluggable portal provider +
  listing lifecycle management.
- ~~Purchase approval tiering (partial)~~ — ✅ The comparative quote
  engine adds a quote-collection gate before PO conversion. Full
  multi-step requisition approval (Purchaser → Store → MD) with
  value-based routing is still open.

---

## How to run

```bash
# 1. Start Postgres (Docker)
docker compose up -d

# 2. Push schema + generate client
pnpm db:generate
pnpm db:push

# 3. Seed the construction demo (Nirman Constructions)
pnpm --filter @nirman/services seed

# 4. Seed the rice-mill reference dataset (Testify Overseas)
pnpm --filter @nirman/services seed:testify

# 5. Run the app
pnpm dev
```

In the app, use the company switcher (top-right) to switch between
"Nirman Constructions" and "Testify Overseas". The Cost-Center
Consumption report (`/reports/department-consumption`) shows the
Testify department-wise data mirroring the PDF.

---

## Construction Execution Layer (H1–H8) — BUILT

The system has been expanded from basic inventory tracking to a
comprehensive construction-industry ERP. All workstreams are implemented
with schema, service layer, API routes, and UI pages:

| Workstream | State |
|---|---|
| **H1: BOQ + WBS + MB** | Hierarchical BOQ (Section→SubSection→LineItem with qty/rate/amount), WBS (Project→Phase→Activity with schedule dates, dependencies, critical path), Measurement Book (DRAFT→VERIFIED→APPROVED workflow), Material Take-Off. UI: `/boq`, `/wbs`, `/measurement-book`. |
| **H2: Subcontractor + RA Bills** | Work orders (scope=BOQ items, agreed rates, retention%, advance, TDS 194C: 1%/2%), RA bills (from MB entries, retention+TDS+advance recovery deductions, payment certificate). UI: `/work-orders`. |
| **H3: Scheduling + EVM** | CPM scheduling (ES/EF/LS/LF, total float, critical path), EVM (PV/EV/AC, CPI/SPI/EAC/VAC), cost overrun forecast per BOQ item. UI: `/project-control`. |
| **H4: Advanced Procurement** | Vendor rating (auto-computed: on-time delivery, quality, price), rate contracts/framework agreements, value-based PO approval routing (<₹50K manager, <₹5L admin, ≥₹5L owner), commitment tracking. UI: `/vendor-ratings`, `/rate-contracts`. |
| **H5: CRM + Sales Workflow** | Payment schedule generation (CLP tied to WBS milestones, TLP, DPP), GST on real estate (1/3 land exempt + 2/3 construction taxable for residential, 1% affordable, 5% non-affordable, 18% commercial), milestone payment auto-due checking. API: `/api/payment-schedules`. |
| **H6: Finance Enhancement** | Project profit centers (per-project P&L with BOQ revenue vs actual cost, margin%, cost/revenue per sqft), cash flow forecasting, job costing (direct+indirect, overhead absorption), budget variance (BOQ budget vs actual by line item). UI: `/profit-center`, `/budget-variance`. |
| **H7: Material Reconciliation** | Per BOQ item: required vs issued vs consumed vs physical stock, wastage%, tolerance-based alerts (WARNING at 5%, CRITICAL at 10%), site-wise stock valuation. UI: `/material-reconciliation`. |

### New schema models

- `BoqItem`, `BoqItemType`, `BoqStatus`
- `WbsNode`, `WbsNodeType`, `WbsStatus`, `WbsDependency`, `WbsDependencyType`
- `MbEntry`, `MbEntryStatus`
- `SubcontractorWorkOrder`, `SubcontractorWorkOrderLine`, `RaBill`, `RaBillLine`
- `PaymentSchedule`, `PaymentScheduleItem`, `PaymentScheduleType`, `PaymentScheduleItemStatus`
- `RateContract`, `RateContractStatus`
- `Company` fields: `poApprovalThresholdManager`, `poApprovalThresholdAdmin`
- `AssetSale` relation: `builtUnit` (was missing — `builtUnitId` existed but no relation)

### New services

- `@nirman/services`/`boq.ts` — BOQ CRUD + tree building + MTO generation
- `@nirman/services`/`subcontractor.ts` — work orders + RA bills + TDS + retention
- `@nirman/services`/`scheduling.ts` — CPM scheduling + EVM + cost overrun forecast
- `@nirman/services`/`procurement-advanced.ts` — vendor rating + rate contracts + approval routing + commitments
- `@nirman/services`/`crm.ts` — payment schedules + GST on real estate + milestone payments
- `@nirman/services`/`finance-advanced.ts` — profit centers + cash flow + job costing + budget variance
- `@nirman/services`/`reconciliation.ts` — material reconciliation + site stock valuation

### New API routes

- `/api/boq/{items,tree}`, `/api/wbs/{nodes,tree,dependencies}`, `/api/mb-entries`
- `/api/work-orders`, `/api/work-orders/[id]`
- `/api/evm`, `/api/cost-overrun`, `/api/node-evm`, `/api/schedule`, `/api/material-take-off`
- `/api/vendor-ratings`, `/api/rate-contracts`, `/api/approval-routing`, `/api/project-commitments`
- `/api/payment-schedules`, `/api/payment-schedules/items/[id]/pay`, `/api/milestone-payments/check`
- `/api/profit-center`, `/api/cash-flow`, `/api/job-costing`, `/api/budget-variance`
- `/api/material-reconciliation`, `/api/site-stock-valuation`

### New UI pages

- `/boq` — hierarchical BOQ tree with inline add/edit/delete
- `/wbs` — WBS tree with schedule dates, progress bars, critical path flags
- `/measurement-book` — MB entries with verify/approve/reject workflow
- `/work-orders` — subcontractor work orders with RA bill tracking
- `/project-control` — EVM dashboard + cost overrun forecast + MTO + commitments
- `/vendor-ratings` — auto-computed supplier scorecards
- `/rate-contracts` — framework agreement management
- `/profit-center` — per-project P&L with cost breakdown
- `/budget-variance` — BOQ budget vs actual with overrun flags
- `/material-reconciliation` — required vs issued vs consumed vs stock with wastage alerts
