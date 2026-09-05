/**
 * Unit tests for the pure procurement advanced helper.
 *
 *   computeVendorScore — weighted vendor rating from raw metrics
 */
import { describe, it, expect } from "vitest";
import { computeVendorScore } from "./procurement-advanced";
import Decimal from "decimal.js";

describe("computeVendorScore", () => {
  it("computes score for a supplier with full data", () => {
    const r = computeVendorScore({
      onTimeCount: 8,
      totalPos: 10,
      acceptedCount: 9,
      totalReceipts: 10,
      selectedQuotes: 3,
      totalQuotes: 5,
    });
    expect(r.onTimeRate.toNumber()).toBe(0.8);
    expect(r.qualityRate.toNumber()).toBe(0.9);
    expect(r.priceCompetitiveness.toNumber()).toBe(0.6);
    // overall = 0.8×0.4 + 0.9×0.3 + 0.6×0.3 = 0.32 + 0.27 + 0.18 = 0.77
    expect(r.overallScore.toNumber()).toBeCloseTo(0.77, 4);
  });

  it("defaults onTimeRate to 1 (neutral) when no POs", () => {
    const r = computeVendorScore({
      onTimeCount: 0,
      totalPos: 0,
      acceptedCount: 5,
      totalReceipts: 10,
      selectedQuotes: 3,
      totalQuotes: 5,
    });
    expect(r.onTimeRate.toNumber()).toBe(1);
  });

  it("defaults qualityRate to 1 (neutral) when no receipts", () => {
    const r = computeVendorScore({
      onTimeCount: 8,
      totalPos: 10,
      acceptedCount: 0,
      totalReceipts: 0,
      selectedQuotes: 3,
      totalQuotes: 5,
    });
    expect(r.qualityRate.toNumber()).toBe(1);
  });

  it("defaults priceCompetitiveness to 0.5 (neutral) when no quotes", () => {
    const r = computeVendorScore({
      onTimeCount: 8,
      totalPos: 10,
      acceptedCount: 9,
      totalReceipts: 10,
      selectedQuotes: 0,
      totalQuotes: 0,
    });
    expect(r.priceCompetitiveness.toNumber()).toBe(0.5);
  });

  it("handles perfect supplier", () => {
    const r = computeVendorScore({
      onTimeCount: 10,
      totalPos: 10,
      acceptedCount: 10,
      totalReceipts: 10,
      selectedQuotes: 10,
      totalQuotes: 10,
    });
    expect(r.onTimeRate.toNumber()).toBe(1);
    expect(r.qualityRate.toNumber()).toBe(1);
    expect(r.priceCompetitiveness.toNumber()).toBe(1);
    expect(r.overallScore.toNumber()).toBe(1);
  });

  it("handles worst supplier", () => {
    const r = computeVendorScore({
      onTimeCount: 0,
      totalPos: 10,
      acceptedCount: 0,
      totalReceipts: 10,
      selectedQuotes: 0,
      totalQuotes: 10,
    });
    expect(r.onTimeRate.toNumber()).toBe(0);
    expect(r.qualityRate.toNumber()).toBe(0);
    expect(r.priceCompetitiveness.toNumber()).toBe(0);
    expect(r.overallScore.toNumber()).toBe(0);
  });

  it("applies correct weights (40/30/30)", () => {
    const r = computeVendorScore({
      onTimeCount: 10,
      totalPos: 10,   // onTime = 1.0
      acceptedCount: 0,
      totalReceipts: 10, // quality = 0.0
      selectedQuotes: 0,
      totalQuotes: 10,   // price = 0.0
    });
    // overall = 1.0×0.4 + 0×0.3 + 0×0.3 = 0.4
    expect(r.overallScore.toNumber()).toBeCloseTo(0.4, 4);
  });
});
