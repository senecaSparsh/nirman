/**
 * Unit tests for the pure standard consumption helpers.
 *
 *   scaleStandardQty          — scale standard by work quantity
 *   computeConsumptionVariance — actual vs standard variance
 */
import { describe, it, expect } from "vitest";
import { scaleStandardQty, computeConsumptionVariance } from "./standard-consumption";
import Decimal from "decimal.js";

describe("scaleStandardQty", () => {
  it("scales standard by work quantity ratio", () => {
    // standardQty=1.5, baseQty=100, workQty=200 → 1.5 × 200/100 = 3
    const r = scaleStandardQty(new Decimal(1.5), new Decimal(100), new Decimal(200));
    expect(r.toNumber()).toBe(3);
  });

  it("returns standardQty unchanged when workQty is null", () => {
    const r = scaleStandardQty(new Decimal(1.5), new Decimal(100), null);
    expect(r.toNumber()).toBe(1.5);
  });

  it("returns standardQty unchanged when workQty is 0", () => {
    const r = scaleStandardQty(new Decimal(1.5), new Decimal(100), new Decimal(0));
    expect(r.toNumber()).toBe(1.5);
  });

  it("returns standardQty unchanged when baseQty is 0", () => {
    const r = scaleStandardQty(new Decimal(1.5), new Decimal(0), new Decimal(200));
    expect(r.toNumber()).toBe(1.5);
  });

  it("handles workQty equal to baseQty (no scaling)", () => {
    const r = scaleStandardQty(new Decimal(1.5), new Decimal(100), new Decimal(100));
    expect(r.toNumber()).toBe(1.5);
  });

  it("handles fractional work quantity", () => {
    // standardQty=2, baseQty=100, workQty=50.5 → 2 × 50.5/100 = 1.01
    const r = scaleStandardQty(new Decimal(2), new Decimal(100), new Decimal(50.5));
    expect(r.toNumber()).toBeCloseTo(1.01, 2);
  });
});

describe("computeConsumptionVariance", () => {
  it("computes positive variance (over-consumption)", () => {
    const r = computeConsumptionVariance(new Decimal(120), new Decimal(100));
    expect(r.variance.toNumber()).toBe(20);
    expect(r.variancePct.toNumber()).toBe(20);
    expect(r.isOverConsumption).toBe(true);
  });

  it("computes negative variance (under-consumption)", () => {
    const r = computeConsumptionVariance(new Decimal(80), new Decimal(100));
    expect(r.variance.toNumber()).toBe(-20);
    expect(r.variancePct.toNumber()).toBe(-20);
    expect(r.isOverConsumption).toBe(false);
  });

  it("computes zero variance (exact consumption)", () => {
    const r = computeConsumptionVariance(new Decimal(100), new Decimal(100));
    expect(r.variance.toNumber()).toBe(0);
    expect(r.variancePct.toNumber()).toBe(0);
    expect(r.isOverConsumption).toBe(false);
  });

  it("handles zero standard qty (variancePct = 0)", () => {
    const r = computeConsumptionVariance(new Decimal(50), new Decimal(0));
    expect(r.variance.toNumber()).toBe(50);
    expect(r.variancePct.toNumber()).toBe(0);
    expect(r.isOverConsumption).toBe(true);
  });

  it("handles zero actual qty", () => {
    const r = computeConsumptionVariance(new Decimal(0), new Decimal(100));
    expect(r.variance.toNumber()).toBe(-100);
    expect(r.variancePct.toNumber()).toBe(-100);
    expect(r.isOverConsumption).toBe(false);
  });

  it("handles fractional quantities", () => {
    const r = computeConsumptionVariance(new Decimal(1.5), new Decimal(1.2));
    expect(r.variance.toNumber()).toBeCloseTo(0.3, 2);
    expect(r.isOverConsumption).toBe(true);
  });
});
