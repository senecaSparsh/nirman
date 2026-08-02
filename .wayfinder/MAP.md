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
- **Mechanical baseline (verified 2026-08-02)**: `pnpm typecheck` clean; 113 service tests pass;
  27 pages, 85 API routes, 50 Prisma models, 90+ service functions all structurally present.
  → The work is **functional verification + refinement**, not "build missing pieces."
- **How to work a ticket**: spin up the dev server (`pnpm dev`, port 3000/3001) + Postgres
  (`docker compose up -d`, port 5433), seed if needed, then click through the module's flows as a
  real user. Log every defect found. Fix in priority order. One module per ticket/session.

## Decisions so far

<!-- index — one line per closed ticket: gist + link to the ticket holding the detail -->

_(none yet — frontier just charted)_

## Not yet specified

<!-- in-scope fog you can't ticket yet; graduates as the frontier advances -->

- **Cross-module flows**: once individual modules are verified, the *interactions* need checking —
  e.g. does a requisition→PO→receipt→issue→project-cost→unit-valuation chain produce correct GL
  entries and unit costs end-to-end? Can't ticket precisely until per-module verification surfaces
  where the chain actually breaks.
- **Data seeding for verification**: do we have realistic seed data (projects with phases, units,
  POs, receipts, sales) to exercise every flow, or does verification stall on empty screens?
  Depends on what the first module tickets find.
- **Role/permission matrix in practice**: RBAC is defined in code, but does each role actually see
  the right nav + buttons + get correct 403s? Can't ticket per-role until we know which module's
  permission gate is the canonical one to test against.
- **Mobile/field UX**: the `/field` PWA page exists with offline queue — does it actually work on a
  phone over flaky network? Hardware-dependent; may need a separate verification pass.
- **Performance at volume**: no module has been load-tested. Fog until we know which screens render
  slowly with realistic row counts.

## Out of scope

<!-- work ruled beyond the destination; closed, never graduates -->

_(none yet)_
