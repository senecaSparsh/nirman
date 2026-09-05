/**
 * Unit tests for the pure stock count helpers in stock-count.ts.
 *
 *   computeStockCountVariance — variance = counted − system, with direction
 *   computeAdjustmentValue    — |variance| × unitCost
 */
import { describe, it, expect } from "vitest";
import { computeStockCountVariance, computeAdjustmentValue } from "./stock-count";
import Decimal from "decimal.js";

describe("computeStockCountVariance", () => {
  it("returns positive variance with ADJUSTMENT_IN direction", () => {
    const r = computeStockCountVariance(new Decimal(105), new Decimal(100));
    expect(r.variance.toNumber()).toBe(5);
    expect(r.direction).toBe("ADJUSTMENT_IN");
  });

  it("returns negative variance with ADJUSTMENT_OUT direction", () => {
    const r = computeStockCountVariance(new Decimal(95), new Decimal(100));
    expect(r.variance.toNumber()).toBe(-5);
    expect(r.direction).toBe("ADJUSTMENT_OUT");
  });

  it("returns zero variance with null direction", () => {
    const r = computeStockCountVariance(new Decimal(100), new Decimal(100));
    expect(r.variance.toNumber()).toBe(0);
    expect(r.direction).toBeNull();
  });

  it("handles fractional variances", () => {
    const r = computeStockCountVariance(new Decimal(100.5), new Decimal(100));
    expect(r.variance.toNumber()).toBe(0.5);
    expect(r.direction).toBe("ADJUSTMENT_IN");
  });

  it("handles zero system qty", () => {
    const r = computeStockCountVariance(new Decimal(10), new Decimal(0));
    expect(r.variance.toNumber()).toBe(10);
    expect(r.direction).toBe("ADJUSTMENT_IN");
  });

  it("handles zero counted qty (all stock missing)", () => {
    const r = computeStockCountVariance(new Decimal(0), new Decimal(100));
    expect(r.variance.toNumber()).toBe(-100);
    expect(r.direction).toBe("ADJUSTMENT_OUT");
  });
});

describe("computeAdjustmentValue", () => {
  it("computes value for positive variance", () => {
    expect(computeAdjustmentValue(new Decimal(5), new Decimal(100)).toNumber()).toBe(500);
  });

  it("computes value for negative variance (uses absolute value)", () => {
    expect(computeAdjustmentValue(new Decimal(-5), new Decimal(100)).toNumber()).toBe(500);
  });

  it("returns 0 for zero variance", () => {
    expect(computeAdjustmentValue(new Decimal(0), new Decimal(100)).toNumber()).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    expect(computeAdjustmentValue(new Decimal(3), new Decimal(33.333)).toNumber()).toBe(100);
  });

  it("handles zero unit cost", () => {
    expect(computeAdjustmentValue(new Decimal(10), new Decimal(0)).toNumber()).toBe(0);
  });
});
