/**
 * Unit tests for the pure procurement routing helpers in procurement-routing.ts.
 *
 *   computeLogisticsComplexityIndex — LCI = w1·S_lead + w2·(V/W) + w3·D − w4·Disc
 *   decideProcurementScope          — COMPANY if corporate commodity OR LCI ≥ threshold
 *   parseLciWeights                 — parse JSON config into validated weights
 *
 * No DB, no mocking — pure functions.
 */
import { describe, it, expect } from "vitest";
import {
  computeLogisticsComplexityIndex,
  decideProcurementScope,
  parseLciWeights,
  DEFAULT_LCI_WEIGHTS,
  DEFAULT_LCI_THRESHOLD,
  type LciFactors,
  type LineRoutingResult,
} from "./procurement-routing";
import Decimal from "decimal.js";

describe("computeLogisticsComplexityIndex", () => {
  it("computes LCI with default weights", () => {
    // LCI = 0.3·10 + 0.2·5 + 0.3·50 − 0.2·10 = 3 + 1 + 15 − 2 = 17
    const factors: LciFactors = {
      leadTimeDays: 10,
      volumetricDensity: 5,
      distanceKm: 50,
      bulkDiscountPct: 10,
    };
    expect(computeLogisticsComplexityIndex(factors).toNumber()).toBe(17);
  });

  it("returns 0 when all factors are 0", () => {
    const factors: LciFactors = {
      leadTimeDays: 0,
      volumetricDensity: 0,
      distanceKm: 0,
      bulkDiscountPct: 0,
    };
    expect(computeLogisticsComplexityIndex(factors).toNumber()).toBe(0);
  });

  it("subtracts bulk discount from the score", () => {
    const base: LciFactors = {
      leadTimeDays: 10,
      volumetricDensity: 5,
      distanceKm: 50,
      bulkDiscountPct: 0,
    };
    const withDiscount: LciFactors = {
      leadTimeDays: 10,
      volumetricDensity: 5,
      distanceKm: 50,
      bulkDiscountPct: 20,
    };
    const baseLci = computeLogisticsComplexityIndex(base).toNumber();
    const discountLci = computeLogisticsComplexityIndex(withDiscount).toNumber();
    // Discount of 20 → subtract 0.2·20 = 4
    expect(baseLci - discountLci).toBe(4);
  });

  it("accepts custom weights", () => {
    const factors: LciFactors = {
      leadTimeDays: 10,
      volumetricDensity: 5,
      distanceKm: 50,
      bulkDiscountPct: 10,
    };
    const weights = {
      w1: new Decimal(0.5),
      w2: new Decimal(0),
      w3: new Decimal(0.5),
      w4: new Decimal(0),
    };
    // LCI = 0.5·10 + 0·5 + 0.5·50 − 0·10 = 5 + 0 + 25 − 0 = 30
    expect(computeLogisticsComplexityIndex(factors, weights).toNumber()).toBe(30);
  });

  it("handles null/undefined factors as 0", () => {
    const factors: LciFactors = {
      leadTimeDays: null as unknown as number,
      volumetricDensity: undefined as unknown as number,
      distanceKm: 0,
      bulkDiscountPct: 0,
    };
    expect(computeLogisticsComplexityIndex(factors).toNumber()).toBe(0);
  });
});

describe("decideProcurementScope", () => {
  it("routes to COMPANY when any line is a corporate commodity", () => {
    const lines: LineRoutingResult[] = [
      { materialId: "m1", lci: new Decimal(10), isCorporateCommodity: false, forcesCentral: false },
      { materialId: "m2", lci: new Decimal(5), isCorporateCommodity: true, forcesCentral: true },
    ];
    const result = decideProcurementScope(lines, 50);
    expect(result.scope).toBe("COMPANY");
    expect(result.reason).toContain("corporate commodity");
  });

  it("routes to COMPANY when max LCI >= threshold", () => {
    const lines: LineRoutingResult[] = [
      { materialId: "m1", lci: new Decimal(60), isCorporateCommodity: false, forcesCentral: false },
      { materialId: "m2", lci: new Decimal(30), isCorporateCommodity: false, forcesCentral: false },
    ];
    const result = decideProcurementScope(lines, 50);
    expect(result.scope).toBe("COMPANY");
    expect(result.maxLci.toNumber()).toBe(60);
    expect(result.reason).toContain("≥ threshold");
  });

  it("routes to PROJECT when max LCI < threshold and no corporate commodities", () => {
    const lines: LineRoutingResult[] = [
      { materialId: "m1", lci: new Decimal(20), isCorporateCommodity: false, forcesCentral: false },
      { materialId: "m2", lci: new Decimal(30), isCorporateCommodity: false, forcesCentral: false },
    ];
    const result = decideProcurementScope(lines, 50);
    expect(result.scope).toBe("PROJECT");
    expect(result.maxLci.toNumber()).toBe(30);
    expect(result.reason).toContain("< threshold");
  });

  it("routes to PROJECT for empty lines (max LCI = 0 < threshold)", () => {
    const result = decideProcurementScope([], 50);
    expect(result.scope).toBe("PROJECT");
    expect(result.maxLci.toNumber()).toBe(0);
  });

  it("routes to COMPANY when LCI exactly equals threshold (>=)", () => {
    const lines: LineRoutingResult[] = [
      { materialId: "m1", lci: new Decimal(50), isCorporateCommodity: false, forcesCentral: false },
    ];
    const result = decideProcurementScope(lines, 50);
    expect(result.scope).toBe("COMPANY");
  });

  it("corporate commodity takes priority over LCI threshold", () => {
    const lines: LineRoutingResult[] = [
      { materialId: "m1", lci: new Decimal(5), isCorporateCommodity: true, forcesCentral: true },
    ];
    const result = decideProcurementScope(lines, 50);
    expect(result.scope).toBe("COMPANY");
    expect(result.reason).toContain("corporate commodity");
  });
});

describe("parseLciWeights", () => {
  it("returns default weights for null/undefined input", () => {
    const result = parseLciWeights(null);
    expect(result.w1.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w1.toNumber());
    expect(result.w2.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w2.toNumber());
    expect(result.w3.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w3.toNumber());
    expect(result.w4.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w4.toNumber());
  });

  it("returns default weights for non-object input", () => {
    const result = parseLciWeights("invalid");
    expect(result.w1.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w1.toNumber());
  });

  it("parses valid weight objects", () => {
    const result = parseLciWeights({ w1: 0.4, w2: 0.1, w3: 0.4, w4: 0.1 });
    expect(result.w1.toNumber()).toBe(0.4);
    expect(result.w2.toNumber()).toBe(0.1);
    expect(result.w3.toNumber()).toBe(0.4);
    expect(result.w4.toNumber()).toBe(0.1);
  });

  it("falls back to default for missing keys", () => {
    const result = parseLciWeights({ w1: 0.5 });
    expect(result.w1.toNumber()).toBe(0.5);
    expect(result.w2.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w2.toNumber());
    expect(result.w3.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w3.toNumber());
    expect(result.w4.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w4.toNumber());
  });

  it("falls back to default for invalid values", () => {
    const result = parseLciWeights({ w1: "not-a-number" });
    expect(result.w1.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w1.toNumber());
  });

  it("handles null values in weight object", () => {
    const result = parseLciWeights({ w1: null, w2: 0.5, w3: null, w4: null });
    expect(result.w1.toNumber()).toBe(DEFAULT_LCI_WEIGHTS.w1.toNumber());
    expect(result.w2.toNumber()).toBe(0.5);
  });
});

describe("DEFAULT_LCI_THRESHOLD", () => {
  it("is 50", () => {
    expect(DEFAULT_LCI_THRESHOLD.toNumber()).toBe(50);
  });
});

describe("DEFAULT_LCI_WEIGHTS", () => {
  it("weights sum to 1.0", () => {
    const sum = DEFAULT_LCI_WEIGHTS.w1
      .plus(DEFAULT_LCI_WEIGHTS.w2)
      .plus(DEFAULT_LCI_WEIGHTS.w3)
      .plus(DEFAULT_LCI_WEIGHTS.w4);
    expect(sum.toNumber()).toBe(1);
  });
});
