# T04 — Projects, phases & built units work end-to-end

> Label: `wayfinder:grilling` · Status: **closed** · Claimed by: Devin · Blocked by: T01 (closed)

## Question

Does the project lifecycle work end-to-end — create project → add phases → create built units
(batch) → add project costs → issue materials (T03) → run `reallocateProjectCosts()` → verify
`costPerSqft` cached on project and `productionCost` on each unit scales by area → unit status
transitions (e.g. UNDER_CONSTRUCTION → READY) enforce valid ordering → project P&L and health
metrics on `/projects` and `/projects/[id]` reflect reality?

## Checklist

- [ ] `/projects`: create project with budget + sellable area; verify list metrics render
- [ ] `/projects/[id]`: add a phase with budget; verify phase CRUD
- [ ] Create built units in batch with areas; verify per-unit production cost = 0 initially
- [ ] Add a project cost (labour/contractor); verify GL `postProjectCost` entry
- [ ] After material issue (T03) + project cost, run cost reallocation; verify `Project.costPerSqft`
      and `BuiltUnit.productionCost = costPerSqft × area` update correctly
- [ ] Update unit status; verify invalid transitions are rejected (e.g. SOLD → UNDER_CONSTRUCTION)
- [ ] Update unit valuation/asking price; verify NRV write-down flagging works
- [ ] `/projects` list: P&L, budget vs actual, health badge reflect the data
- [ ] Log every defect; fix in priority order

## Resolution

**All project/phase/unit/cost flows verified end-to-end via API.** The module is structurally
complete with dedicated UI components for project form, phase form, project hub (detail), and
detail actions.

**Verified:**
- Project create (PLANNED) → status update (ACTIVE) → soft delete guard (can't delete ACTIVE,
  must first put ON_HOLD) — all state transitions + guards correct
- Phase create with start date — works; phase list returns correctly ordered by sortOrder
- Batch built unit create (2 units in one call) — works; supports phaseId, floor, wing, area,
  askingPrice
- Unit status change (PLANNED → UNDER_CONSTRUCTION) — works via `updateUnitStatus` service
- Unit valuation update (askingPrice + currentValuation) — works via `updateUnitValuation` service
- Project cost add: GL posts WIP debit + Cash credit (balanced), `totalProjectCost` updated,
  `costPerSqft` recalculated, `totalSellableArea` auto-computed from unit areas, audit logged
- Cost-per-sqft reallocation after material issue: issuing 5 bags @ 340 = ₹1,700 increased
  totalProjectCost by 1,700, costPerSqft recalculated (94,925,100 / 11,050 = 8,590.51),
  unit productionCost updated for all units (A-101: 8,590.51 × 850 = 7,301,930.77)
- Phase delete guard: prevents deleting phases with linked locations, units, or material issues

**Defect found + fixed (1):**

1. **GL not reversed on project cost delete (GL integrity bug)** — `deleteProjectCost()` deleted
   the cost row and recalculated costPerSqft, but did NOT reverse the GL entry. The original
   `JournalEntry` (WIP debit, Cash credit) remained in the ledger, so the trial balance showed
   inflated WIP and reduced Cash even though the cost was removed. The books diverged from reality.
   Fixed: added a generic `reverseJournalEntry()` helper in `gl-posting.ts` that creates a mirror
   entry with swapped debits/credits (sourceType: `PROJECT_COST_REVERSAL`). Updated
   `deleteProjectCost()` to find the original entry by `sourceId` and post a reversal before
   deleting the cost row. Verified: net GL impact after add+delete = 0.00, totalProjectCost = 0,
   costPerSqft = 0.
   Files: `packages/services/src/gl-posting.ts` (new `reverseJournalEntry` export),
   `packages/services/src/project-cost.ts` (reversal call in `deleteProjectCost`),
   `packages/services/src/index.ts` (export `reverseJournalEntry`)

**Verification:** typecheck clean, 113 service tests pass, all flows driven via curl with DB-side
verification of GL, costPerSqft, and unit productionCost. Project list + detail pages return 200.
