# Nirman Inventory OS

Construction + Real Estate inventory management system. One company, many projects.
Offline-first PWA (mobile) + Tauri desktop app, single Next.js codebase.

## Stack

- **Monorepo**: Turborepo + pnpm 11
- **Web/PWA**: Next.js 16 (App Router, Turbopack) + Tailwind v4 + shadcn-style UI
- **Desktop** (Phase 5): Tauri 2 wrapping the web build
- **DB**: PostgreSQL + Prisma (server) → PowerSync local SQLite/OPFS (offline, Phase 5)
- **Auth**: Better-Auth (email/password, RBAC roles via `User.role`)
- **Validation**: Zod · **Charts**: Recharts · **Icons**: lucide-react

## Quick start

```bash
pnpm install

# 1. Start Postgres (port 5433 to avoid clashes)
docker compose up -d postgres

# 2. Push schema + generate client
pnpm db:push        # or pnpm db:migrate

# 3. Run dev server
pnpm dev            # http://localhost:3000 (or 3001 if 3000 is taken)
```

> If Docker isn't running, the dashboard still loads (it has no DB queries yet).
> DB-backed pages come online in Phase 1.

## Workspace layout

```
apps/web          Next.js app (UI, API routes, auth)
packages/db       Prisma schema + generated client (@nirman/db)
packages/ui       (reserved) shared UI primitives
docs/             design + architecture docs
```

## Domain model (two inventory universes)

1. **Materials** (inputs): catalog → stock at a StockLocation (Company Warehouse or Project Site)
   → procurement (PO with COMPANY/PROJECT scope) → goods receipt → stock ledger movements
   → transfers (company→project) → issues to project.
2. **Assets** (outputs): Land parcels (partitionable into sub-plots) + Built units (BHKs/shops/
   offices/warehouses) → status board → sale to customer → payments → profit.

> **📖 Full platform specification**: [`docs/PLATFORM.md`](docs/PLATFORM.md) — the single
> source of truth (2,500+ lines, 36 sections). It merges all prior design, logic, and
> architecture docs and extends them with a live codebase audit (101 Prisma models, 51
> service files, 180 API handlers, 144 UI pages, 187 components). The individual docs in
> `docs/` are retained for git history but superseded by `PLATFORM.md`.

## Key business rules (first-class in the schema)

- **Procurement scope** (`PurchaseOrder.procurementScope = COMPANY | PROJECT`): hard-logistics
  materials bought at company level then transferred; easy-logistics bought straight to a project.
- **Land partitioning**: a `LandParcel` splits into child parcels; parent → `PARTITIONED`;
  area conservation enforced (Σ children = parent).
- **Immutable stock ledger**: every quantity change is a `StockMovement` with `balanceAfter`.
- **Valuation**: material value, unsold asset value, project P&L all derived from the ledgers.

## Roles

`OWNER` · `MANAGER` · `SUPERVISOR` · `SALES` · `ACCOUNTANT` (stored on `User.role`).

## Phases

- Phase 0 (done): foundation — monorepo, Next.js, Tailwind+shadcn, Prisma schema, Better-Auth, shell.
- Phase 1: Material inventory (catalog, locations, POs, receipts, ledger, transfers, issues).
- Phase 2: Land (purchases, parcels, partition) + built units.
- Phase 3: Sales, customers, payments, invoices.
- Phase 4: Finance & reports (P&L, valuation, unsold value, audit).
- Phase 5: Offline-first (PowerSync) + Tauri desktop.
- Phase 6: Mobile UX polish, QR/barcode, photo capture, push.
