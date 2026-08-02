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
| **Procurement** | Requisitions (with auto-generation from reorder points), PO lifecycle (DRAFT→APPROVED→ORDERED→PARTIAL→RECEIVED), goods receipt, supplier returns. Procurement routing (LCI) for company vs. project receiving. |
| **Finance / GL** | Double-entry journal entries wired into every mutation. Chart of accounts (13 system accounts). Trial balance + account ledger. GST (input ITC + output). |
| **Sales** | Asset sales (built unit + land), staged payments, customers. |
| **Equipment** | Asset register, assignments, maintenance, retirement, NRV. |
| **Task execution** | SubTasks, comments, activity feed, dependencies, time logs, task detail drawer. |
| **RBAC** | 6 roles, ~25 permissions, additive overrides, multi-company membership. |
| **Audit log** | Every mutation logs an immutable `AuditLog` entry. |
| **PWA / Field** | Offline mutation queue, service worker, barcode scanning. |
| **Testify seed** | 19 departments, 30 materials, 17 department-wise consumption entries mirroring the PDF's ₹1.49 Cr total. Run via `pnpm --filter @nirman/services seed:testify`. |

**Verification:** typecheck clean, 113 unit tests passing, production
build succeeds.

---

## What's missing — prioritized

### P0 — HR / Payroll (biggest gap, explicitly in the whiteboard notes)

The `Employee` model is a bare stub (name/trade/phone/dailyRate) used
only for task assignment. The whiteboard notes (IMG_0873) call for:

- **Salary / CTC structure**: per-employee CTC breakdown (basic, HRA,
  allowances, deductions, PF, ESI, TDS). Monthly payroll runs that post
  to GL (salary expense + payable).
- **Salary composition / comparative analysis**: report comparing CTC
  components across employees/departments/months.
- **Attendance**: daily attendance (present/absent/half-day/leave),
  linked to the Employee master. Mobile-friendly entry.
- **DPR (Daily Progress Report)**: daily labour + work report per
  department/project — headcount, work done, hours. Feeds into the
  cost-center consumption report and project costing.
- **Daily labour / time tracking**: extend the existing TaskTimeLog
  concept to standalone labour attendance (not just tasks).

**Schema additions needed:** `PayrollRun`, `SalaryStructure`,
`AttendanceEntry`, `DailyProgressReport`, `DailyLabourEntry`.

### P1 — Purchase approval tiering

The real demand slip (PDF pp. 7-12) shows a 3-tier sign-off
(Purchaser → Store → MD) with live reference data (current closing
stock, last supplier, last rate) surfaced inline at raise-time, and
value-based routing (MD signature optional below a threshold).

Today: single `requisition.approve` permission.

**Needed:** multi-step approval workflow on `MaterialRequisition`
(requested → purchaser-reviewed → store-reviewed → approved), with
the reference-data panel on the requisition form and a configurable
value threshold for the final MD step.

### P2 — Gate entry / inbound logging

Real workflow stamps a Gate Entry (security gate register: Gate Entry
No., time, date, vehicle, supplier challan) before the goods reach the
store for GRN. No model exists.

**Needed:** `GateEntry` model with sequential per-fiscal-year
numbering, linked to the eventual `GoodsReceipt`.

### P3 — Fiscal-year document numbering

PO / issue / receipt numbers increment globally via `@unique`. Real
books reset each fiscal year (`P-000052` in May 2022 vs `P-000521` in
Jan 2021).

**Needed:** `FiscalYear` master + a numbering service that scopes
sequences per company + fiscal year.

### P4 — Catalog multi-company isolation

`MaterialCategory.name` is globally unique and `Material` /
`Supplier` have no `companyId`. This forces category-name prefixing
(see the Testify seed's `TO-` prefix) and means two companies share a
material catalog.

**Needed:** add `companyId` to `MaterialCategory`, `Material`, and
`Supplier`; migrate the unique constraints to `@@unique([companyId,
code/name])`. This is a schema migration with data backfill.

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
