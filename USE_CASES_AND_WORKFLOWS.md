# Nirman Inventory OS — Use Cases & Real-World Workflows

> **Purpose**: This document is the single reference for what the Nirman Inventory OS business logic is designed to handle, and how the real-world workflows of a construction + real-estate + manufacturing conglomerate map to the system.
>
> **Sources**: `AGENTS.md`, `DECISIONS.md`, `BUSINESS_ANALYSIS.md`, `docs/source-material/USER_SESSION_BUSINESS_LOGIC.md`, `packages/db/prisma/schema.prisma`, `packages/services/src/*`, `apps/web/src/lib/nav.ts`, and the full API surface.
>
> **Scope**: The system is intentionally designed for a **conglomerate with two inventory halves**:
> 1. **Construction / Real Estate** (Projects, Land, Built Units, Sales, Rentals)
> 2. **Manufacturing / Processing** (Testify Overseas-style raw-material cost-centre consumption)
>
> **Status model**: The codebase is modeled at ~100% of the business schema and ~80% of the service layer. This document reflects the *intended* capabilities, not only the currently wired UI.

---

## Table of Contents

1. [Cross-Cutting Capabilities](#1-cross-cutting-capabilities)
2. [Today / Identity / Attention](#2-today--identity--attention)
3. [Build World — Asset Lifecycle](#3-build-world--asset-lifecycle)
   - 3.1 Acquire (Land, Suppliers, Rate Contracts)
   - 3.2 Procure (Indents, Quotations, PO, GRN, Returns)
   - 3.3 Stock (Ledger, Material, Equipment, Gate Pass, Scrap, Counts)
   - 3.4 Construct (Projects, BOQ, WBS, MB, Work Orders, QC, Safety)
   - 3.5 Sell (Units, Sales, Brokers, Rentals, Material Sales, CRM)
4. [People World — HR & Field](#4-people-world--hr--field)
5. [Books World — Finance & Accounts](#5-books-world--finance--accounts)
6. [Settings & Administration](#6-settings--administration)
7. [Integrations & External Channels](#7-integrations--external-channels)
8. [Real-World Constraints & Edge Cases](#8-real-world-constraints--edge-cases)

---

## 1. Cross-Cutting Capabilities

### 1.1 Multi-Company / Group Structure

**Real-world scenario**: A promoter runs multiple SPVs — one per project, one for the rice mill, one for the trading business. Officers need to switch context without logging out.

**Use cases**:
- **UC-COMP-01: Create and manage companies** — Owner/Admin adds a `Company` (or child company with `parentCompanyId` for group hierarchies). Each company has its own chart of accounts, stock locations, projects, users, and books.
- **UC-COMP-02: Switch active company** — Users with `UserCompany` memberships in multiple companies switch via the world rail; the middleware and `getCompany()` scope all queries to the active company.
- **UC-COMP-03: Inter-company stock transfers (STO)** — Material moves from one company’s warehouse to another. The system computes a **transfer price** (source MAC + freight + handling + markup), posts TRANSFER_OUT at source MAC and TRANSFER_IN at transfer price, and both companies see the same STO.
- **UC-COMP-04: Consolidated group reporting** (planned) — Parent company can request trial balance / P&L rollups across subsidiaries.

**Business rules enforced**:
- Every transaction is scoped to a `companyId`.
- Inter-company STOs require `STOCK_TRANSFER` permission in the source company.
- Destination lists span the company group (current + siblings/parent/children).

---

### 1.2 Role-Based Access Control (RBAC) — 5-Tier + 3-Tier Hierarchy

**Real-world scenario**: The owner thinks in **delegation depth**: Admin → Sub-admin (Managers) → Sub-sub-admin (Supervisors). A supervisor can see only his site; a manager sees her department; the owner sees everything.

**Use cases**:
- **UC-RBAC-01: Account creation by senior only** — A user can only be created by a role strictly higher in the hierarchy (OWNER/ADMIN → Tier 2 → Tier 3 → Tier 4 → Tier 5). Tier 5 cannot create accounts.
- **UC-RBAC-02: Assign scope to a membership** — `UserCompany.scopeType` is `COMPANY`, `DEPARTMENT`, or `PROJECT`. A PROJECT-scoped supervisor sees only assigned `projectId`s; a DEPARTMENT-scoped manager sees only assigned `departmentId`s.
- **UC-RBAC-03: Permission overrides** — `RolePermission` table grants additive per-user exceptions (e.g., give a SITE_ENGINEER access to approve POs above threshold).
- **UC-RBAC-04: Role change audit** — Every `USER_ROLE_CHANGE`, `USER_ACTIVATE`, `USER_DEACTIVATE` writes an `AuditLog` with before/after state.

**Business rules enforced**:
- `canAssignRole(actor, target)` forbids self-cloning and peer creation except OWNER↔ADMIN.
- OWNER/ADMIN are always `COMPANY` scoped and cannot be scoped down.
- Project list filters apply `getUserScope()` first, falling back to `ProjectAssignment`.

---

### 1.3 Audit Trail & Immutable Transactional Records

**Real-world scenario**: Construction is a high-dispute, high-compliance industry. Every material movement, cost change, and approval must be reconstructible for audits and courts.

**Use cases**:
- **UC-AUDIT-01: Per-mutation audit logging** — `logAction()` is wrapped inside the same Serializable transaction as every business mutation (PO, requisition, stock, sale, payroll, land, etc.).
- **UC-AUDIT-02: Before/after diffs** — `AuditLog` captures `before` and `after` JSON for role changes and sensitive edits.
- **UC-AUDIT-03: Trial balance tie-out** — GL journal entries are posted inside the same transaction as the source event, so the books never diverge from physical reality.
- **UC-AUDIT-04: Soft-delete only** — Master entities (`Company`, `Project`, `Supplier`, `Material`, `LandPurchase`, `BuiltUnit`) are never hard-deleted; `deletedAt` is set and all list queries filter `deletedAt: null`.

---

### 1.4 Document & Attachment Infrastructure

**Real-world scenario**: Real estate is a document business. Registry, BBA, NOCs, cheques, and gate passes must all attach to the exact transaction they support.

**Use cases**:
- **UC-DOC-01: Generic entity attachments** — `EntityAttachment` is polymorphic (any entity type + entityId + uploadId). No special-cased upload code per module.
- **UC-DOC-02: Document-driven stage gates** — Sale registry is not “complete” until the registry document is uploaded. Land possession is toggled with an uploaded document.
- **UC-DOC-03: Cheque photo evidence** — Sales/rent/land payments support `chequePhotoUrl`, `paymentMode`, and `bank` fields because cheques can bounce and the image is evidence until clearance.
- **UC-DOC-04: OCR ingestion** — Field users can photograph a DPR / challan / invoice and the OCR pipeline (OpenAI Vision / Google Vision / Azure DI / stub) extracts structured data for editing.

---

## 2. Today / Identity / Attention

### 2.1 User Identity & Authentication

**Real-world scenario**: Field staff use shared company phones, office staff use desktop. Owner and accountants need one-click access to their world.

**Use cases**:
- **UC-AUTH-01: Email + password sign-in** — Better-Auth with Prisma adapter; middleware redirects unauthenticated non-public routes to `/sign-in`.
- **UC-AUTH-02: Phone OTP sign-in** — `POST /api/auth/phone-otp/send` and `verify` for mobile-first users.
- **UC-AUTH-03: Demo logins per role** — `/sign-in` shows one-click buttons for each demo role (`amit@nirman.in` OWNER, `ravi@nirman.in` SUPERVISOR, etc.), all password `nirman123`.
- **UC-AUTH-04: Company scoping after login** — `getSession()` returns `companyId`; `getCompany()` selects the active company for all server queries.

### 2.2 “Today” Dashboard

**Use cases**:
- **UC-TODAY-01: Role-based home landing** — `homeWorldFor(role)` routes SUPERVISOR to People, ACCOUNTANT to Books, SALES to Build/Sell.
- **UC-TODAY-02: Attention queue** — `/approvals` shows pending POs and requisitions in one queue for approvers.
- **UC-TODAY-03: My Tasks** — `/my-tasks` shows assigned tasks with subtask progress, time logs, and dependencies.
- **UC-TODAY-04: Call log visibility** — `/calls` shows every call on company numbers with recordings, notes, dispositions, and analytics.

---

## 3. Build World — Asset Lifecycle

The Build world is the core pipeline: **Acquire → Procure → Stock → Construct → Sell**. It covers both construction/real-estate and manufacturing cost-centre consumption.

---

### 3.1 Acquire

#### 3.1.1 Land Purchase & Holding

**Real-world scenario**: A builder buys land *before* a project exists. Land can be standalone, held for sale, or later converted to a project. Costs include base price, one-time/yearly lease rent, GST, registration, and stamp duty — all percentages with manual override.

**Use cases**:
- **UC-LAND-01: Record a land purchase** — Capture `LandPurchase` with `landType` (FREEHOLD / LEASEHOLD), `purchaseMode` (WHOLE / SUBDIVIDED), area, base cost, and percentage-based add-ons.
- **UC-LAND-02: Cost breakup with percentage override** — Each component (lease rent, GST, registration, stamp duty) is X% of Y = Z, with manual amount override per deal.
- **UC-LAND-03: Recurring land costs** — Add one-time or recurring `LandCostComponent`s (yearly lease rent, maintenance, future EDC/IDC) with accrual. `recomputeLandTotalCost()` posts the delta to GL as time passes.
- **UC-LAND-04: Possession tracking** — `isPossessed` + `possessionDate` toggled with document upload.
- **UC-LAND-05: Convert land to project** — Action “Create Project on this Land” pre-fills `Project.landId`.
- **UC-LAND-06: Purchase lifecycle** — Land purchase goes BOOKED → (Agreement/BBA optional) → Registry → COMPLETED, with document uploads per stage and partial-payment registry support.

**Business rules enforced**:
- Lease rent is one-time OR yearly; both options exist.
- GST/registration/stamp duty are manual percentages (vary by state/deal).
- `totalCost` = fixed cost-breakup columns + Σ posted `LandCostComponent` amounts.
- Recurring accruals update lazily on land detail GET.

#### 3.1.2 Land Partition / Subdivision

**Real-world scenario**: A 1000 sq.yd. parcel is split into sellable plots (1A, 1B, 1C) of 100, 200, 300, 400 sq.yd. Each child has its own valuation, asking price, and status.

**Use cases**:
- **UC-PARTITION-01: Atomic partition** — Validate Σ child area = parent area, create `LandParcel` children, set parent `status = PARTITIONED`, record `LandPartition`.
- **UC-PARTITION-02: Per-plot valuation & asking price** — Capture `currentValuation` and `askingPrice` for each child at partition time.
- **UC-PARTITION-03: Owner-only un-partition** — Only OWNER/ADMIN can undo subdivision; children are removed, parent becomes AVAILABLE again.
- **UC-PARTITION-04: Reprice acquisition cost pro-rata** — On land cost changes, `recomputeLandTotalCost()` reprices whole vs subdivided parcels.

**Business rules enforced**:
- Subdivided plots cannot host a project; only un-subdivided land can.
- Child status tracks Available / Sold / Rented.
- Atomic transaction: no partial subdivisions.

#### 3.1.3 Suppliers & Rate Contracts

**Real-world scenario**: A supplier like “Cement House” is created once, company-wide. Rates can be pre-negotiated in a framework agreement so POs auto-fill prices.

**Use cases**:
- **UC-SUPP-01: Supplier master** — Create `Supplier` with name, GST (optional), contact, bank. Suppliers are company-wide, not material-specific.
- **UC-SUPP-02: Bulk import** — Excel upload of existing supplier lists.
- **UC-SUPP-03: Vendor rating** — Auto-computed: 40% on-time delivery + 30% quality acceptance + 30% price competitiveness.
- **UC-SUPP-04: Rate contract** — `RateContract` links supplier + material + agreed rate + validity + min/max qty. Expired contracts auto-expire; PO creation auto-fills active rates.

#### 3.1.4 Legal Permissions / NOCs

**Real-world scenario**: Before starting construction, the builder needs map sanction, fire NOC, airport NOC, pollution NOC, etc. Each has a status, document, and expiry date.

**Use cases**:
- **UC-LEGAL-01: Track permission on land or project** — `LegalDocument` attaches to `landId` or `projectId` with `LegalDocType` and `LegalDocStatus` (PENDING / APPROVED / EXPIRED / RENEWAL_DUE).
- **UC-LEGAL-02: Expiry alerts** — Dashboard badges and `/api/legal-documents?status=EXPIRED,RENEWAL_DUE` surface expiring permissions.
- **UC-LEGAL-03: Document upload per permission** — Map sanction, fire, airport, CLA, building permission, completion/occupancy certificates.

---

### 3.2 Procure

#### 3.2.1 Material Indents (Requisitions)

**Real-world scenario**: The site supervisor runs out of cement. He raises an indent from the field. The indent shows current closing stock, last supplier, and last rate for reference.

**Use cases**:
- **UC-REQ-01: Raise a material requisition** — `MaterialRequisition` with project/site, required by date, lines with material + qty.
- **UC-REQ-02: Reference data at raise-time** — Inline current closing stock, last supplier, last rate/date so the supervisor doesn’t over-ask.
- **UC-REQ-03: 3-tier approval (purchaser → store → MD)** — Status `DRAFT → SUBMITTED → APPROVED`. Value-based thresholds (e.g., MD signature optional below ₹X) are planned/configurable.
- **UC-REQ-04: Auto-requisition from reorder point** — When total stock ≤ `material.reorderPoint`, `generateAutoRequisition()` raises a DRAFT indent, batches all due materials, de-duplicates against open requisitions.

**Business rules enforced**:
- Requisition status gates: cannot convert to PO until APPROVED.
- `requisition.approve` permission required for approval.

#### 3.2.2 Comparative Quotations

**Real-world scenario**: The purchaser must collect at least 3 vendor quotes for each indent. The system flags the cheapest by *landed* cost (price + GST + freight + handling). The manager approves the winner.

**Use cases**:
- **UC-QUOTE-01: Collect vendor quotes** — Upload PDF/image of each quote with per-line unit price, GST, freight, handling.
- **UC-QUOTE-02: Cheapest-by-landed analysis** — `unitLandedCost = unitPrice + (unitPrice × gstRate/100) + freightPerUnit + handlingPerUnit`.
- **UC-QUOTE-03: Override cheapest with reason** — Approver can pick a non-cheapest quote but must record a reason.
- **UC-QUOTE-04: Waiver of minimum quotes** — Approver can waive the ≥3 quote requirement with reason.
- **UC-QUOTE-05: Auto-fill PO from winning quote** — Convert-to-PO pre-fills supplier, rates, and line costs from the selected `VendorQuote`.
- **UC-QUOTE-06: Standalone quotation requests** — Create `QuotationRequest` not tied to a requisition; HSN/GST auto-fetched; hierarchical manager approval.

**Business rules enforced**:
- Default `minQuotesRequired = 3`; configurable per requisition.
- PO conversion blocked until `isQuoteGateSatisfied()` is true or waived.
- Purchaser performance metrics: cheapest-selection rate, potential savings.

#### 3.2.3 Purchase Orders (PO)

**Real-world scenario**: After quotation approval, the final PO is sent to the selected vendor. POs are value-based approval-routed and fiscally numbered.

**Use cases**:
- **UC-PO-01: Create PO from approved requisition / quote** — `PurchaseOrder` with supplier, delivery `procurementScope` (COMPANY warehouse vs PROJECT site), lines, charges.
- **UC-PO-02: PO status lifecycle** — `DRAFT → APPROVED → ORDERED → PARTIAL → RECEIVED → CANCELLED`.
- **UC-PO-03: Value-based approval routing** — Default thresholds: <₹50K manager, <₹5L admin, ≥₹5L owner. Configurable per company via `poApprovalThresholdManager` / `poApprovalThresholdAdmin`.
- **UC-PO-04: Commitment tracking** — Open requisitions + open POs = `projectCommitments`, used in cash flow and EVM.
- **UC-PO-05: Fiscal-year numbering** — PO/GRN/issue numbers reset per fiscal year (in progress).

**Business rules enforced**:
- `po.approve` permission for APPROVED status.
- `procurementScope` is mandatory: COMPANY → receive to company warehouse; PROJECT → receive to project site.

#### 3.2.4 Goods Receipt (GRN) & Gate Entry

**Real-world scenario**: A cement truck arrives. Security stamps the gate register first. The store keeper then scans the challan and makes the GRN. Barcode scanning is available offline on the field phone.

**Use cases**:
- **UC-GATE-01: Security gate entry** — `GatePass` (or `GateEntry`) records inbound vehicle, supplier, challan number, and time before the truck reaches the store.
- **UC-GRN-01: GRN with lot tracking** — `GoodsReceipt` + `GoodsReceiptLine` create `MaterialLot`s; quality inspection status recorded.
- **UC-GRN-02: Barcode / camera scanning** — PWA `/field` uses BarcodeDetector and offline mutation queue.
- **UC-GRN-03: Three-way match foundation** — GRN qty/amount feeds supplier invoice matching.

**Business rules enforced**:
- `recordMovement()` for IN at the receipt unit cost; MAC recalculated.
- Input GST (ITC) debited to GL at receipt.

#### 3.2.5 Supplier Returns (Debit Notes)

**Real-world scenario**: Excess or defective cement is sent back. A debit note is raised and GL adjusts.

**Use cases**:
- **UC-SRET-01: Create supplier return** — `SupplierReturn` lines reference the GRN/lot and qty.
- **UC-SRET-02: Approve and complete return** — Status `DRAFT → SUBMITTED → COMPLETED / CANCELLED`.
- **UC-SRET-03: GL posting** — `postSupplierReturn()` credits stock and adjusts GST/liability.

---

### 3.3 Stock

#### 3.3.1 Stock Ledger & Moving Average Cost (MAC)

**Real-world scenario**: The same cement bag may be bought at ₹320, ₹340, and ₹330 on different days. Issues must be valued at a fair cost that the books and site both accept.

**Use cases**:
- **UC-STOCK-01: Track on-hand by location** — `StockLocationItem.qty` is the source of truth for current stock; `StockMovement` is the immutable ledger.
- **UC-STOCK-02: Moving Average Cost** — On receipt: `newMAC = (oldQty × oldMAC + recvQty × recvCost) / (oldQty + recvQty)`. On issue: MAC unchanged; issue cost = current MAC.
- **UC-STOCK-03: Never update stock directly** — All quantity mutations go through `recordMovement()` or `recordTransfer()` inside Serializable transactions.
- **UC-STOCK-04: Location types** — `COMPANY_WAREHOUSE`, `PROJECT_SITE`, `DEPARTMENT` cost centres.

**Business rules enforced**:
- Negative stock prevented at issue/transfer.
- MAC is per-location; transfers carry source MAC to destination.
- Every movement posts a `StockMovement` row.

#### 3.3.2 Material Issues to Project or Department

**Real-world scenario**: Cement is issued either to a construction project (WIP / project cost) or to the rice mill’s Boiler/Dryer/MP-2 department (Operating Expense). The same issue slip is generated.

**Use cases**:
- **UC-ISSUE-01: Issue to project** — `MaterialIssue.projectId` required; cost allocated to `ProjectCost` and WIP; `reallocateProjectCosts()` updates cost per sq.ft.
- **UC-ISSUE-02: Issue to department** — `MaterialIssue.departmentId` required; cost hits Operating Expenses, skips project reallocation.
- **UC-ISSUE-03: Per-unit issue** — `MaterialIssue.builtUnitId` (optional) routes the cost directly to that unit’s `productionCost` on top of area allocation.
- **UC-ISSUE-04: Issue slip / SA number** — Printable `SA-xxxxx` issue register with receiver name, mobile, qty, rate, value, round-off, total in words.

**Business rules enforced**:
- Exactly one of `projectId` or `departmentId` must be set.
- GL posts Dr `WIP - Project Costs` or `Operating Expenses`, Cr `Stock`.

#### 3.3.3 Stock Transfers

**Real-world scenario**: Move 50 bags from central warehouse to project site, or from Site A to Site B, including inter-company STOs.

**Use cases**:
- **UC-TRANSFER-01: Intra-company transfer** — TRANSFER_OUT at source MAC, TRANSFER_IN at same MAC.
- **UC-TRANSFER-02: Inter-company STO** — Transfer price = source MAC + freight + handling + markup%; destination books at transfer price.
- **UC-TRANSFER-03: Transfer approval queue** — `StockTransfer` status `DRAFT → PENDING → COMPLETED / REJECTED`.

#### 3.3.4 Equipment & Plant

**Real-world scenario**: Track excavators, batching plants, and small tools across sites; schedule maintenance.

**Use cases**:
- **UC-EQUIP-01: Equipment master** — `Equipment` with status, location, depreciation, maintenance schedule.
- **UC-EQUIP-02: Assign/return equipment** — `EquipmentAssignment` records who has it and for which project.
- **UC-EQUIP-03: Maintenance** — `EquipmentMaintenance` with `MaintenanceType` (preventive / breakdown / AMC).
- **UC-EQUIP-04: Retire/sell** — Equipment can be retired or sold as an `AssetSale`.

#### 3.3.5 Scrap & By-Product Generation

**Real-world scenario**: Cut steel waste is collected and sold. Internally generated scrap is added to stock at a valuation (e.g., 50% of standard cost) and the sale reduces project cost.

**Use cases**:
- **UC-SCRAP-01: Record scrap generation** — `ScrapGeneration` + `ScrapGenerationLine`; `Material.isScrap = true`; stock IN with `SCRAP_GENERATED` movement.
- **UC-SCRAP-02: Auto-detect from DPR variance** — `runDprVarianceAnalysis()` compares actual vs `StandardConsumption`; over-consumption flagged as scrap; optionally auto-generates a scrap slip.
- **UC-SCRAP-03: Scrap sale as cost recovery** — `createMaterialSale()` with `projectId` subtracts `scrapSubtotal` from project total cost and GL credits `COST_RECOVERY`.

#### 3.3.6 Physical Stock Counts

**Real-world scenario**: Monthly physical verification at warehouse. System shows book stock; user enters physical; system posts reconciliation.

**Use cases**:
- **UC-COUNT-01: Stock count sheet** — `StockCount` + `StockCountLine` by location and material.
- **UC-COUNT-02: Confirm/reconcile** — `DRAFT → COUNTED → CONFIRMED → RECONCILED`.
- **UC-COUNT-03: GL impact** — Shortage/surplus posts to adjustment accounts in the same transaction.

#### 3.3.7 Consumption Benchmarks & Variance

**Real-world scenario**: Foundation work should consume 1.5 t steel per 100 sq.ft. If more is used, the system flags it.

**Use cases**:
- **UC-BENCH-01: Define standard consumption** — `StandardConsumption` per `workType` + `materialId` + `unitOfMeasure`.
- **UC-BENCH-02: Variance analysis** — `calculateConsumptionVariance()` compares actual vs standard; tolerance alerts (WARNING / CRITICAL).
- **UC-BENCH-03: Material reconciliation** — `MaterialReconciliation` report: required (BOQ) vs issued vs consumed (MB) vs physical stock, with wastage %.

#### 3.3.8 Gate Passes (Outbound Security)

**Real-world scenario**: No material leaves the site without an authorized gate pass. Security checks the pass before allowing exit.

**Use cases**:
- **UC-GP-01: Create outbound gate pass** — `GatePass` with category (issue, transfer, sale, return) and lines.
- **UC-GP-02: Approval before exit** — `PENDING → APPROVED → EXITED`.
- **UC-GP-03: Photo capture at exit** — Exit photo attached as evidence.

---

### 3.4 Construct

#### 3.4.1 Project Master

**Real-world scenario**: A project is built on a land parcel; it has phases, BOQ, WBS, and a cost-per-sq.ft target.

**Use cases**:
- **UC-PROJ-01: Create project on land** — `Project` requires company, land, name; statuses `PLANNED / ACTIVE / ON_HOLD / COMPLETED`.
- **UC-PROJ-02: Phases** — `ProjectPhase` tracks phase, start/end, status.
- **UC-PROJ-03: Possession flag** — `isPossessed` and `possessionDate`.
- **UC-PROJ-04: Cost per sq.ft reallocation** — `reallocateProjectCosts()` computes `totalProjectCost / totalSellableArea`, caches on `Project.costPerSqft`, and sets `BuiltUnit.productionCost = costPerSqft × unit.area + unitDirectCosts`.

#### 3.4.2 Bill of Quantities (BOQ)

**Real-world scenario**: Before construction, the engineer estimates “this building will cost ₹40 lakh” item by item. BOQ is optional but mandatory for large planned projects.

**Use cases**:
- **UC-BOQ-01: Hierarchical BOQ** — `BoqItem` types: SECTION → SUBSECTION → LINE_ITEM with qty, rate, amount.
- **UC-BOQ-02: BOQ-driven procurement planning** — BOQ generates expected material requirements (MTO).
- **UC-BOQ-03: Budget variance** — Actual cost vs BOQ line with UNDER / ON_TRACK / OVER flags.

#### 3.4.3 Work Breakdown Structure (WBS) & Scheduling

**Real-world scenario**: The project has 100+ activities with dependencies. The owner wants the critical path and delay forecast.

**Use cases**:
- **UC-WBS-01: Build WBS** — `WbsNode` hierarchy: PROJECT_NODE → PHASE_NODE → ACTIVITY → SUB_ACTIVITY → MILESTONE with schedule dates and progress %.
- **UC-WBS-02: Dependency network** — `WbsDependency` with FS/FF/SS/SF types.
- **UC-WBS-03: CPM scheduling** — Forward pass (ES/EF), backward pass (LS/LF), total float, critical path.
- **UC-WBS-04: EVM (Earned Value Management)** — PV, EV, AC, CPI, SPI, EAC, VAC; cost overrun forecast.
- **UC-WBS-05: Payment schedule link** — CLP milestones tied to WBS nodes: payment becomes DUE when node reaches 100% progress.

#### 3.4.4 Measurement Book (MB)

**Real-world scenario**: The site engineer verifies the subcontractor’s executed quantity of brickwork. This quantity drives RA bills.

**Use cases**:
- **UC-MB-01: Record MB entry** — `MeasurementBookEntry` per BOQ item, status `DRAFT → VERIFIED → APPROVED → REJECTED`.
- **UC-MB-02: Site engineer verification** — Actual quantities with supporting photos and notes.
- **UC-MB-03: Feed RA bills** — Approved MB quantities flow into `RaBillLine` (prevQty/thisQty/totalQty).

#### 3.4.5 Subcontractor Work Orders & RA Bills

**Real-world scenario**: A masonry contractor is given a work order for ₹20 lakh with 5% retention and 10% advance. Monthly RA bills are raised, TDS deducted, retention held, advance recovered.

**Use cases**:
- **UC-WO-01: Work order** — `SubcontractorWorkOrder` with scope = BOQ items, rates, retention %, advance, TDS category (INDIVIDUAL/COMPANY/OTHER → 1%/2%/2%).
- **UC-RA-01: RA bill from MB** — `RaBill` status `DRAFT → SUBMITTED → APPROVED → PAID / REJECTED`.
- **UC-RA-02: Deductions** — Retention, TDS, advance recovery computed per line.
- **UC-RA-03: TDS certificates** — Form 16C-style certificates for Section 194C.

#### 3.4.6 Change Orders

**Real-world scenario**: Client asks for an extra balcony. Scope, BOQ, budget, and schedule change formally.

**Use cases**:
- **UC-CO-01: Create change order** — `ChangeOrder` with type, reason, status, linked BOQ items and budget impact.
- **UC-CO-02: Approval workflow** — Formal approval before the change is executed.

#### 3.4.7 Quality Control

**Real-world scenario**: Rebar quality failed testing. Raise NCR, track CAPA.

**Use cases**:
- **UC-QC-01: Non-conformance report** — `NonConformanceReport` with severity, category, status.
- **UC-QC-02: CAPA** — `Capa` linked to NCR with Corrective and Preventive actions.

#### 3.4.8 Safety

**Real-world scenario**: Site near-miss, PPE violation, or safety inspection needs logging.

**Use cases**:
- **UC-SAFETY-01: Safety incident** — `SafetyIncident` with type, severity, status.
- **UC-SAFETY-02: Hazard register** — `SafetyHazard` with risk level and mitigation.
- **UC-SAFETY-03: Inspections** — `SafetyInspection` with result and follow-up.

---

### 3.5 Sell

#### 3.5.1 Built Unit Inventory

**Real-world scenario**: A project has flats, shops, and plots. Each has availability, asking price, status, and portal listing.

**Use cases**:
- **UC-UNIT-01: Built unit master** — `BuiltUnit` with type (FLAT/SHOP/PLOT), status (AVAILABLE/BOOKED/SOLD/RENTED), area, asking price.
- **UC-UNIT-02: Renovation tracking** — `RenovationProject` linked to a unit; cost and status tracked.
- **UC-UNIT-03: Portal listings** — Sync to 99acres, MagicBricks, Housing.com via pluggable `PortalProvider`; status `DRAFT → LISTED → DELISTED`.

#### 3.5.2 Sales Order & Lifecycle

**Real-world scenario**: A buyer books a flat with ₹5 lakh advance, 2-year payment plan. Deal goes: Booked → Agreement/BBA → Registry → Complete. Documents uploaded at each stage.

**Use cases**:
- **UC-SALE-01: Book a unit** — `AssetSale` with buyer, unit, deal price, advance, payment plan, broker, T&C.
- **UC-SALE-02: Sale lifecycle** — `BOOKED → ATS_BBA_SIGNED → REGISTERED → COMPLETED`.
- **UC-SALE-03: Document uploads per stage** — ATS/BBA, sale deed, registry.
- **UC-SALE-04: T&C cost allocation** — Each cost component (registration, stamp, transfer, lease, GST) toggles “borne by client or seller”.
- **UC-SALE-05: Broker & commission** — `Broker` master with default %; `brokerageAmount` and payment status tracked.
- **UC-SALE-06: Payment plan** — CLP (construction-linked), TLP (fixed installments), DPP (down payment + installments).
- **UC-SALE-07: Real estate GST** — Affordable 1% on full, non-affordable 5% on 2/3 (land 1/3 exempt), commercial 18% on full.
- **UC-SALE-08: Auto-delist on sale** — `sellAsset()` sets all active portal listings to `DELISTED`.

#### 3.5.3 Payment Collection & Bank SMS Matching

**Real-world scenario**: Buyer sends UPI payment. The accountant forwards a bank SMS; the system parses it and matches to outstanding sale/rent.

**Use cases**:
- **UC-PAY-01: Record sale payment** — `AssetSalePayment` with mode, bank, cheque photo, amount.
- **UC-PAY-02: Bank SMS parsing** — `BankSms` + `/api/sms/ingest` and `match` parse text and auto-create payment entries.
- **UC-PAY-03: Milestone payment due** — `PaymentScheduleItem` auto-marks DUE when linked WBS node hits 100%.
- **UC-PAY-04: Send demand notices** — Auto email/SMS reminders when installments are due.

#### 3.5.4 Rentals / Tenancy

**Real-world scenario**: A commercial unit is rented with a registered agreement, monthly billing, and 10% yearly escalation.

**Use cases**:
- **UC-RENT-01: Create tenancy** — `Tenancy` with unit, tenant, rent, start date, escalation %, interval, registered agreement upload.
- **UC-RENT-02: Monthly billing** — Generate `RentalPayment` per month.
- **UC-RENT-03: Yearly escalation** — `escalationPercent` applied every N months.
- **UC-RENT-04: Tenant change** — End old tenancy, start new one with new rent.
- **UC-RENT-05: SAC GST** — Rent falls under services (SAC), not HSN.

#### 3.5.5 Material Sales (Surplus / Scrap)

**Real-world scenario**: Leftover tiles from a project are sold. The sale can either be general revenue or linked to a project as cost recovery.

**Use cases**:
- **UC-MSALE-01: Sell material** — `MaterialSale` with lines, customer, payment.
- **UC-MSALE-02: Link to project for cost recovery** — `projectId` set; `scrapSubtotal` reduces project cost and each unit’s `productionCost`.

---

## 4. People World — HR & Field

### 4.1 Employee Master

**Real-world scenario**: Labour, supervisors, engineers, accountants all have wage rates, department, joining date, and a customizable hierarchy (H1–H6).

**Use cases**:
- **UC-EMP-01: Employee record** — `Employee` with name, trade, phone, daily rate, wage type, department, crew/gang.
- **UC-EMP-02: H1–H6 hierarchy** — `User.hierarchyLevel` 1–6; any role can be assigned to any level.
- **UC-EMP-03: Crews / gangs** — `Crew` groups workers for attendance and DPR.

### 4.2 Attendance

**Real-world scenario**: Workers mark attendance from their own phones. GPS stamps the check-in. A supervisor can approve field staff who checked in off-site.

**Use cases**:
- **UC-ATT-01: GPS check-in/out** — `WorkerAttendance` records `checkInLat/Lng`, `checkInLocation`, time.
- **UC-ATT-02: 5 attendance codes** — `P` (Present), `H` (Half), `Late`, `PL` (Paid Leave), `NPL` (Non-Paid Leave).
- **UC-ATT-03: Late → half-day rule** — 4 lates = 1 half-day cut; <85% of working hours = half day, 85–100% = late.
- **UC-ATT-04: Paid leave balance** — Per-employee leave entitlement set at enrollment.
- **UC-ATT-05: Self check-in/out** — Mobile `/m/site/attendance` allows workers to check in/out themselves; supervisors can bulk-mark or override.

### 4.3 Daily Progress Report (DPR)

**Real-world scenario**: The supervisor submits what work was done, how many labourers, and materials consumed. Manager approves it; until then, attendance stays yellow.

**Use cases**:
- **UC-DPR-01: Submit DPR** — `DailyProgressReport` with project, work type, labor count, material lines, % complete, ETA.
- **UC-DPR-02: Auto-pull attendance times** — DPR uses that day’s check-in/check-out.
- **UC-DPR-03: Multi-tier approval** — `SUBMITTED → SUB_ADMIN_APPROVED → APPROVED | REJECTED`; Sub-Admin (PM/HR Manager) first, Admin (Owner/Admin) final.
- **UC-DPR-04: Attendance traffic light** — Yellow until DPR approved; then green. Red = absent/no field approval.
- **UC-DPR-05: Variance analysis** — `runDprVarianceAnalysis()` compares material consumption vs `StandardConsumption`; over-consumption flagged or auto-generates scrap.
- **UC-DPR-06: DPR-Finance reconciliation** — Compare DPR-recorded costs (material + labor) against GL-posted costs.

### 4.4 Payroll

**Real-world scenario**: At month-end, attendance is auto-converted to salary, including late/half-day deductions, advances, PF, and insurance.

**Use cases**:
- **UC-PAYROLL-01: Generate payroll** — `PayrollPeriod` + `PayrollLine` from attendance; status `DRAFT → APPROVED → PAID`.
- **UC-PAYROLL-02: Auto salary calculation** — Days present × daily rate − half-day cuts − NPL − late deductions + paid leave + PF + insurance.
- **UC-PAYROLL-03: Pay out** — Record payment mode, bank, cheque photo.
- **UC-PAYROLL-04: Labour cost report** — Per site, per month.

### 4.5 Leave Requests

**Use cases**:
- **UC-LEAVE-01: Apply leave** — `LeaveRequest` with type, dates, reason.
- **UC-LEAVE-02: Approve leave** — Manager approval; `APPROVED` updates attendance `PL`, `REJECTED` keeps `NPL` if absent.

---

## 5. Books World — Finance & Accounts

### 5.1 Chart of Accounts & General Ledger

**Real-world scenario**: The system must post double-entry books that always tie to Tally, with 26 system accounts and GST separation.

**Use cases**:
- **UC-GL-01: Seed chart of accounts** — `GlAccount` with `ACCT` codes: stock, WIP, land, suppliers, customers, GST input/output, TDS, banks, cash, etc.
- **UC-GL-02: Post journal entry** — `postJournalEntry()` with balanced `JournalLine`s, inside the source transaction.
- **UC-GL-03: Trial balance** — `/api/gl/trial-balance` always ties because every source mutation posts atomically.
- **UC-GL-04: Account ledger** — Dr/Cr drill-down per GL account.
- **UC-GL-05: Tally sync** — `generateTallyVoucherXml()` and `syncBatchToTally()` push to Tally ERP via HTTP API; `TallySyncLog` tracks PENDING/SYNCED/FAILED.

### 5.2 GST & Tax

**Use cases**:
- **UC-GST-01: HSN/SAC master** — 81 curated construction-industry HSN/SAC codes; `HsnGstRate` seeded from CBIC free snapshot or FastGST API.
- **UC-GST-02: Input GST (ITC)** — Debited on purchases and GRNs.
- **UC-GST-03: Output GST** — Credited on sales and material sales.
- **UC-GST-04: GST reports** — Input tax credit, output tax, net payable.
- **UC-GST-05: Real estate GST** — Affordable / non-affordable / commercial formulas.

### 5.3 Expenses, Petty Cash, Budgets

**Real-world scenario**: Site staff spend small cash on tea, travel, site supplies. They claim reimbursement; accountant books and approves.

**Use cases**:
- **UC-EXP-01: Book operating expense** — `Expense` with category, GST, payment mode, approval workflow.
- **UC-EXP-02: Expense claim** — Employee submits `ExpenseClaim` + `ExpenseClaimLine`s; manager approves; accountant pays.
- **UC-EXP-03: Petty cash float** — `PettyCashFloat` with top-ups and spends; balance tracked.
- **UC-EXP-04: Recurring expenses** — `RecurringExpense` auto-generates drafts on schedule (rent, AMC, salaries).
- **UC-EXP-05: Expense budgets** — `ExpenseBudget` vs actuals; variance tracking.
- **UC-EXP-06: Project costs** — `ProjectCost` for direct costs not through material issue (e.g., approvals, fees).

### 5.4 Supplier Payments & Invoicing

**Use cases**:
- **UC-SUPP-PAY-01: Supplier invoice from GRN** — `/api/supplier-invoices/from-grn` generates an invoice from GRN data.
- **UC-SUPP-PAY-02: Record payment** — `SupplierPayment` with mode, TDS, cheque photo.
- **UC-SUPP-PAY-03: Outstanding dues** — `reports/pending-payments` shows who you owe and how overdue.

### 5.5 Project Finance & Reports

**Use cases**:
- **UC-FIN-01: Profit center** — Per-project P&L: revenue (sales + scrap recovery) − costs (land + materials + labor + equipment + subcontractor + overhead).
- **UC-FIN-02: Cash flow forecast** — Inflows (due payment schedule items) − outflows (open POs + pending RA bills + payroll).
- **UC-FIN-03: Job costing** — Direct vs indirect cost classification, overhead absorption rate.
- **UC-FIN-04: Budget variance** — BOQ budget vs actual cost by line item.
- **UC-FIN-05: Cost per sq.ft** — `reallocateProjectCosts()` caches on project and each unit.

---

## 6. Settings & Administration

### 6.1 Company & Locations

**Use cases**:
- **UC-SET-01: Company settings** — Name, address, GSTIN, logo, fiscal year, PO approval thresholds.
- **UC-SET-02: Stock locations** — Create warehouses, project sites, department cost-centres.
- **UC-SET-03: Departments** — Cost centers: Boiler, Dryer, MP-1/2/3, Workshop, Lab, Office.

### 6.2 Users & Access

**Use cases**:
- **UC-SET-04: Member management** — Add users, assign roles, scope, reporting line.
- **UC-SET-05: Project assignments** — `ProjectAssignment` or `UserScope` governs who sees which sites.
- **UC-SET-06: Notification preferences** — `NotificationPreference` per user/channel.

### 6.3 Integrations

**Use cases**:
- **UC-SET-07: Telephony provider** — Exotel / Knowlarity / Twilio config, company phone numbers, call recording consent.
- **UC-SET-08: WhatsApp / email templates** — Per-company per-event templates with `{{variable}}` placeholders.
- **UC-SET-09: Tally config** — HTTP endpoint on port 9000, sync batch.
- **UC-SET-10: HSN/SAC provider** — CBIC free or FastGST API keys.

### 6.4 Feedback, Backup, Audit Inbox

**Use cases**:
- **UC-SET-11: Instant feedback** — Floating button on every page: screenshot, voice note, text; routed to DEVELOPER/OWNER/ADMIN.
- **UC-SET-12: Feedback inbox** — `/feedback` list with statuses NEW/READ/RESOLVED/ARCHIVED.
- **UC-SET-13: Backup & restore** — Download full company backup or restore from file.
- **UC-SET-14: Audit trail** — `/finance/audit` shows every create/update/delete with diffs.

---

## 7. Integrations & External Channels

### 7.1 Telephony / Calls

**Use cases**:
- **UC-CALL-01: Company phone numbers** — `CompanyPhone` with provider assignment.
- **UC-CALL-02: Call logging** — `CallLog` records inbound/outbound, duration, recording.
- **UC-CALL-03: Call analytics** — Volume, missed rate, duration by staff, disposition breakdown.
- **UC-CALL-04: Consent policy** — Recording consent acceptance logged before call recording.

### 7.2 WhatsApp / SMS / Email

**Use cases**:
- **UC-NOTIF-01: Low stock alert** — `notifyLowStock()` sends to OWNER/ADMIN/MANAGERs when auto-requisition fires.
- **UC-NOTIF-02: Quote approval** — `notifyQuoteApproval()` sends to the requisition requester.
- **UC-NOTIF-03: DPR approval** — Sends to DPR submitter on sub-admin/admin approval.
- **UC-NOTIF-04: Custom templates** — `renderTemplate()` with placeholders; per-company per-event.

### 7.3 Portal Listings (99acres, MagicBricks, Housing.com)

**Use cases**:
- **UC-PORTAL-01: Create listing** — `PortalListing` draft auto-filled from `BuiltUnit`.
- **UC-PORTAL-02: Sync to portal** — `syncListingToPortal()` pushes via pluggable `PortalProvider`.
- **UC-PORTAL-03: Auto-delist on sale** — `sellAsset()` marks active listings `DELISTED`.

---

## 8. Real-World Constraints & Edge Cases

### 8.1 Percentage-based costs with manual override

**Constraint**: GST, registration, stamp duty, and lease rent vary by state, authority, and deal. The system always supports percentage entry with manual amount override. No fixed rates are hard-coded.

### 8.2 Document-driven gates

**Constraint**: Real estate and construction are document-heavy. The system treats document upload as a stage-gate condition for:
- Sale completion (registry)
- Land possession
- NOC/permission validity
- Cheque clearing evidence

### 8.3 Approval sequences cannot be skipped

**Constraint**: The UI enforces business sequences:
- Quotation collection → PO → GRN
- DPR submitted → approved → attendance green
- Sale booked → BBA/ATS (optional) → registry → complete
- Land purchase booked → agreement/BBA (optional) → registry → complete

### 8.4 Mobile-first field operations

**Constraint**: Field staff (supervisors, labour, security) primarily use mobile. The system provides:
- Offline queue for GRN / issue / transfer
- GPS check-in/out
- Photo capture
- Barcode scanning
- One-tap DPR submission
- Swipe-to-approve

### 8.5 Cost allocation ambiguity

**Constraint**: A single bag of cement can be:
- Received to a warehouse
- Transferred to a site
- Issued to a project (WIP)
- Issued to a department (Opex)
- Issued to a specific unit (direct cost)
- Sold as surplus/scrap (cost recovery)

The system distinguishes each path with different GL postings and cost allocation rules.

### 8.6 Inventory valuation disputes

**Constraint**: MAC is the single cost basis for issues and transfers. It is recalculated on every receipt and never manually overridden. This prevents arbitrary valuation and audit disputes.

### 8.7 Inter-company transfer pricing

**Constraint**: Group companies must book stock at a transfer price that includes freight, handling, and markup. The destination company’s MAC reflects the transfer price, satisfying accounting and tax requirements.

### 8.8 Payroll edge cases

**Constraint**: Salary must handle:
- Daily-wage vs monthly-salary workers
- Half-day and late deductions
- Paid leave entitlements per employee
- PF and health insurance (optional)
- Advances and loans

### 8.9 Multi-company consolidation vs isolation

**Constraint**: Users can be members of multiple companies with different roles/scopes. Data is strictly isolated by `companyId` except where explicitly grouped (inter-company STO, group reporting).

### 8.10 Offline-first field constraints

**Constraint**: Network at rural sites is intermittent. The PWA queues mutations and reconciles when online. However, real-time validation (e.g., available stock) may be stale if the device was offline; the server re-validates on sync.

---

## 9. Index of Use Cases by Role

| Role | Primary Use Cases |
|---|---|
| **OWNER** | All use cases; un-partition land; audit trail; feedback inbox; final approvals above ₹5L; Tally sync; GL review. |
| **ADMIN** | Almost all use cases; company setup; user/role/scope management; GL; backup. |
| **PROJECT_DIRECTOR / FINANCE_HEAD** | Approvals up to ₹5L; profit centers; cash flow; EVM; budget variance; reports. |
| **PROJECT_MANAGER** | Site work; DPR approval; requisition/PO up to ₹50K; attendance; task management. |
| **PROCUREMENT_MANAGER** | Quotations; PO; supplier returns; rate contracts; vendor ratings; GRN. |
| **SITE_ENGINEER / STORE_KEEPER** | GRN; stock issues; transfers; stock counts; gate passes; material reconciliation. |
| **SALES_MANAGER** | Unit inventory; sales; brokers; rentals; material sales; CRM dashboard. |
| **ACCOUNTANT** | Books; expenses; payments; GL; payroll; GST; TDS certificates; DPR-finance reconciliation. |
| **SUPERVISOR** | Field attendance; DPR submission; my tasks; material issue; stock on his sites. |
| **QAQC_ENGINEER** | NCR/CAPA; safety; quality inspections; material acceptance. |

---

## 10. Summary — What the Business Logic is Designed to Handle

Nirman Inventory OS is designed as a **single source of truth** for the full lifecycle of a construction/real-estate + manufacturing conglomerate:

1. **Acquire** land before a project exists, track percentage-based costs, recurring accruals, NOCs, and possession.
2. **Procure** through quotation-gated, value-routed POs with audit-proof GRN and return flows.
3. **Stock** with MAC-based valuation, immutable ledger, department/project/unit allocation, and offline-first field operations.
4. **Construct** with BOQ, WBS/CPM, MB-driven RA bills, subcontractor TDS/retention, QC, safety, and change control.
5. **Sell** with the document-gated Sale lifecycle, real estate GST, payment plans, broker commissions, rentals, and portal listings.
6. **People** with GPS attendance, 5-code payroll, DPR, multi-tier approval, and H1–H6 hierarchy.
7. **Books** with double-entry GL, GST, Tally sync, profit centers, cash flow, and audit trail.
8. **Integrate** calls, WhatsApp, SMS, email, property portals, HSN/SAC, OCR, and Tally.

The system treats **every transaction as an event** that simultaneously updates:
- Physical state (stock, unit status, attendance)
- Financial state (GL, project cost, payroll)
- Audit state (immutable logs, before/after diffs)
- External state (portal listings, Tally, notifications)

This ensures the **books never diverge from reality** — the central promise of the Nirman Inventory OS.

---

# Appendix A: Detailed Click-by-Click Workflows

This appendix walks through the most common user journeys at the level of **clicks, form fields, validation messages, system state changes, and branching paths**. It is intended for QA, UX, and implementation review.

---

## WF-1: Sign-In and Role-Based Landing

### Goal
A user opens the app and lands in the correct world for their role.

### Actors
All users.

### Detailed steps

1. **User opens `/sign-in` in browser.**
   - System displays email/password form.
   - Below the form, 6 demo role buttons appear in dev mode (OWNER, ADMIN, PROJECT_MANAGER, SUPERVISOR, SALES_MANAGER, ACCOUNTANT).
2. **User enters email + password and clicks “Sign In”.**
   - System calls `POST /api/auth/sign-in` (Better-Auth).
   - On success, `getSession()` sets the company context from `UserCompany`.
3. **If user has multiple `UserCompany` memberships, system shows a company switcher.**
   - User clicks the intended company.
   - System writes the active `companyId` to the session and reloads.
4. **System checks `homeWorldFor(role)` and redirects.**
   - SUPERVISOR / QAQC_ENGINEER / SITE_ENGINEER → `/hr` (People world).
   - STORE_KEEPER / PROCUREMENT_MANAGER / PROJECT_MANAGER → `/build` (Build world).
   - SALES_MANAGER → `/build` (Sell section).
   - ACCOUNTANT / FINANCE_HEAD → `/finance` (Books world).
   - OWNER / ADMIN / PROJECT_DIRECTOR → `/` (Today / Profile).
5. **Desktop vs mobile surface is resolved.**
   - `middleware.ts` checks user agent: mobile UA at `/` redirects to `/m`.
   - On live resize, `ResponsiveSurfaceRedirector` either auto-redirects at home routes or shows a non-blocking toast offering to switch.
6. **The world rail highlights the active world; the side panel shows only the sections and links this role may see.**

### Branching paths

- **Invalid password**: Error toast under the email field; no redirect.
- **No company membership**: System shows “No company assigned” with a contact-admin message.
- **AUTH_BYPASS=true** in `.env`: `getSession()` returns the first OWNER/ADMIN as synthetic user; no sign-in required.

---

## WF-2: Create and Approve a Material Requisition (Indent)

### Goal
A supervisor raises an indent; a manager approves it; the system auto-detects low stock.

### Actors
SUPERVISOR / SITE_ENGINEER (raise), PROJECT_MANAGER / PROCUREMENT_MANAGER (approve).

### Start state
User is logged in and scoped to a company and project.

### Detailed steps

1. **User clicks Build → “Material Indents” (`/requisitions`).**
   - System calls `GET /api/requisitions` filtered by user scope.
   - List shows requisitions with `StatusPill`: DRAFT (neutral), SUBMITTED (waiting), APPROVED (good), REJECTED (bad).
   - `PageHeader` shows primary action: “New Requisition”.
2. **User clicks “New Requisition”.**
   - System opens `RequisitionForm` (or mobile `MobileRequisitionForm`).
   - **Project/Site** dropdown is pre-filtered to the user’s `scope.projectIds` if PROJECT scoped; otherwise all active projects.
   - **Required by date** defaults to today + 3 days.
   - **Reference panel** loads (if implemented): current closing stock per material, last supplier, last rate/date for each material at the selected project/site.
3. **User selects project and clicks “Add Material”.**
   - A material picker opens filtered to this company’s `Material` master.
   - User selects `OPC 53 Cement (Bags)`.
4. **User enters quantity 150 bags and clicks “Add Line”.**
   - System validates: qty > 0, material exists, unit of measure from `Material.uom`.
5. **User repeats for 2–3 materials, then clicks “Submit for Approval”.**
   - System calls `POST /api/requisitions`.
   - In the service: status set to `SUBMITTED` only if the user has permission to move directly to submitted; otherwise `DRAFT` and the user must explicitly submit.
   - `logAction()` writes `REQUISITION_CREATE` and `REQUISITION_SUBMIT` to `AuditLog` in the same transaction.
6. **System sends in-app + WhatsApp/Email notification to approvers (OWNER/ADMIN/MANAGER).**
   - `notifyRequisitionSubmitted()` is best-effort; failure does not roll back the submit.
7. **Approver receives notification and clicks Build → “Material Indents” or navigates to `/approvals`.**
   - Badge count on Approvals link increments from `GET /api/approvals`.
8. **Approver clicks the requisition card to open detail.**
   - System shows `RequisitionDetailView` with lines, quantities, requester, project, reference data, and quote count.
   - **Action bar** shows “Approve” and “Reject” only if `hasPermission(‘requisition.approve’)` and the approver is one level above in hierarchy or in the same reporting chain.
9. **Approver clicks “Approve”.**
   - System calls `PATCH /api/requisitions/[id]` with `action: “approve”`.
   - Service sets `status = APPROVED`, `approvedById`, `approvedAt`.
   - `logAction()` writes `REQUISITION_APPROVE`.
   - Notification is sent back to requester.
10. **Requisition status becomes APPROVED.**
    - A “Convert to PO” button becomes visible to users with `po.create` permission.
    - If the material’s total stock is below `reorderPoint`, the auto-requisition badge may already have been raised earlier (see WF-3).

### Branching / error paths

- **Qty zero or negative**: Inline validation: “Quantity must be greater than 0”.
- **Material not in catalog**: Picker empty state with “Create Material” shortcut.
- **Approver clicks Reject**: Prompt for rejection reason. `status = REJECTED`; requester can edit and resubmit.
- **Approver has insufficient permission**: Action bar hidden; if URL-hacked, `requirePermission` returns 403 JSON and client 401 interceptor redirects to `/sign-in`.

---

## WF-3: Auto-Generate Low-Stock Requisition

### Goal
System detects stock below reorder point and drafts an indent for human review.

### Actors
System (triggered by `POST /api/requisitions/auto` or scheduler).

### Detailed steps

1. **Scheduler or user clicks “Auto-Generate” on `/requisitions`.**
   - System calls `generateAutoRequisition()` for the active company.
2. **Service queries all `Material` with `reorderPoint` set.**
   - For each material, `recordMovement()` history is aggregated into `totalStock` across all locations for this company.
3. **If `totalStock <= reorderPoint`, material is added to the due list.**
   - Qty = `economicOrderQty` if set; otherwise `2 × reorderPoint - totalStock` (replenish to 2× reorder point).
4. **Service groups due materials by `defaultProjectId` or most-recent issue project.**
   - One requisition per project is raised in `DRAFT` status.
5. **Before creating, service checks for existing open requisitions for the same material+project.**
   - If an open `DRAFT` or `SUBMITTED` requisition already contains this material, it is skipped (de-duplication).
6. **Draft requisitions are created.**
   - Number generated: `RQ-YYMMDD-NNNN`.
   - `logAction()` writes `AUTO_REQUISITION_GENERATED`.
7. **System calls `notifyLowStock()` to send WhatsApp/SMS/Email to OWNER/ADMIN/MANAGER members.**
   - Requires `User.phone` populated; otherwise only in-app/email.
8. **Users see the new DRAFT requisitions in the list with a “Review & Submit” call-to-action.**

### Branching / edge cases

- **No materials below reorder**: System returns “No stock needs replenishment” and no requisitions are created.
- **Material has no `defaultProjectId` and no recent issue**: Requisition is created with no project; user must assign project before submit.
- **Multiple locations**: Aggregation is company-wide; the review screen shows the breakdown by location.

---

## WF-4: Collect Quotations and Convert to Purchase Order

### Goal
Purchaser collects ≥3 vendor quotes; manager selects winner; PO auto-fills.

### Actors
PROCUREMENT_MANAGER / SITE_ENGINEER (collect quotes), PROJECT_MANAGER / OWNER (approve winner).

### Detailed steps

1. **User navigates to Build → “Quotations” (`/quotations`).**
   - List shows `QuotationRequest` with tabs: All / Mine / Pending Approval.
2. **User clicks “New Quotation Request”.**
   - Mobile form opens at `/m/quotations/new`.
   - Title, project, and material lines are entered.
   - For each material, `hsnCode` and `gstRate` are auto-fetched from `HsnGstRate` and shown inline; user can override.
   - `minQuotesRequired` defaults to 3.
3. **User clicks “Create Request”.**
   - System calls `POST /api/quotations`.
   - Status `OPEN`; `submittedByUserCompanyId` set.
4. **User opens the request detail and clicks “Add Quote”.**
   - `QuoteUploadDialog` opens.
   - User selects supplier (or creates new supplier inline with just a name).
   - User uploads quote PDF/image.
   - User enters per-line: unit price, GST rate, freight per unit, handling per unit.
   - System computes `unitLandedCost = unitPrice + (unitPrice × gstRate/100) + freightPerUnit + handlingPerUnit`.
5. **User saves quote; system persists `VendorQuote` + `VendorQuoteLine`.**
   - System recalculates `subtotal`, `gstTotal`, `freightTotal`, `handlingTotal`, `landedTotal`.
6. **User repeats until ≥3 quotes collected or gate waived.**
   - Each new quote appears in the comparative matrix.
7. **Manager opens the request detail and sees `ComparativeQuotePanel`.**
   - Matrix shows per material × per supplier, cheapest flag, variance %.
   - Cheapest is highlighted.
8. **Manager clicks the winning quote.**
   - If not the cheapest, a “Reason for override” text field becomes mandatory.
   - Manager enters reason and clicks “Approve Winner”.
9. **System calls `POST /api/quotations/[id]/approve`.**
   - Service validates: the approver is the requester’s direct reporting manager (`UserCompany.reportsToUserCompanyId`) or higher.
   - Service sets `status = APPROVED`, `selectedQuoteId`, `approvedBy...`, `approvedAt`, `approvalReason`.
   - `logAction()` writes `QUOTATION_APPROVE`.
10. **From the same screen, user clicks “Create PO”.**
    - `Convert-to-PO` dialog opens.
    - Supplier and stock location are pre-filled from the winning quote.
    - Line rates and landed costs are auto-populated.
    - User can edit delivery `procurementScope` (COMPANY warehouse / PROJECT site).
11. **User clicks “Create Purchase Order”.**
    - System calls `POST /api/purchase-orders`.
    - `PurchaseOrder` created in `DRAFT` status; `selectedQuoteId` linked.

### Branching / error paths

- **<3 quotes and not waived**: “Convert to PO” button disabled; tooltip: “Collect at least 3 quotes or request waiver.”
- **Approver not the requester’s manager**: Button disabled; API returns 403.
- **Override without reason**: Form validation blocks submit.
- **No stock location available**: Dialog shows inline “Add Stock Location” shortcut (if user has permission).

---

## WF-5: Approve and Order a Purchase Order

### Goal
PO goes through value-based approval and is sent to the vendor.

### Actors
PROCUREMENT_MANAGER (create), PROJECT_MANAGER / ADMIN / OWNER (approve by threshold).

### Detailed steps

1. **User opens `/procurement` and sees the new PO in DRAFT.**
   - `PoCard` shows status pill, supplier, total, and quote gate status.
2. **User clicks the PO to open detail.**
   - Page shows lines, supplier, delivery location, total, taxes, charges, and quote reference.
   - `MobilePipelineStepper` shows `DRAFT → APPROVED → ORDERED → RECEIVED`.
3. **User clicks “Approve” (visible only with `po.approve` permission).**
   - System calls `PATCH /api/purchase-orders/[id]` with `action: “approve”`.
   - Service checks value-based routing:
     - `total < company.poApprovalThresholdManager` (₹50K): PROJECT_MANAGER can approve.
     - `total < company.poApprovalThresholdAdmin` (₹5L): ADMIN can approve.
     - `total >= ₹5L`: OWNER/ADMIN only.
   - If actor lacks the threshold, `ForbiddenError` thrown.
4. **Status becomes `APPROVED`.**
   - `logAction()` writes `PO_APPROVE`.
   - Notification sent to purchaser and requester.
5. **User clicks “Order” (or “Send to Vendor”).**
   - Status becomes `ORDERED`; `orderedAt` recorded.
   - Optional: PDF/email generated for vendor.
6. **System awaits GRN.**

### Branching / error paths

- **Total exceeds actor’s threshold**: Error 403: “This PO requires OWNER/ADMIN approval.”
- **PO cancelled**: `CANCELLED` status; lines cannot be received.

---

## WF-6: Receive Goods via Gate Entry and GRN

### Goal
Inbound delivery is logged at gate, then received into stock with quality and lot tracking.

### Actors
Security guard (gate entry), STORE_KEEPER / SUPERVISOR (GRN), QAQC_ENGINEER (inspection).

### Detailed steps

1. **Truck arrives at site. Security guard opens mobile `/m/gate-entry` or desktop `/gate-entry`.**
   - Form: supplier (challan supplier), vehicle number, driver name, challan number, gate-in time auto-stamped.
2. **Guard submits gate entry.**
   - `GatePass` (or `GateEntry`) created with `INBOUND` category and sequential gate-in number.
   - SMS/WhatsApp notification sent to store keeper.
3. **Store keeper opens `/field` (mobile) or `/grn` (desktop).**
   - Lists pending gate entries and open POs.
4. **Store keeper selects the PO and scans the challan barcode or selects the gate entry.**
   - Camera `BarcodeDetector` or manual entry.
   - If offline, mutation is queued in `offlineQueue` and submitted when back online.
5. **GRN form opens with PO lines pre-filled.**
   - For each line, store keeper enters received qty, accepted qty, rejected qty, lot number, mfg date, expiry (if applicable), and quality remarks.
   - `inspectionStatus` default `PENDING`.
6. **Store keeper clicks “Receive”.**
   - System calls `POST /api/goods-receipts`.
   - Service:
     - Validates received qty ≤ pending PO qty.
     - Calls `recordMovement()` for each accepted line: `IN` movement with `unitCost`.
     - Updates `StockLocationItem.qty` and `movingAvgCost` using `computeMovingAverageCost()`.
     - Creates `MaterialLot` for each batch.
     - Posts `postPurchaseReceipt()` GL: Dr Stock, Dr Input GST (ITC), Cr Supplier.
     - Writes `GOODS_RECEIPT_CREATE` to `AuditLog`.
7. **If `inspectionStatus` is `REJECTED` for any line, a `SupplierReturn` draft is suggested.**
   - QAQC can open the line and mark `ACCEPTED`/`REJECTED`.
8. **PO status advances.**
   - If all lines fully received, `RECEIVED`; otherwise `PARTIAL`.
9. **System sends notification to requester and purchaser that material has arrived.**

### Branching / error paths

- **Received > ordered**: Inline validation or service rejects: “Received quantity cannot exceed ordered quantity.”
- **Invalid barcode / unknown material**: Manual fallback; user can create quick material if permitted.
- **Offline sync conflicts**: Server re-validates stock availability and lot uniqueness; if conflict, user gets a diff to resolve.

---

## WF-7: Issue Material to Project, Department, or Specific Unit

### Goal
Material leaves the store and is charged to the right cost object.

### Actors
STORE_KEEPER / SITE_ENGINEER (issue), PROJECT_MANAGER (review).

### Detailed steps

1. **User opens Build → “Stock Ledger” (`/stock`) and clicks “Issue Material”.**
   - `IssueMaterialDialog` opens.
2. **User selects “Project / Cost Center” toggle.**
   - If Project: project dropdown appears; if Department: department (cost center) dropdown.
3. **User selects Project `Riviera Tower A`.**
   - Optional “Specific Unit” dropdown appears if the project has `BuiltUnit`s.
   - If the user selects a unit, cost is routed directly to `unit.productionCost`.
   - If left blank, cost is area-allocated across all sellable units via `reallocateProjectCosts()`.
4. **User clicks “Add Material”.**
   - Material picker shows only materials with positive stock at the selected source `StockLocation`.
   - User selects `OPC 53 Cement`.
5. **User enters qty 50 bags.**
   - System validates available stock in real time: `50 <= StockLocationItem.qty`.
   - Shows current `movingAvgCost` per bag (e.g., ₹330.00).
6. **User selects receiver name and mobile number.**
   - Optional: scan worker badge / select from `Employee` list.
7. **User clicks “Issue”.**
   - System calls `POST /api/issue-materials`.
   - Service:
     - Runs `recordMovement()` for each line: `ISSUE_TO_PROJECT` or `ISSUE_TO_DEPARTMENT`.
     - `StockLocationItem.qty` reduced; MAC unchanged.
     - Creates `MaterialIssue` + `MaterialIssueLine`.
     - Posts GL:
       - Project: Dr `WIP - Project Costs`, Cr `Stock`.
       - Department: Dr `Operating Expenses`, Cr `Stock`.
       - Unit-direct portion is split and added to `BuiltUnit.productionCost`.
     - Runs `reallocateProjectCosts()` for project issues (unless unit-direct only).
     - `logAction()` writes `ISSUE_CREATE`.
8. **System generates issue slip number `SA-xxxxx` and opens a printable view.**
   - Shows: To Project/Department, Receiver, Item, Qty, Rate (MAC), Value, Round-off, Total in words.
9. **User prints the issue slip or shares as PDF.**

### Branching / error paths

- **Insufficient stock**: Error: “Only 32 bags available at Central Warehouse.”
- **Neither project nor department selected**: Form validation: “Select a project or cost center.”
- **Both selected**: Only one allowed; if both accidentally sent, service throws `TaskError`.
- **Negative qty / zero**: Inline validation.

---

## WF-8: Land Purchase → Cost Breakup → Partition → Project

### Goal
Owner records a land acquisition, breaks it into sellable plots, and starts construction.

### Actors
OWNER / ADMIN (land), PROJECT_DIRECTOR (project).

### Detailed steps

1. **User navigates Build → “Land” (`/land`) and clicks “New Land Purchase”.**
   - Wizard opens: `LandPurchase` form.
2. **User enters land name, area, area unit (sq yd), land type (Freehold/Leasehold), and purchase mode (Whole/Subdivided).**
   - If Subdivided, a “Children” step is added later.
3. **User enters base land cost: ₹50,00,000.**
4. **Cost breakup panel expands.**
   - User toggles on each component:
     - Lease rent: one-time OR yearly; user enters % or manual amount.
     - GST: user enters %; system computes amount; user can override.
     - Registration charges: % or manual.
     - Stamp duty: % or manual.
   - Each line shows the math: “X% of Y = Z” and an amount field.
5. **User clicks “Save Land Purchase”.**
   - System calls `POST /api/land-purchases`.
   - Service creates `LandPurchase` with `totalCost = base + components`.
   - GL posted: Dr Land Asset, Cr Cash/Bank/Supplier.
6. **User later opens the land detail and clicks “Possess”.**
   - Upload possession document.
   - `isPossessed` set true; `possessionDate` recorded.
7. **User clicks “Partition” to subdivide.**
   - Partition dialog opens.
   - User adds child plots: 1A (100 sq yd), 1B (200 sq yd), 1C (300 sq yd), 1D (400 sq yd).
   - System validates Σ child area = 1000 sq yd.
   - User enters `currentValuation` and `askingPrice` for each child.
8. **User clicks “Confirm Partition”.**
   - Service runs in atomic transaction:
     - Creates 4 `LandParcel` records.
     - Sets parent `LandPurchase.status = PARTITIONED`.
     - Records `LandPartition` with parent→child mapping.
     - `recomputeLandTotalCost()` reprices child `acquisitionCost` pro-rata.
   - `logAction()` writes `LAND_PARTITION`.
9. **User clicks “Create Project on this Land” (only if not subdivided; for whole land).**
   - System redirects to `/projects/new` with `landId` pre-selected.
   - User enters project name, phases, and saves.

### Branching / error paths

- **Σ child area ≠ parent area**: Validation: “Child areas must total 1000.00 sq yd. Current: 950.00 sq yd.”
- **Child area = 0 or negative**: Inline validation.
- **Partition on already sold parent**: Blocked; must undo sales first.
- **Un-partition**: Only OWNER/ADMIN can click “Undo Partition”; children deleted, parent reset to AVAILABLE.

---

## WF-9: Sale Lifecycle — Book Unit to Registry

### Goal
Sales team books a flat, collects payment plan, signs BBA/ATS, registers, and completes.

### Actors
SALES_MANAGER (book, manage), OWNER/ADMIN (approve stage docs).

### Detailed steps

1. **User opens Build → “Built Units” (`/units`).**
   - Grid/list of `BuiltUnit`s with status: Available, Booked, Sold, Rented.
   - Filters: project, type, status.
2. **User clicks an available flat and “Book / Sell”.**
   - `SaleFormDialog` opens.
3. **User enters buyer details:**
   - Buyer name, phone, email.
   - Asset type: `FLAT` / `SHOP` / `PLOT` / `WHOLE_PROJECT`.
   - Unit selected (pre-filled if from units page).
   - Deal price: ₹75,00,000.
   - Advance received: ₹5,00,000.
   - Payment plan type: CLP / TLP / DPP.
4. **If CLP selected, user picks WBS milestones.**
   - System auto-generates `PaymentScheduleItem`s:
     - Booking → 10%
     - Foundation → 10%
     - 4th Slab → 20%
     - 10th Slab → 30% ...
   - Each item links to a `wbsNodeId`; when node progress = 100%, item status becomes `DUE`.
5. **User selects broker (optional).**
   - Broker dropdown from `Broker` master.
   - Commission % and amount auto-calculate; payment status `PENDING`.
6. **User selects payment mode and bank; uploads cheque photo if mode = Cheque.**
   - `chequePhotoUrl`, `paymentMode`, `bank` persisted.
7. **T&C panel shows cost components from land purchase, each with “Borne by client or seller” toggle.**
   - Registration (seller), Stamp duty (client), Transfer charges (client), etc.
   - Free-text T&C field for custom clauses.
8. **User clicks “Book Sale”.**
   - System calls `POST /api/sales`.
   - `AssetSale` created with `saleStage = BOOKED`, `status = BOOKED`.
   - `BuiltUnit.status` becomes `BOOKED`.
   - GL posted for advance: Dr Bank, Cr Customer Advance.
   - `logAction()` writes `SALE_CREATE`.
   - Printable receipt generated (`/sales/[id]/print`).
9. **User opens the sale detail and uploads ATS/BBA document.**
   - Clicks “Mark BBA Signed”.
   - `saleStage = BBA_SIGNED`.
10. **User later uploads registry document and clicks “Mark Registered”.**
    - `saleStage = REGISTERED`.
11. **User clicks “Complete Sale”.**
    - `saleStage = COMPLETED`; `BuiltUnit.status = SOLD`.
    - All active `PortalListing`s auto-delist to `DELISTED`.
    - Final GL posted: Customer Advance → Revenue, Output GST credited.

### Branching / error paths

- **Unit already booked/sold**: Status pill red; “Book” button disabled.
- **CLP milestone has no WBS node**: Warning: “Payment plan will not auto-trigger without a linked construction milestone.”
- **Broker commission > 0 but broker not selected**: Optional; if selected, commission mandatory.
- **Registry attempted before BBA**: Allowed (BBA is optional), but registry document is mandatory for COMPLETE.
- **Payment plan total ≠ deal price**: Validation error.

---

## WF-10: GPS Attendance and DPR Submission

### Goal
Workers mark attendance from phone; supervisor submits DPR; manager approves; attendance turns green.

### Actors
Worker/SUPERVISOR (attendance), SUPERVISOR (DPR), PROJECT_MANAGER (DPR approval).

### Detailed steps

1. **Worker opens mobile `/m/site/attendance`.**
   - Device requests GPS via `navigator.geolocation.getCurrentPosition()` (high accuracy, 10s timeout).
   - System compares lat/lng to assigned geofence radius.
2. **If inside geofence, user taps “Check In”.**
   - `WorkerAttendance` created with `checkInLat/Lng`, `checkInLocation`, `checkInAt`, `status = PRESENT`.
   - If outside geofence, status is `PRESENT` but flagged for field-approval; senior gets notification.
3. **Worker works; at end of day taps “Check Out”.**
   - `checkOutAt`, `checkOutLat/Lng` recorded.
   - Hours computed; if <85% of standard working hours → status recalculated to `HALF_DAY`.
4. **Supervisor opens `/m/dprs` and taps “New DPR”.**
   - System auto-pulls today’s check-in/check-out for the crew.
   - Project dropdown pre-selects nearest project using `useNearestProject`.
5. **Supervisor selects `workType` (e.g., “Foundation”).**
   - `StandardConsumption` for the work type is fetched.
6. **Supervisor adds labour lines:**
   - Selects crew or individual employees; counts heads; wage type.
7. **Supervisor adds material consumed lines:**
   - Selects material; enters actual qty.
   - System compares actual qty to standard qty × work output.
   - If actual > standard + tolerance, a warning appears: “Over-consumption detected. Flag as scrap?”
8. **Supervisor enters % complete and ETA to completion.**
9. **Supervisor submits DPR.**
   - `DailyProgressReport` status `SUBMITTED`.
   - `logAction()` writes `DPR_SUBMIT`.
   - Notification to PROJECT_MANAGER/HR_MANAGER.
10. **PROJECT_MANAGER opens `/m/dprs` or desktop `/hr/dprs`.**
    - Taps the DPR, reviews labor/material lines, photos, GPS.
    - Clicks “Sub-Admin Approve”.
    - `approvalStatus = SUB_ADMIN_APPROVED`.
11. **OWNER/ADMIN sees the DPR and clicks “Admin Approve”.**
    - `approvalStatus = APPROVED`.
    - For all `WorkerAttendance` records of the crew on this date, system flips traffic-light tier from YELLOW to GREEN.
    - `logAction()` writes `DPR_ADMIN_APPROVE`.

### Branching / error paths

- **GPS unavailable/timeout**: App allows manual selection of site with a “No GPS” warning; senior must approve.
- **Late > 3 in a month**: Payroll calculation applies 4-lates = 1 half-day rule.
- **DPR rejected**: Supervisor edits and resubmits; attendance remains YELLOW.
- **No check-in but DPR submitted**: System warns: “Attendance not found for selected workers. Mark attendance first.”

---

## WF-11: Month-End Payroll

### Goal
Accountant converts attendance into salary and pays it out.

### Actors
ACCOUNTANT / HR_MANAGER (generate), OWNER/ADMIN (approve), ACCOUNTANT (pay).

### Detailed steps

1. **User opens People → “Payroll” (`/hr/payroll`).**
   - List of `PayrollPeriod`s by month/year.
2. **User clicks “Generate Payroll” for e.g. September 2026.**
   - `GeneratePayrollDialog` opens.
   - User selects period start/end; system defaults to full month.
3. **User clicks “Preview”.**
   - System calls `generatePayroll()` in service.
   - For each active `Employee`:
     - Fetches all `WorkerAttendance` in the period.
     - Counts P, H, Late, PL, NPL.
     - Applies rules:
       - `Late` count ÷ 4 = half-day deductions (integer division).
       - `H` = 0.5 day wage.
       - `PL` = full day wage (if leave approved).
       - `NPL` = 0 wage.
       - Paid leave balance is decremented for `PL`.
     - Adds `PF`, `healthInsurance` if configured.
     - Deducts advances/loans if recorded.
   - `PayrollLine` drafts generated with `status = DRAFT`.
4. **Preview grid shows:**
   - Employee, present days, half days, lates, PL, NPL, gross, deductions, net payable.
5. **Accountant reviews and clicks “Save Draft” or “Submit for Approval”.**
   - Submit calls `updatePayrollStatus` to `SUBMITTED`.
6. **OWNER/ADMIN opens Payroll, reviews, clicks “Approve”.**
   - `PayrollPeriod.status = APPROVED`.
   - Attendance is locked for the period (no further edits).
7. **Accountant clicks “Pay” on a line or bulk “Pay All”.**
   - Payment dialog: mode, bank, date, cheque photo (if cheque).
   - `PayrollLine.status = PAID`.
   - GL posted: Dr Salary Expense, Cr Bank/Cash; PF/insurance split to respective ledgers.
   - `logAction()` writes `PAYROLL_PAY`.

### Branching / error paths

- **Attendance not yet approved for some days**: Warning: “Attendance for 3 days is pending. Payroll may change.”
- **Negative net payable**: System prevents payment; user must resolve advances/over-deductions.
- **PF not configured for employee**: PF field shows 0 and is editable.

---

## WF-12: Expense Claim and Reimbursement

### Goal
Employee submits an out-of-pocket expense; manager approves; accountant pays.

### Actors
Any employee (claim), direct manager (approve), ACCOUNTANT (pay).

### Detailed steps

1. **User opens Books → “Expense Claims” (`/expense-claims`).**
2. **User clicks “New Claim”.**
   - Form: title, date, category (from `ExpenseCategory`), description.
3. **User clicks “Add Line”.**
   - Amount, GST %, GST amount, net amount auto-computed.
   - Upload receipt photo/PDF.
4. **User adds multiple lines and clicks “Submit”.**
   - `ExpenseClaim` created, `status = SUBMITTED`.
   - `logAction()` writes `EXPENSE_CLAIM_CREATE`.
   - Notification to reporting manager.
5. **Manager opens Expense Claims, sees “Pending” tab.**
   - Clicks the claim, reviews receipt images.
6. **Manager clicks “Approve”.**
   - `status = APPROVED`.
7. **Accountant sees approved claim, clicks “Pay”.**
   - Payment dialog: mode, bank.
   - `status = PAID`.
   - GL posted: Dr Expense, Cr Bank/Cash.

### Branching / error paths

- **Receipt missing**: Manager can approve but system warns; accountant may reject.
- **GST mismatch with HSN**: If `ExpenseCategory` has HSN, GST auto-fetched; override allowed.
- **Claim exceeds budget**: `ExpenseBudget` variance warning shown to manager before approval.

---

## WF-13: Tally Sync

### Goal
Accountant pushes all journal entries to Tally ERP.

### Actors
ACCOUNTANT / OWNER.

### Detailed steps

1. **User opens Books → “General Ledger” (`/gl`).**
   - Tally sync panel is visible on the right.
2. **Panel shows counts:**
   - Unsynced entries: N
   - Last sync: timestamp or “never”
3. **User clicks “Sync to Tally”.**
   - System calls `POST /api/tally/sync`.
   - `syncBatchToTally()` loops all `JournalEntry` rows where no `TallySyncLog` exists in `SYNCED` status.
   - For each entry, `generateTallyVoucherXml()` builds the ENVELOPE/TALLYMESSAGE XML:
     - Voucher type based on source (Purchase, Sales, Receipt, Payment, Journal, Credit Note).
     - Narration, date, ledger names, amounts, GST details.
4. **Pluggable `TallyProvider` POSTs XML to Tally HTTP API on port 9000.**
   - Real provider: network call.
   - Stub provider: logs XML for testing.
5. **On success, `TallySyncLog` created: `status = SYNCED`, Tally voucher number saved.**
   - On failure: `status = FAILED`, error stored, retry button shown.
6. **User views `GET /api/tally/log` to see sync history and failed items.**

### Branching / error paths

- **Tally not reachable**: Provider returns network error; `TallySyncLog.status = FAILED`.
- **Ledger not found in Tally**: Tally rejects; log stores the exact XML and Tally error message.
- **Duplicate sync**: `TallySyncLog` prevents re-syncing the same `JournalEntry` unless forced.

---

## WF-14: User Creation with Scoped Access

### Goal
Owner/admin creates a new team member with the correct role, scope, and reporting manager.

### Actors
OWNER / ADMIN / MANAGER.

### Detailed steps

1. **User opens Settings → “Settings” (`/settings`).**
2. **Clicks “Members” tab.**
3. **Clicks “Add Member”.**
   - Form: name, email, phone, employee code, designation, department, joining date, role.
4. **Role dropdown is filtered by `assignableRoles(actor)`.**
   - OWNER can assign any role.
   - PROJECT_MANAGER can assign SUPERVISOR, STORE_KEEPER, etc. (T4/T5).
5. **User selects Role = SUPERVISOR.**
   - `scopeType` dropdown appears with options: COMPANY, DEPARTMENT, PROJECT.
   - SUPERVISOR defaults to PROJECT.
6. **User selects PROJECT scope and picks projects from multi-select.**
   - `scopeEntries` are built: `[{projectId: P1}, {projectId: P2}]`.
7. **User selects “Reports To” from a dropdown of higher-level members in the same company.**
   - System validates no cycle via `wouldCreateCycle()`.
8. **User clicks “Save”.**
   - System calls `POST /api/companies/[id]/members`.
   - `assignScopedMembership()` validates:
     - actor can assign target role
     - scope entries match scope type
     - reportsTo is in same company and above in hierarchy
     - no reporting cycle
   - Creates `User`, `UserCompany`, `UserScope` rows.
   - Sends welcome email/SMS with temporary password or demo login.

### Branching / error paths

- **Email already exists**: Validation error; user can resend invite.
- **Cycle in reporting**: Error: “Cannot report to this person — it would create a reporting loop.”
- **Scope mismatch**: User selected PROJECT but added department entries: validation blocks.
- **Insufficient hierarchy**: PROJECT_MANAGER tries to assign another PROJECT_MANAGER: blocked by `canAssignRole`.

---

## WF-15: Feedback Capture

### Goal
Any user sends instant feedback to the owner/developer.

### Actors
All users.

### Detailed steps

1. **On any page (except auth/print), user clicks floating “Feedback” button bottom-right.**
   - `FeedbackDialog` opens.
2. **System auto-captures a screenshot of the current page using `html-to-image`.**
   - Screenshot preview appears; user can discard.
3. **User selects category:** BUG, FEATURE, UX, PRAISE, QUESTION, OTHER.
4. **User clicks microphone icon to record a voice note (MediaRecorder API).**
   - Live timer; stop; playback before submit.
5. **User types free-text description (max 5000 chars).**
6. **User clicks “Send Feedback”.**
   - System calls `POST /api/feedback`.
   - `createFeedback()` saves `Feedback` with `status = NEW`.
   - `logAction()` writes `FEEDBACK_CREATE`.
   - For DEVELOPER/OWNER/ADMIN, the button shows unread count; they can open `/feedback` inbox.
7. **Owner opens `/feedback` and sees list with filters: All / New / Read / Resolved / Archived.**
   - Clicking an item marks `NEW` → `READ`.
   - Owner can Resolve, Reopen, or Archive, each with a note.

### Branching / error paths

- **Screenshot capture fails (e.g., cross-origin image)**: User can upload manually or submit text-only.
- **Voice note > size limit**: Warn and compress/trim before upload.
- **No text and no voice**: Validation: “Please add a message or voice note.”

---

# Appendix B: Common UI Patterns

## Pattern P-1: Empty States
Every empty list answers three questions:
1. Is this broken? No.
2. Why is it empty? E.g., “No POs have been created this month.”
3. What do I do now? Primary action button: “Create your first PO”.

## Pattern P-2: Status Pills and Colour
- Only `StatusPill` and `statusColor()` define colour.
- Every pill has a dot + colour (colour alone fails ~8% of men).
- Status meaning groups: neutral / active / waiting / good / bad / alert.

## Pattern P-3: One Primary Action Per Page
- `PageHeader` `action` prop is the only `variant="default"` button.
- Everything else is `outline`, `ghost`, or `brand` (only for “start here” on empty states).

## Pattern P-4: Mobile Form Defaults
- Project/site auto-select from nearest GPS (`useNearestProject`).
- Date defaults to today or today+3.
- Supplier/material default to last used for this project.
- Sticky submit button at bottom.

## Pattern P-5: Next-Action Guidance
- `PageLead` shows one-line page purpose (auto-collapses after 3 visits).
- `NextActionCard` shows the one thing the user can do next, server-resolved by `resolveNextAction()`.
- `DoneStrip` replaces toasts for successful mutations and links to the next flow step.
