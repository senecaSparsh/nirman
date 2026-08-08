# T01 — Get the app running with seeded, realistic data

> Label: `wayfinder:task` · Status: **closed** · Claimed by: Devin · Blocks: T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12

## Question

Can a developer clone this repo, start Postgres + the dev server, sign in, and see a workspace
populated with realistic data (companies, projects, materials, POs, receipts, sales) — so that
every subsequent module-verification ticket has something to click through?

This is a **task**, not a decision: nothing to decide, but every verification ticket is blocked
until the app runs with data. Resolve by doing the work, then recording the resulting facts
(seed command, seed script location, default login credentials, any setup gotchas hit) that later
tickets depend on.

## Checklist

- [ ] `docker compose up -d` starts Postgres on 5433
- [ ] `pnpm install` + `pnpm db:generate` + `pnpm db:push` succeed
- [ ] Determine whether a seed script exists (`packages/db/prisma/seed*` or similar). If not, that's
      a finding — flag it; verification tickets will need synthetic data created inline.
- [ ] `pnpm dev` starts on 3000 (or 3001); sign-in page loads
- [ ] Identify or create a default user + company; record the credentials
- [ ] Confirm the dashboard (`/`) renders with at least one project, one material, one PO
- [ ] Record: exact commands, seed location, credentials, any errors hit and how worked around

## Resolution

**Done.** App runs with rich seeded data. Setup facts for later tickets:

- **Postgres**: Homebrew PG 15 on port **5432** (Docker not required). DB: `nirman_inventory`.
  Created via `psql -p 5432 -d postgres -c "CREATE DATABASE nirman_inventory;"`.
- **Env files updated** (were pointing at Docker port 5433):
  - `.env` → `postgresql://sparshagarwal@localhost:5432/nirman_inventory`
  - `packages/db/.env` → same
  - `apps/web/.env` → same (kept `BETTER_AUTH_SECRET` + `NEXT_PUBLIC_APP_URL`)
- **Auth**: dev bypass is ON by default (non-production `NODE_ENV`). Synthetic "dev" ADMIN user
  (`id: "dev"`, `companyId: null`) — no sign-in needed. All API calls work without a real account.
- **Seed**: `pnpm --filter @nirman/services seed` — idempotent, wipes transactional data + re-creates.
  Located at `packages/services/prisma/seed.ts`. Seeds: 1 company (Nirman Constructions), 5 users,
  7 employees, 2 projects, 3 phases, 4 stock locations, 9 categories, 15 materials, 6 suppliers,
  4 subcontractors, 2 requisitions, 3 POs, 2 goods receipts, 3 material issues, 25 stock movements,
  2 transfers, 1 stock count, 1 supplier return, 6 equipment, 2 maintenance, 1 land purchase
  (partitioned → 3 parcels), 12 built units, 5 customers, 3 asset sales, 7 project costs, 5 expenses,
  7 audit logs. Chart of accounts seeded via `seedChartOfAccounts()`.
- **Dev server**: `pnpm dev` → http://localhost:3000 (falls back to 3001/3002 if occupied).
- **Verified**: `GET /` returns 200; dashboard fetches projects, POs, requisitions, materials,
  equipment, built units, land parcels from the DB.

**Gotcha hit**: three separate `.env` files (root, `packages/db`, `apps/web`) all had `DATABASE_URL`
pointing at Docker port 5433. All three needed updating to local PG 5432. Future setup should
consider a single source of truth for `DATABASE_URL`.
