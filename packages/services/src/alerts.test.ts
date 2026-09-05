/**
 * Unit tests for pure alert helpers in alerts.ts.
 *
 *   computeWilsonEoq    — Economic Order Quantity: sqrt(2DS/H)
 *   computeNrvWriteDown — cost minus NRV (if NRV < cost)
 */
import { describe, it, expect } from "vitest";
import { computeWilsonEoq, computeNrvWriteDown } from "./alerts";
import Decimal from "decimal.js";

describe("computeWilsonEoq", () => {
  it("computes EOQ = sqrt(2DS/H) for valid inputs", () => {
    // D=1000, S=100, H=10 → sqrt(2×1000×100/10) = sqrt(20000) = 141.42
    const result = computeWilsonEoq(new Decimal(1000), new Decimal(100), new Decimal(10));
    expect(result?.toNumber()).toBeCloseTo(141.42, 1);
  });

  it("returns null when any parameter is null", () => {
    expect(computeWilsonEoq(null, new Decimal(100), new Decimal(10))).toBeNull();
    expect(computeWilsonEoq(new Decimal(1000), null, new Decimal(10))).toBeNull();
    expect(computeWilsonEoq(new Decimal(1000), new Decimal(100), null)).toBeNull();
  });

  it("returns null when any parameter is zero", () => {
    expect(computeWilsonEoq(new Decimal(0), new Decimal(100), new Decimal(10))).toBeNull();
    expect(computeWilsonEoq(new Decimal(1000), new Decimal(0), new Decimal(10))).toBeNull();
    expect(computeWilsonEoq(new Decimal(1000), new Decimal(100), new Decimal(0))).toBeNull();
  });

  it("returns null when any parameter is negative", () => {
    expect(computeWilsonEoq(new Decimal(-1), new Decimal(100), new Decimal(10))).toBeNull();
    expect(computeWilsonEoq(new Decimal(1000), new Decimal(-1), new Decimal(10))).toBeNull();
    expect(computeWilsonEoq(new Decimal(1000), new Decimal(100), new Decimal(-1))).toBeNull();
  });

  it("rounds to 2 decimal places", () => {
    // D=500, S=50, H=3 → sqrt(2×500×50/3) = sqrt(16666.67) = 129.0994... → 129.10
    const result = computeWilsonEoq(new Decimal(500), new Decimal(50), new Decimal(3));
    expect(result?.toNumber()).toBe(129.1);
  });
});

describe("computeNrvWriteDown", () => {
  it("returns the write-down when NRV < cost", () => {
    expect(computeNrvWriteDown(new Decimal(100), new Decimal(80)).toNumber()).toBe(20);
  });

  it("returns 0 when NRV >= cost", () => {
    expect(computeNrvWriteDown(new Decimal(100), new Decimal(100)).toNumber()).toBe(0);
    expect(computeNrvWriteDown(new Decimal(100), new Decimal(150)).toNumber()).toBe(0);
  });

  it("returns 0 when NRV equals cost", () => {
    expect(computeNrvWriteDown(new Decimal(50), new Decimal(50)).toNumber()).toBe(0);
  });
});
