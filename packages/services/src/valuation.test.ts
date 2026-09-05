/**
 * Unit tests for the pure valuation helper extracted from valuation.ts.
 *
 *   computeCostAllocation — cost-per-sqft and per-unit production cost
 *
 * IMPORTANT: These tests verify the exact logic from reallocateProjectCosts:
 *   - poolToAllocate = projectMaterials + labour + land − costRecovery (NO direct materials)
 *   - safePool = max(poolToAllocate, 0) (scrap can't make pool negative)
 *   - costPerSqft = safePool / totalArea (0 if no area)
 *   - unitCost = costPerSqft × area + directCost (per allocatable unit)
 *   - totalCost = projectMaterials + directMaterialsTotal + labour + land − costRecovery
 *     where directMaterialsTotal includes ALL direct costs (SOLD/PLANNED units too)
 */
import { describe, it, expect } from "vitest";
import { computeCostAllocation } from "./valuation";
import Decimal from "decimal.js";

describe("computeCostAllocation", () => {
  it("allocates pool proportionally by area (no direct costs)", () => {
    const r = computeCostAllocation({
      projectMaterials: new Decimal(500000),
      directMaterialsTotal: new Decimal(0),
      labour: new Decimal(200000),
      land: new Decimal(300000),
      costRecovery: new Decimal(0),
      totalArea: new Decimal(1000),
      units: [
        { id: "u1", area: new Decimal(500), directCost: new Decimal(0) },
        { id: "u2", area: new Decimal(500), directCost: new Decimal(0) },
      ],
    });
    // pool = 500000 + 200000 + 300000 - 0 = 1000000
    // costPerSqft = 1000000 / 1000 = 1000
    expect(r.costPerSqft.toNumber()).toBe(1000);
    expect(r.unitCosts[0]!.productionCost.toNumber()).toBe(500000); // 1000 × 500
    expect(r.unitCosts[1]!.productionCost.toNumber()).toBe(500000);
    // totalCost = 500000 + 0 + 200000 + 300000 - 0 = 1000000
    expect(r.totalCost.toNumber()).toBe(1000000);
  });

  it("adds direct-to-unit costs on top of area allocation", () => {
    const r = computeCostAllocation({
      projectMaterials: new Decimal(500000),
      directMaterialsTotal: new Decimal(50000),
      labour: new Decimal(0),
      land: new Decimal(0),
      costRecovery: new Decimal(0),
      totalArea: new Decimal(1000),
      units: [
        { id: "u1", area: new Decimal(500), directCost: new Decimal(50000) },
        { id: "u2", area: new Decimal(500), directCost: new Decimal(0) },
      ],
    });
    // pool = 500000 + 0 + 0 - 0 = 500000 (direct NOT in pool)
    // costPerSqft = 500000 / 1000 = 500
    expect(r.costPerSqft.toNumber()).toBe(500);
    // u1: 500×500 + 50000 = 300000
    expect(r.unitCosts[0]!.productionCost.toNumber()).toBe(300000);
    // u2: 500×500 + 0 = 250000
    expect(r.unitCosts[1]!.productionCost.toNumber()).toBe(250000);
    // totalCost = 500000 + 50000 + 0 + 0 - 0 = 550000
    expect(r.totalCost.toNumber()).toBe(550000);
  });

  it("totalCost includes direct costs for SOLD/PLANNED units not in allocatable set", () => {
    // This is the key distinction: directMaterialsTotal may include costs
    // for units that are NOT in the `units` array (e.g. SOLD units).
    // totalCost must still include those costs.
    const r = computeCostAllocation({
      projectMaterials: new Decimal(500000),
      directMaterialsTotal: new Decimal(100000), // includes 50k for u1 + 50k for a SOLD unit
      labour: new Decimal(0),
      land: new Decimal(0),
      costRecovery: new Decimal(0),
      totalArea: new Decimal(500),
      units: [
        // Only u1 is allocatable; the SOLD unit is NOT here
        { id: "u1", area: new Decimal(500), directCost: new Decimal(50000) },
      ],
    });
    // pool = 500000 (direct NOT in pool)
    // costPerSqft = 500000 / 500 = 1000
    expect(r.costPerSqft.toNumber()).toBe(1000);
    // u1: 1000×500 + 50000 = 550000
    expect(r.unitCosts[0]!.productionCost.toNumber()).toBe(550000);
    // totalCost = 500000 + 100000 (ALL direct) + 0 + 0 - 0 = 600000
    // NOT 550000 — the SOLD unit's 50k direct cost is still in totalCost
    expect(r.totalCost.toNumber()).toBe(600000);
  });

  it("subtracts scrap recovery from the pool", () => {
    const r = computeCostAllocation({
      projectMaterials: new Decimal(500000),
      directMaterialsTotal: new Decimal(0),
      labour: new Decimal(0),
      land: new Decimal(0),
      costRecovery: new Decimal(100000),
      totalArea: new Decimal(1000),
      units: [{ id: "u1", area: new Decimal(1000), directCost: new Decimal(0) }],
    });
    // pool = 500000 - 100000 = 400000, costPerSqft = 400
    expect(r.costPerSqft.toNumber()).toBe(400);
    expect(r.unitCosts[0]!.productionCost.toNumber()).toBe(400000);
    // totalCost = 500000 + 0 + 0 + 0 - 100000 = 400000
    expect(r.totalCost.toNumber()).toBe(400000);
  });

  it("clamps negative pool to zero (scrap exceeds costs)", () => {
    const r = computeCostAllocation({
      projectMaterials: new Decimal(100000),
      directMaterialsTotal: new Decimal(0),
      labour: new Decimal(0),
      land: new Decimal(0),
      costRecovery: new Decimal(150000),
      totalArea: new Decimal(1000),
      units: [{ id: "u1", area: new Decimal(1000), directCost: new Decimal(0) }],
    });
    // pool = 100000 - 150000 = -50000 → clamped to 0
    expect(r.costPerSqft.toNumber()).toBe(0);
    expect(r.unitCosts[0]!.productionCost.toNumber()).toBe(0);
    // totalCost = 100000 + 0 + 0 + 0 - 150000 = -50000 (NOT clamped — totalCost can be negative)
    expect(r.totalCost.toNumber()).toBe(-50000);
  });

  it("handles zero total area (no sellable units)", () => {
    const r = computeCostAllocation({
      projectMaterials: new Decimal(500000),
      directMaterialsTotal: new Decimal(0),
      labour: new Decimal(0),
      land: new Decimal(0),
      costRecovery: new Decimal(0),
      totalArea: new Decimal(0),
      units: [],
    });
    expect(r.costPerSqft.toNumber()).toBe(0);
    expect(r.unitCosts).toEqual([]);
    // totalCost is still computed even with no units
    expect(r.totalCost.toNumber()).toBe(500000);
  });
});
