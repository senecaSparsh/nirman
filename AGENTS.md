# Nirman Inventory OS — Agent Guide

## Commands

- `pnpm dev` — run web dev server (Turbopack). Uses port 3000, falls back to 3001.
- `pnpm build` / `pnpm lint` / `pnpm typecheck` — workspace-wide via Turbo.
- `pnpm db:generate` — regenerate Prisma client after schema changes.
- `pnpm db:push` — push schema to DB (dev). `pnpm db:migrate` for migrations.
- `pnpm db:studio` — Prisma Studio.

## Conventions

- **DB**: all Prisma models live in `packages/db/prisma/schema.prisma`. Import the client and
  types from `@nirman/db` (`import { prisma, ... } from "@nirman/db"`). After any schema change,
  run `pnpm db:generate` (and `pnpm db:push` against a running Postgres).
- **Money/quantities**: use `Decimal` (`@db.Decimal(14,2)` for money, `(14,3)` for quantities).
  Never use JS `number` for money in the DB layer.
- **Stock ledger**: NEVER mutate stock by updating a "current stock" column. Always append a
  `StockMovement` (immutable) with `balanceAfter`. Current stock = latest balanceAfter per
  material+location, or Σ IN − Σ OUT.
- **Procurement scope**: every `PurchaseOrder` must set `procurementScope` (COMPANY or PROJECT).
  COMPANY → receive into a company warehouse location; PROJECT → receive into a project site.
- **Land partition**: atomic transaction — validate Σ child area = parent area, create children,
  set parent `status = PARTITIONED`, record `LandPartition`.
- **UI**: shadcn-style primitives in `apps/web/src/components/ui/`. Use `cn()` from `@/lib/utils`.
  Tailwind v4 with theme tokens in `globals.css` (`@theme`). Sidebar nav config in `src/lib/nav.ts`.
- **API**: Route Handlers under `apps/web/src/app/api/`. Auth via Better-Auth
  (`src/lib/auth.ts`, handler at `api/auth/[...all]`).
- **Formatting helpers**: `formatCurrency`, `formatNumber`, `formatDate` in `@/lib/utils`.

## Gotchas

- Postgres runs on **port 5433** (docker-compose) to avoid clashing with other local DBs.
- Docker must be running for `db:push`/`db:migrate`. Dashboard loads without DB.
- pnpm 11 reads build allow-list from `pnpm-workspace.yaml` (`onlyBuiltDependencies`), NOT from
  the `pnpm` field in package.json.
- Next.js 16: Partial Prerendering is enabled via `cacheComponents: true` in `next.config.ts`
  (not `experimental.ppr`).
- The generated Prisma client is at `packages/db/src/generated/prisma` (gitignored). Always
  `pnpm db:generate` after checkout.
