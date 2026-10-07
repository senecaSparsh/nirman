# Onboarding — Nirman Inventory OS

> A new engineer should be able to get the app running, understand the
> shape, and land a correct first change without asking anyone. This is that
> path. If it's wrong, fix it — an out-of-date onboarding doc is worse than
> none.

## Day 1 — get it running

```bash
git clone <repo> && cd nirman-inventory
nvm use                        # reads .nvmrc → Node 22
corepack enable                # pnpm via packageManager pin
pnpm install                   # postinstall generates the Prisma client
docker compose up -d db        # Postgres on port 5433 (not 5432)
cp .env.example .env           # fill DATABASE_URL etc.
pnpm db:push                   # local schema (dev only — prod uses migrate)
pnpm dev                       # http://localhost:3000 (auto-recovery wrapper)
```

Dev sign-in without a real account: `AUTH_BYPASS=true` in `apps/web/.env`,
or the one-click role buttons on `/sign-in` (demo users `…@nirman.in`,
password `nirman123`).

## Read in this order

1. **`AGENTS.md`** — conventions + the "never do X" rules. (~20 min, skim
   the commands/conventions, read the design-system section before UI work.)
2. **`DECISIONS.md`** — what to build next, the ranked backlog, and the
   authority-model invariants.
3. **`docs/ARCHITECTURE.md`** — the domain model and system framework.
4. **`docs/PRODUCTION-READINESS.md`** — the "interview": every reliability/
   security/scale question with evidence. Reading this is the fastest way
   to understand how the system is _supposed_ to behave.
5. **`docs/adr/`** — why the irreversible choices were made.
6. **`TESTING_FINDINGS.md`** — what's been verified end-to-end vs. what
   only looks built.

## Mental model (the 5 things that matter)

- **Two surfaces, one app**: desktop `/` and mobile `/m` share routes, DB,
  and logic. `route-manifest.ts` is the mobile-nav truth; `nav.ts` is the
  desktop truth.
- **The ledger is sacred**: stock and money move only through serializable
  service transactions that append the immutable `StockMovement`/`JournalEntry`
  in the same commit. Never update a balance column.
- **Scope is fail-closed**: every row carries `companyId`; visibility is
  resolved through `UserScope`. `Employee` never serializes raw.
- **Business logic lives in `packages/services`**, not route handlers —
  routes validate + call a service + return.
- **Self-healing is a feature**: the dev wrapper, prod wrapper, chunk
  recovery, and Sentry/ErrorLog are load-bearing. Don't bypass them
  casually.

## Your first good change

Pick a 🔧 item from `DECISIONS.md` Tier 0–2 (schema modeled, needs UI
wiring). It exercises the whole stack — schema → service → API → desktop
page → `route-manifest.ts` → mobile page — and lands inside every guard
the CI tests enforce.

## When you're stuck

- Runtime weirdness in dev → the wrapper probably already caught it;
  `pnpm dev:clean` resets its loop.
- "Cannot read properties of undefined (findMany)" → stale Prisma client
  in the `globalThis` singleton; `pnpm db:generate`.
- Page exists but nav won't show it → `route-manifest.ts` entry missing.
- Permission denied → check `getUserPermissions` effective union and the
  route's `perm`, not just the role.

## Where to ask

`docs/RUNBOOK.md` for "it's broken", `docs/CAPACITY.md` for "will it
scale", `docs/DEPENDENCIES.md` for "what breaks when X is down",
`.github/PULL_REQUEST_TEMPLATE.md` for "is my PR complete".
