import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  computeLogisticsComplexityIndex,
  decideProcurementScope,
  parseLciWeights,
  DEFAULT_LCI_WEIGHTS,
  DEFAULT_LCI_THRESHOLD,
  type LciWeights,
  type LineRoutingResult,
} from "./procurement-routing";

// ── helpers ────────────────────────────────────────────────────
const W: LciWeights = {
  w1: new Decimal(0.3),
  w2: new Decimal(0.2),
  w3: new Decimal(0.3),
  w4: new Decimal(0.2),
};

function line(
  materialId: string,
  lci: number,
  isCorporateCommodity = false,
): LineRoutingResult {
  return {
    materialId,
    lci: new Decimal(lci),
    isCorporateCommodity,
    forcesCentral: isCorporateCommodity,
  };
}

// ── computeLogisticsComplexityIndex ─────────────────────────────
describe("LCI: computeLogisticsComplexityIndex", () => {
  it("applies the formula LCI = w1·S + w2·(V/W) + w3·D − w4·Disc", () => {
    // S=10, V/W=2, D=50, Disc=5 ; W = {0.3,0.2,0.3,0.2}
    // = 0.3·10 + 0.2·2 + 0.3·50 − 0.2·5 = 3 + 0.4 + 15 − 1 = 17.4
    const lci = computeLogisticsComplexityIndex(
      { leadTimeDays: 10, volumetricDensity: 2, distanceKm: 50, bulkDiscountPct: 5 },
      W,
    );
    expect(lci.toNumber()).toBeCloseTo(17.4, 6);
  });

  it("subtracts the bulk-discount term (central buying lowers LCI)", () => {
    const without = computeLogisticsComplexityIndex(
      { leadTimeDays: 10, volumetricDensity: 2, distanceKm: 50, bulkDiscountPct: 0 },
      W,
    );
    const withDisc = computeLogisticsComplexityIndex(
      { leadTimeDays: 10, volumetricDensity: 2, distanceKm: 50, bulkDiscountPct: 20 },
      W,
    );
    // discount of 20 → subtracts 0.2·20 = 4
    expect(without.minus(withDisc).toNumber()).toBeCloseTo(4, 6);
  });

  it("treats absent inputs as 0", () => {
    const lci = computeLogisticsComplexityIndex(
      { leadTimeDays: 0, volumetricDensity: 0, distanceKm: 0, bulkDiscountPct: 0 },
      W,
    );
    expect(lci.toNumber()).toBe(0);
  });

  it("higher lead time raises LCI (favour central stockpiling)", () => {
    const fast = computeLogisticsComplexityIndex(
      { leadTimeDays: 2, volumetricDensity: 1, distanceKm: 10, bulkDiscountPct: 0 },
      W,
    );
    const slow = computeLogisticsComplexityIndex(
      { leadTimeDays: 30, volumetricDensity: 1, distanceKm: 10, bulkDiscountPct: 0 },
      W,
    );
    expect(slow.gt(fast)).toBe(true);
  });

  it("bulkier goods (higher V/W) raise LCI", () => {
    const compact = computeLogisticsComplexityIndex(
      { leadTimeDays: 5, volumetricDensity: 0.5, distanceKm: 20, bulkDiscountPct: 0 },
      W,
    );
    const bulky = computeLogisticsComplexityIndex(
      { leadTimeDays: 5, volumetricDensity: 8, distanceKm: 20, bulkDiscountPct: 0 },
      W,
    );
    expect(bulky.gt(compact)).toBe(true);
  });

  it("uses DEFAULT_LCI_WEIGHTS when none passed", () => {
    const lci = computeLogisticsComplexityIndex({
      leadTimeDays: 100,
      volumetricDensity: 100,
      distanceKm: 100,
      bulkDiscountPct: 0,
    });
    // = 0.3·100 + 0.2·100 + 0.3·100 − 0 = 30 + 20 + 30 = 80
    expect(lci.toNumber()).toBeCloseTo(80, 6);
  });
});

// ── decideProcurementScope ─────────────────────────────────────
describe("LCI: decideProcurementScope", () => {
  it("routes to PROJECT when all lines are below threshold", () => {
    const { scope, reason } = decideProcurementScope(
      [line("m1", 10), line("m2", 20)],
      50,
    );
    expect(scope).toBe("PROJECT");
    expect(reason).toContain("direct project procurement");
  });

  it("routes to COMPANY when any line LCI >= threshold", () => {
    const { scope, reason } = decideProcurementScope(
      [line("m1", 10), line("m2", 50)],
      50,
    );
    expect(scope).toBe("COMPANY");
    expect(reason).toContain("≥ threshold");
  });

  it("routes to COMPANY when any line is a corporate commodity, regardless of LCI", () => {
    const { scope, reason } = decideProcurementScope(
      [line("m1", 1, true), line("m2", 2)],
      50,
    );
    expect(scope).toBe("COMPANY");
    expect(reason).toContain("corporate commodity");
  });

  it("corporate-commodity routing takes precedence over a low LCI", () => {
    // Even with LCI 0, a corporate commodity forces central buying.
    const { scope } = decideProcurementScope([line("m1", 0, true)], 50);
    expect(scope).toBe("COMPANY");
  });

  it("reports the max LCI across lines", () => {
    const { maxLci } = decideProcurementScope(
      [line("m1", 12), line("m2", 47), line("m3", 3)],
      50,
    );
    expect(maxLci.toNumber()).toBe(47);
  });

  it("handles an empty line set (defaults to PROJECT, maxLci 0)", () => {
    const { scope, maxLci } = decideProcurementScope([], 50);
    expect(scope).toBe("PROJECT");
    expect(maxLci.toNumber()).toBe(0);
  });

  it("respects a Decimal threshold, not just a number", () => {
    const { scope } = decideProcurementScope(
      [line("m1", 49.99)],
      new Decimal(50),
    );
    expect(scope).toBe("PROJECT");
    const { scope: scope2 } = decideProcurementScope(
      [line("m1", 50)],
      new Decimal(50),
    );
    expect(scope2).toBe("COMPANY");
  });
});

// ── parseLciWeights ─────────────────────────────────────────────
describe("LCI: parseLciWeights", () => {
  it("parses a valid weights object", () => {
    const w = parseLciWeights({ w1: 0.4, w2: 0.1, w3: 0.4, w4: 0.1 });
    expect(w.w1.toNumber()).toBe(0.4);
    expect(w.w4.toNumber()).toBe(0.1);
  });

  it("falls back to defaults for missing keys", () => {
    const w = parseLciWeights({ w1: 0.5 });
    expect(w.w1.toNumber()).toBe(0.5);
    expect(w.w2.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w2.toNumber());
  });

  it("falls back to full defaults for null / invalid input", () => {
    const w = parseLciWeights(null);
    expect(w.w1.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w1.toNumber());
    const w2 = parseLciWeights("garbage");
    expect(w2.w3.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w3.toNumber());
  });

  it("falls back when a value is non-numeric", () => {
    const w = parseLciWeights({ w1: "abc", w2: 0.2, w3: 0.3, w4: 0.2 });
    expect(w.w1.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w1.toNumber());
  });
});

// ── end-to-end routing scenario (vision Scenario A) ─────────────
describe("LCI: end-to-end routing (bulk steel → central procurement)", () => {
  it("routes bulky, slow-lead, distant steel to COMPANY scope", () => {
    // 50 MT steel rebar: long lead (21d), bulky (V/W high), far supplier (120km),
    // modest bulk discount (8%). Threshold 50.
    const lci = computeLogisticsComplexityIndex(
      { leadTimeDays: 21, volumetricDensity: 6, distanceKm: 120, bulkDiscountPct: 8 },
      W,
    );
    // = 0.3·21 + 0.2·6 + 0.3·120 − 0.2·8 = 6.3 + 1.2 + 36 − 1.6 = 41.9
    expect(lci.toNumber()).toBeCloseTo(41.9, 6);
    const { scope } = decideProcurementScope([line("steel", lci.toNumber())], 50);
    // 41.9 < 50 → would be PROJECT by LCI alone, but steel is typically a corporate
    // commodity, so the commodity flag forces central procurement.
    const { scope: scopeWithCommodity } = decideProcurementScope(
      [line("steel", lci.toNumber(), true)],
      50,
    );
    expect(scope).toBe("PROJECT");
    expect(scopeWithCommodity).toBe("COMPANY");
  });

  it("routes a cheap, local, fast consumable to PROJECT scope", () => {
    const lci = computeLogisticsComplexityIndex(
      { leadTimeDays: 1, volumetricDensity: 0.2, distanceKm: 5, bulkDiscountPct: 2 },
      W,
    );
    // = 0.3·1 + 0.2·0.2 + 0.3·5 − 0.2·2 = 0.3 + 0.04 + 1.5 − 0.4 = 1.44
    expect(lci.toNumber()).toBeCloseTo(1.44, 6);
    const { scope } = decideProcurementScope([line("nails", lci.toNumber())], 50);
    expect(scope).toBe("PROJECT");
  });
});
