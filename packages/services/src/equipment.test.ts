/**
 * Unit tests for pure equipment helpers in equipment.ts.
 *
 *   computeDepreciatedValue — straight-line depreciation: cost × (1 - rate × years)
 */
import { describe, it, expect } from "vitest";
import { computeDepreciatedValue } from "./equipment";
import Decimal from "decimal.js";

describe("computeDepreciatedValue", () => {
  it("computes depreciated value with straight-line depreciation", () => {
    // 100000 × (1 - 0.15 × 3) = 100000 × 0.55 = 55000
    const result = computeDepreciatedValue(
      new Decimal(100000),
      new Decimal(0.15),
      new Decimal(3),
    );
    expect(result.toNumber()).toBe(55000);
  });

  it("returns full cost when years elapsed is 0", () => {
    const result = computeDepreciatedValue(
      new Decimal(100000),
      new Decimal(0.15),
      new Decimal(0),
    );
    expect(result.toNumber()).toBe(100000);
  });

  it("returns full cost when rate is 0", () => {
    const result = computeDepreciatedValue(
      new Decimal(100000),
      new Decimal(0),
      new Decimal(5),
    );
    expect(result.toNumber()).toBe(100000);
  });

  it("returns 0 when fully depreciated", () => {
    // 100000 × (1 - 0.2 × 5) = 100000 × 0 = 0
    const result = computeDepreciatedValue(
      new Decimal(100000),
      new Decimal(0.2),
      new Decimal(5),
    );
    expect(result.toNumber()).toBe(0);
  });

  it("clamps to 0 when over-depreciated", () => {
    // 100000 × (1 - 0.2 × 6) = 100000 × (-0.2) = -20000 → clamped to 0
    const result = computeDepreciatedValue(
      new Decimal(100000),
      new Decimal(0.2),
      new Decimal(6),
    );
    expect(result.toNumber()).toBe(0);
  });

  it("handles fractional years", () => {
    // 100000 × (1 - 0.1 × 2.5) = 100000 × 0.75 = 75000
    const result = computeDepreciatedValue(
      new Decimal(100000),
      new Decimal(0.1),
      new Decimal(2.5),
    );
    expect(result.toNumber()).toBe(75000);
  });
});
