/**
 * Unit tests for the pure helper `computeRoi()` in renovation.ts.
 *
 * ROI = (newValuation - originalValuation - actualCost) / actualCost × 100
 * Returns 0 when cost ≤ 0 (avoids division by zero).
 *
 * No DB, no mocking — pure function.
 */
import { describe, it, expect } from "vitest";
import { computeRoi } from "./renovation";
import Decimal from "decimal.js";

describe("computeRoi", () => {
  it("returns 0 when cost is 0 (division by zero guard)", () => {
    expect(computeRoi(100, 200, 0).toNumber()).toBe(0);
  });

  it("returns 0 when cost is negative", () => {
    expect(computeRoi(100, 200, -50).toNumber()).toBe(0);
  });

  it("computes positive ROI correctly", () => {
    // (200 - 100 - 50) / 50 × 100 = 100%
    expect(computeRoi(100, 200, 50).toNumber()).toBe(100);
  });

  it("computes negative ROI correctly", () => {
    // (100 - 200 - 50) / 50 × 100 = -300%
    expect(computeRoi(200, 100, 50).toNumber()).toBe(-300);
  });

  it("computes zero ROI when newValuation = originalValuation + cost", () => {
    // (150 - 100 - 50) / 50 × 100 = 0%
    expect(computeRoi(100, 150, 50).toNumber()).toBe(0);
  });

  it("accepts string inputs", () => {
    expect(computeRoi("100", "200", "50").toNumber()).toBe(100);
  });

  it("accepts Decimal inputs", () => {
    expect(computeRoi(new Decimal(100), new Decimal(200), new Decimal(50)).toNumber()).toBe(100);
  });

  it("handles large values", () => {
    // (20000000 - 10000000 - 5000000) / 5000000 × 100 = 100%
    expect(computeRoi(10000000, 20000000, 5000000).toNumber()).toBe(100);
  });
});
