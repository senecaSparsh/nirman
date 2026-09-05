/**
 * Unit tests for the pure petty cash helpers in petty-cash.ts.
 *
 *   computeLowBalanceThreshold — 20% of float amount
 *   isPettyCashLowBalance      — check if balance is below threshold
 */
import { describe, it, expect } from "vitest";
import { computeLowBalanceThreshold, isPettyCashLowBalance } from "./petty-cash";
import Decimal from "decimal.js";

describe("computeLowBalanceThreshold", () => {
  it("computes 20% of float amount", () => {
    expect(computeLowBalanceThreshold(new Decimal(10000)).toNumber()).toBe(2000);
  });

  it("returns 0 for zero float amount", () => {
    expect(computeLowBalanceThreshold(new Decimal(0)).toNumber()).toBe(0);
  });

  it("handles fractional float amounts", () => {
    expect(computeLowBalanceThreshold(new Decimal(500.5)).toNumber()).toBe(100.1);
  });
});

describe("isPettyCashLowBalance", () => {
  it("returns true when balance is below threshold", () => {
    // float = 10000, threshold = 2000, balance = 1500 → low
    expect(isPettyCashLowBalance(new Decimal(1500), new Decimal(10000))).toBe(true);
  });

  it("returns false when balance is above threshold", () => {
    // float = 10000, threshold = 2000, balance = 3000 → not low
    expect(isPettyCashLowBalance(new Decimal(3000), new Decimal(10000))).toBe(false);
  });

  it("returns false when balance equals threshold (not below)", () => {
    expect(isPettyCashLowBalance(new Decimal(2000), new Decimal(10000))).toBe(false);
  });

  it("returns true when balance is 0", () => {
    expect(isPettyCashLowBalance(new Decimal(0), new Decimal(10000))).toBe(true);
  });

  it("returns false when float is 0 and balance is 0 (threshold = 0)", () => {
    // Both are 0, so balance (0) is not less than threshold (0)
    expect(isPettyCashLowBalance(new Decimal(0), new Decimal(0))).toBe(false);
  });
});
