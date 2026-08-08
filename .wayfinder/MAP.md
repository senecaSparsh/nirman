# Wayfinder Map: Nirman Inventory — Full App Refinement

> Label: `wayfinder:map` · Tracker: local-markdown (`.wayfinder/`)
> Status: **active** · Created: 2026-08-02

## Destination

Every page and every button in Nirman Inventory works end-to-end — frontend → API → service → DB —
verified by actually using each module, with defects fixed and UX refined, so the app functions as a
real production tool. The map is done when no module has an unresolved defect and the way to "ship a
refined app" is clear enough to hand off.

## Notes

- **Domain**: construction + real-estate inventory OS. Monorepo: `packages/db` (Prisma),
  `packages/services` (business logic), `apps/web` (Next.js 16, PPR, shadcn UI).
- **Skills every session should consult**: read `AGENTS.md` first (conventions, gotchas, PPR pattern).
  Use `subagent_explore` for read-only investigation; `subagent_general` for fixes.
- **Standing preferences**: never hard-delete master entities (soft delete via `deletedAt`); money in
  `Decimal`; stock via `recordMovement()`/`recordTransfer()` only; every API handler calls
  `requirePermission()`; PPR pages use the `connection()` + `<Suspense>` pattern.
- **UX north star**: the easiest, best, streamlined experience. Every verification ticket must also
  judge UX — is the happy path obvious? Are clicks minimal? Do empty/loading/error states guide the
  user? Is the visual hierarchy clear? Log UX friction alongside functional defects; fix both.
  Prefer fewer screens with smart defaults over more forms. Distinguish "works" from "feels good."
- **Mechanical baseline (verified 2026-08-02)**: `pnpm typecheck` clean; 113 service tests pass;
  27 pages, 85 API routes, 50 Prisma models, 90+ service functions all structurally present.
  → The work is **functional verification + refinement**, not "build missing pieces."
- **How to work a ticket**: spin up the dev server (`pnpm dev`, port 3000/3001) + Postgres
  (`docker compose up -d`, port 5433), seed if needed, then click through the module's flows as a
  real user. Log every defect found. Fix in priority order. One module per ticket/session.

## Decisions so far

<!-- index — one line per closed ticket: gist + link to the ticket holding the detail -->

_(none yet — frontier just charted)_

- [T01 — Get the app running with seeded, realistic data](tickets/T01-run-and-seed.md) — App runs
  on local PG 15 (port 5432, no Docker needed); seed script at `packages/services/prisma/seed.ts`
  bootstraps a full realistic company; dev bypass auth gives a synthetic ADMIN user (no sign-in).
- [T02 — Procurement module works end-to-end](tickets/T02-procurement.md) — Full lifecycle verified
  (requisition→PO→receive); fixed dev-bypass user resolution (critical), seed company linkage,
  getCompany dev fallback; added reject-reason + approval-notes UX dialogs.
- [T03 — Stock, materials & transfers work end-to-end](tickets/T03-stock-materials.md) — All stock
  ledger flows verified (issue, transfer, stock count reconcile); fixed 3 critical gaps: material
  form missing reorderPoint/EOQ/LCI fields, stock count module completely unwired (added API+UI+nav),
  transfer form missing inter-company STO fields.
- [T04 — Projects, phases & built units work end-to-end](tickets/T04-projects-units.md) — All
  project/phase/unit/cost flows verified; fixed GL integrity bug: project cost delete wasn't
  reversing the GL entry (added `reverseJournalEntry` helper + wired into `deleteProjectCost`).
- [T05 — Land acquisition, partition & valuation work end-to-end](tickets/T05-land.md) — All land
  flows verified (purchase+GL, partition with area conservation, valuation, status); no defects found.
- [T06 — Sales & customers work end-to-end](tickets/T06-sales-customers.md) — All sales flows
  verified (customer CRUD, unit sale+GL+COGS, payments, cancel); fixed GL integrity bug: sale
  cancel wasn't reversing GL entries (wired `reverseJournalEntry` into `cancelSale`).
- [T07 — Finance & GL works end-to-end](tickets/T07-finance-gl.md) — Trial balance, account
  ledger, expenses, supplier returns all verified; fixed 2 bugs: expense delete wasn't reversing
  GL (same pattern as T04/T06), and RETURN movement was classified as IN instead of OUT (broke
  the entire supplier return flow — no return could ever complete).
- [T08 — Equipment management works end-to-end](tickets/T08-equipment.md) — Full lifecycle
  verified (create→assign→return→maintenance→complete→retire→unretire); excellent kanban UX
  with context-aware action buttons; no defects found.

## Not yet specified

<!-- in-scope fog you can't ticket yet; graduates as the frontier advances -->

- **Cross-module flows**: once individual modules are verified, the *interactions* need checking —
  e.g. does a requisition→PO→receipt→issue→project-cost→unit-valuation chain produce correct GL
  entries and unit costs end-to-end? Can't ticket precisely until per-module verification surfaces
  where the chain actually breaks.
- **Data seeding for verification**: ~~do we have realistic seed data?~~ **Resolved by T01** —
  `pnpm --filter @nirman/services seed` bootstraps a full company with end-to-end data across every
  module. Re-run anytime for a clean deterministic dataset.
- **Role/permission matrix in practice**: RBAC is defined in code, but does each role actually see
  the right nav + buttons + get correct 403s? Can't ticket per-role until we know which module's
  permission gate is the canonical one to test against.
- **Mobile/field UX**: the `/field` PWA page exists with offline queue — does it actually work on a
  phone over flaky network? Hardware-dependent; may need a separate verification pass.
- **Performance at volume**: no module has been load-tested. Fog until we know which screens render
  slowly with realistic row counts.

## New module build tickets (from brother's ERP design)

<!-- These are NEW modules that don't exist yet — build, not verify -->

- [T13 — HR & Field Workforce Management Module](tickets/T13-hr-field-workforce.md) — Biggest
  missing piece: labor attendance tracking, payroll computation (Monthly/Fixed), Daily Progress
  Reports (DPR) with mobile submission, comparative analysis. Needs new Prisma models, services,
  API routes, UI, and mobile-first field supervisor interface.
- [T14 — Rent & Lease Module](tickets/T14-rent-lease.md) — Tenancy agreements, recurring rental
  billing, payment tracking, GL posting for rental income. Currently only sell exists.
- [T15 — Hierarchical RBAC (Admin → Sub-Admin → Sub-Sub-Admin)](tickets/T15-hierarchical-rbac.md) —
  Multi-tier delegation hierarchy with scope filtering (region/department/project). Current RBAC
  is flat (6 roles, no reporting lines, no scope). Depends on T10 + T13.
- [T16 — Dynamic Pricing & Valuation Post-Renovation](tickets/T16-dynamic-pricing.md) —
  Renovation/addition tracking as distinct activities, automatic valuation recalculation after
  renovation, profitability analysis (cost-basis vs. post-renovation valuation vs. sale price).
- [T17 — Mobile + Desktop Feature Parity (PWA Enhancement)](tickets/T17-mobile-parity.md) —
  Mobile-optimized pages, bottom nav, offline-first architecture for field supervisors, camera
  integration for DPR progress photos. Depends on T13.

## Out of scope

<!-- work ruled beyond the destination; closed, never graduates -->

_(none yet)_
