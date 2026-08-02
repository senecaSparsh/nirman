# T04 — Projects, phases & built units work end-to-end

> Label: `wayfinder:grilling` · Status: **open** · Blocked by: T01

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

_(filled on close)_
