# Nirman Inventory OS — System Design

> Construction + Real Estate inventory management for a single company with many projects.
> Offline-first PWA (mobile) + Tauri desktop app, one web codebase.

---

## 1. The Core Insight — Two Inventory Universes, One Backbone

Your brother's business has **two kinds of inventory** that share a procurement + valuation backbone:

| | Universe 1: MATERIALS (inputs) | Universe 2: ASSETS (outputs) |
|---|---|---|
| What | Cement, steel, bricks, paint, tiles, plumbing… | Land parcels, BHK flats, shops, offices, warehouse units |
| Lifecycle | Buy → stock at a location → consume into a project | Acquire/produce → hold → sell to a customer |
| Tracked by | Quantity + unit cost, per **Stock Location** | Per-unit identity, status, cost, valuation, sale |
| Movements | Receipts, transfers, issues, adjustments, returns | Partition (land), status changes, sale |

Everything links upward: **Material → Stock Location → Project → Company** and **Asset → Project → Company**, with **Sales** closing the money loop.

---

## 2. The Two Procurement Modes (the "logistics" rule)

This is the rule you described and it must be a first-class concept, not a free-text note:

- **COMPANY-scope procurement** — logistics are hard (bulk cement, steel, heavy items). Buy at company level → goods land in the **Company Warehouse** → later **transferred** to project sites as needed. Enables bulk discounts + central control.
- **PROJECT-scope procurement** — logistics are easy. Buy directly for a specific project → goods land in that **Project Site** location. No transfer needed.

Every `PurchaseOrder` has a `procurementScope = COMPANY | PROJECT`. This single field drives where goods are received and whether a transfer step is needed. Reports can show "company-bought vs project-bought" spend instantly.

---

## 3. Land Partitioning Logic

Land is inventory, but unlike materials it can be **subdivided**:

- A `LandPurchase` creates one or more `LandParcel`s (usually 1 = the whole plot).
- A `LandParcel` is the **atomic sellable unit**.
- A parcel can be **partitioned**: split into N child parcels. The parent's status → `PARTITIONED` (no longer sellable as a whole). Children become independently sellable.
- Partitioning can nest (a child partitioned again), but typically 1–2 levels.
- **Area conservation rule**: sum of child areas must equal parent area (validated on partition).
- Partition is an atomic transaction: lock parent area → create children → mark parent `PARTITIONED` → record a `LandPartition` event for audit.
- Each child carries its own area, asking price, valuation, and status.

This handles "buy a plot, sell as-is" (no partition, sell the single parcel) AND "buy a plot, divide into plots, sell each" (partition once, sell children).

---

## 4. Project → Asset Production

A `Project` (type: RESIDENTIAL | COMMERCIAL | WAREHOUSE | MALL | LAND | OTHER) produces sellable `BuiltUnit`s:

- Unit types: 1BHK / 2BHK / 3BHK / 4BHK / SHOP / OFFICE / WAREHOUSE_UNIT / OTHER.
- Each unit: number, floor, wing, area, status (PLANNED → UNDER_CONSTRUCTION → AVAILABLE → HOLD → SOLD), production cost, asking price, current valuation.
- Cost accumulation: material issues to the project + labour/overhead (`ProjectCost`) + allocated land cost → rolls into project cost and (optionally) per-unit cost.

---

## 5. Valuation & Profitability (the "what is it worth" question)

You asked: "how much it sold, or if not sold, what is the value, which project, which company."

- **Material inventory value** = Σ (stock qty × current unit cost) per location.
- **Unsold asset value** = Σ (available/hold assets × current valuation), groupable by project / type / company.
- **Project cost** = Σ material issues to project + Σ ProjectCost (labour/overhead/equipment/contractor/permits) + allocated land cost.
- **Project revenue** = Σ AssetSale for that project.
- **Project profit** = revenue − cost.
- **Unit/parcel profit** = salePrice − (productionCost/acquisitionCost + allocated overhead).

All derived from the immutable ledgers (StockMovement + AssetSale + ProjectCost), so numbers are always reconstructable and auditable.

---

## 6. The Stock Ledger — Single Source of Truth for Materials

Every material quantity change is an **immutable `StockMovement`**:

```
type: PURCHASE_RECEIPT | TRANSFER_IN | TRANSFER_OUT | ISSUE_TO_PROJECT
      | ADJUSTMENT_IN | ADJUSTMENT_OUT | RETURN | SALE
fromLocationId?, toLocationId?, qty, unitCost, balanceAfter,
reason, refType, refId, timestamp, userId
```

- Current stock at a location = latest `balanceAfter` per material (or sum of IN − OUT).
- Full audit trail for any material, any location, any date range.
- Adjustments (stock counts) produce ADJUSTMENT movements with variance logged.

---

## 7. Data Model (entities)

```
Company            id, name, gstin, pan, address, currency   (singleton now, multi-ready)
Project            id, companyId, name, type, status, address, startDate, endDate, totalBudget
StockLocation      id, type(COMPANY_WAREHOUSE|PROJECT_SITE), companyId, projectId?, name, address
MaterialCategory   id, name, unit
Material           id, code, name, categoryId, unit, hsnCode, gstRate, standardCost, currentCost, minStock
Supplier           id, name, gstin, phone, email, address, balanceOwed

PurchaseOrder      id, poNumber, supplierId, procurementScope(COMPANY|PROJECT),
                   companyId, projectId?, destinationLocationId, status, dates, totals
PurchaseOrderLine  id, purchaseOrderId, materialId, qtyOrdered, qtyReceived, unitCost, gstRate, lineTotal
GoodsReceipt       id, purchaseOrderId, locationId, receiptDate, receivedById
GoodsReceiptLine   id, goodsReceiptId, purchaseOrderLineId, materialId, qtyReceived, unitCost

StockMovement      id, materialId, movementType, fromLocationId?, toLocationId?,
                   qty, unitCost, balanceAfter, reason, refType, refId, timestamp, userId
MaterialIssue      id, projectId, fromLocationId, issueDate, issuedById, totalCost
MaterialIssueLine  id, materialIssueId, materialId, qty, unitCost
StockTransfer      id, fromLocationId, toLocationId, transferDate, status
StockTransferLine  id, stockTransferId, materialId, qty
StockCount         id, locationId, countDate, status
StockCountLine     id, stockCountId, materialId, countedQty, systemQty, variance

LandPurchase       id, companyId, projectId?, sellerName, purchaseDate, totalArea, areaUnit,
                   totalCost, registryNo, location, documentUrl
LandParcel         id, landPurchaseId, parentParcelId?, number, area, areaUnit,
                   status(AVAILABLE|HOLD|PARTITIONED|SOLD), acquisitionCost, askingPrice,
                   currentValuation, saleId?, projectId?
LandPartition      id, parentParcelId, partitionDate, childCount, notes

BuiltUnit          id, projectId, unitType, unitNumber, floor, wing, area, areaUnit,
                   status(PLANNED|UNDER_CONSTRUCTION|AVAILABLE|HOLD|SOLD),
                   productionCost, askingPrice, currentValuation, saleId?

Customer           id, name, phone, email, gstin?, address
AssetSale          id, saleNumber, assetType(LAND|BUILT_UNIT), landParcelId?, builtUnitId?,
                   customerId, projectId, companyId, salePrice, saleDate, paymentStatus, paymentMode
AssetSalePayment   id, assetSaleId, amount, paymentDate, mode, reference, status

ProjectCost        id, projectId, costType(LABOUR|OVERHEAD|EQUIPMENT|CONTRACTOR|PERMIT|OTHER),
                   amount, date, vendor, notes, receiptUrl
Expense            id, companyId, projectId?, category, amount, date, notes
AuditLog           id, userId, action, entityType, entityId, before, after, timestamp
User               id, email, name, role(OWNER|MANAGER|SUPERVISOR|SALES|ACCOUNTANT)
```

---

## 8. Tech Stack (chosen for best UI/UX + speed + offline)

| Layer | Choice | Why |
|---|---|---|
| Monorepo | **Turborepo + pnpm** | Fast, simple, shared packages |
| Web/PWA | **Next.js 16 (App Router)** | Best web UI/UX, RSC, PWA-ready, fast |
| Desktop | **Tauri 2** | Rust-based, tiny + fast native desktop wrapping the web build; embedded SQLite for offline. Beats Electron on size/speed/security |
| UI | **Tailwind v4 + shadcn/ui** | Best-in-class accessible, beautiful, fast components |
| Server DB | **PostgreSQL** | Industrial-grade, relational, fits the ledger model |
| Local/offline DB | **SQLite (Tauri) / OPFS (PWA)** via **PowerSync** | Local-first: reads/writes hit local DB, bidirectional sync to Postgres with conflict resolution |
| ORM | **Prisma** | Type-safe schema + migrations |
| Auth | **Better-Auth** | Self-hosted, modern, RBAC |
| Validation | **Zod** | Shared client/server schemas |
| Data fetching | **TanStack Query** + PowerSync reactive queries | Server cache + live local reactive data |
| Charts | **Recharts** | Dashboards/valuations |
| Forms | **React Hook Form + Zod** | Fast, typed forms |
| Tests | **Vitest + Playwright** | Unit + E2E |

**Offline-first pattern**: local SQLite/OPFS is the read+write source of truth on the device; PowerSync replicates to Postgres and back. Field staff enter receipts/issues/sales with no signal; sync auto-resolves on reconnection. Desktop (Tauri) ships the same web build + native SQLite, so the office machine works fully offline too.

---

## 9. Architecture

```
┌───────────────────────────────────────────────────────┐
│  Clients — one Next.js codebase                        │
│  ┌──────────────┐       ┌────────────────┐            │
│  │ Web / PWA    │       │ Tauri Desktop  │            │
│  │ (mobile+web) │       │ (wraps web)    │            │
│  │  OPFS local  │       │  SQLite local  │            │
│  └──────┬───────┘       └───────┬────────┘            │
│         └────────┬──────────────┘                      │
│           PowerSync local DB (reactive, offline writes)│
└─────────────────────┼─────────────────────────────────┘
                      │ bidirectional sync (conflict-resolved)
                      ▼
┌───────────────────────────────────────────────────────┐
│  Server — Next.js Route Handlers / Server Actions      │
│  Prisma · Better-Auth (RBAC) · Business logic services │
│  (procurement, partition, stock ledger, valuation)     │
└─────────────────────┬─────────────────────────────────┘
                      ▼
┌───────────────────────────────────────────────────────┐
│  PostgreSQL  +  PowerSync sync engine                   │
└───────────────────────────────────────────────────────┘
```

---

## 10. UI/UX Surfaces (role-based, one app)

Roles: **Owner** (brother), **Manager**, **Site Supervisor**, **Sales**, **Accountant**.

1. **Dashboard** — inventory value, unsold asset value, active projects, pending POs, recent sales, low-stock alerts, cash snapshot.
2. **Projects** — list + detail (overview, units, land, materials consumed, costs, P&L, sales). Filter by type/status.
3. **Material Inventory** — catalog master, stock by location, movements ledger, low-stock alerts, stock counts/adjustments.
4. **Procurement** — purchase orders (COMPANY/PROJECT scope), goods receipts, suppliers, transfers (company→project).
5. **Material Issues** — issue materials to a project from a location (site supervisor flow).
6. **Land** — purchases, parcels, **partition action**, parcel status board.
7. **Built Units** — per-project unit inventory, status board, pricing, valuation.
8. **Sales** — asset sales (land/unit), customers, payments/installments, invoices.
9. **Finance / Reports** — project P&L, inventory valuation, unsold value, cost breakdown, expenses, audit log.
10. **Settings** — company, users/roles, materials master, locations.

**Mobile PWA focus**: dashboard, stock by location, quick movement entry (receive/issue/transfer), land/unit status boards, sales entry, low-stock alerts, photo/QR capture. All offline-capable.

---

## 11. Phased Roadmap

| Phase | Weeks | Outcome |
|---|---|---|
| 0 Foundation | 1–2 | Monorepo, Next.js, Tailwind+shadcn, Prisma+Postgres, Better-Auth, base schema, deploy |
| 1 Material Inventory | 2–4 | Materials master, locations, POs (company/project scope), goods receipts, stock ledger, transfers, issues, low-stock alerts |
| 2 Land & Assets | 4–6 | Land purchases, parcels, partition action, built units, status boards, valuation |
| 3 Sales & Customers | 6–7 | Asset sales, customers, payments/installments, invoices, profit calc |
| 4 Finance & Reports | 7–8 | Project P&L, inventory valuation, unsold value, cost breakdown, expenses, audit log, dashboard |
| 5 Offline + Desktop | 8–10 | PowerSync integration, PWA offline, Tauri desktop wrapper, conflict handling |
| 6 Polish & Mobile UX | 10–11 | Mobile-optimized flows, QR/barcode for materials, photo capture, push notifications |

---

## 12. Key Business Logic Services (server-side, pure + tested)

- `procurementService` — create PO with scope validation, receive goods → emit StockMovement(PURCHASE_RECEIPT), update PO status/qtyReceived.
- `transferService` — company→project transfer: emit TRANSFER_OUT (from) + TRANSFER_IN (to), atomic.
- `issueService` — issue materials to project: emit ISSUE_TO_PROJECT, decrement stock, accumulate project material cost.
- `partitionService` — validate area conservation, create child parcels, mark parent PARTITIONED, record LandPartition. Atomic transaction.
- `saleService` — sell land/unit: mark asset SOLD, create AssetSale + payments, compute profit, lock asset.
- `valuationService` — material inventory value, unsold asset value, project P&L, unit cost allocation.
- `stockLedgerService` — append-only movements, balance computation, adjustment from stock counts.

Each is a pure, unit-testable function over the DB transaction; the API layer is thin.
