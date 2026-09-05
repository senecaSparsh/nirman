/**
 * Unit tests for the pure sale helpers in sale.ts.
 *
 *   computePropertyTds    — TDS under Section 194-IA (1% if sale ≥ ₹50L)
 *   computeSaleProfit     — salePrice − costBasis
 *   computePaymentStatus  — PENDING / PARTIAL / PAID from totalPaid vs salePrice
 *
 * No DB, no mocking — pure functions.
 */
import { describe, it, expect } from "vitest";
import { computePropertyTds, computeSaleProfit, computePaymentStatus } from "./sale";
import Decimal from "decimal.js";

describe("computePropertyTds", () => {
  it("returns null when sale price is below ₹50,00,000 threshold", () => {
    expect(computePropertyTds(new Decimal(4999999))).toBeNull();
    expect(computePropertyTds(new Decimal(1000000))).toBeNull();
    expect(computePropertyTds(new Decimal(0))).toBeNull();
  });

  it("returns 1% TDS when sale price is exactly ₹50,00,000", () => {
    // 5000000 × 1% = 50000
    expect(computePropertyTds(new Decimal(5000000))?.toNumber()).toBe(50000);
  });

  it("returns 1% TDS when sale price is above threshold", () => {
    // 10000000 × 1% = 100000
    expect(computePropertyTds(new Decimal(10000000))?.toNumber()).toBe(100000);
    // 7500000 × 1% = 75000
    expect(computePropertyTds(new Decimal(7500000))?.toNumber()).toBe(75000);
  });

  it("returns manualTds when provided (overrides auto-calculation)", () => {
    // Even below threshold, manual TDS takes precedence
    expect(computePropertyTds(new Decimal(1000000), new Decimal(5000))?.toNumber()).toBe(5000);
    // Above threshold, manual TDS still takes precedence
    expect(computePropertyTds(new Decimal(10000000), new Decimal(25000))?.toNumber()).toBe(25000);
  });

  it("accepts string and number for manualTds", () => {
    expect(computePropertyTds(new Decimal(10000000), "15000")?.toNumber()).toBe(15000);
    expect(computePropertyTds(new Decimal(10000000), 8000)?.toNumber()).toBe(8000);
  });

  it("auto-calculates when manualTds is null (treated same as undefined)", () => {
    // null != null is false, so the function falls through to auto-calculation
    expect(computePropertyTds(new Decimal(10000000), null)?.toNumber()).toBe(100000);
  });

  it("auto-calculates when manualTds is undefined", () => {
    expect(computePropertyTds(new Decimal(10000000), undefined)?.toNumber()).toBe(100000);
  });

  it("rounds TDS to 2 decimal places", () => {
    // 5555555 × 1% = 55555.55
    expect(computePropertyTds(new Decimal(5555555))?.toNumber()).toBe(55555.55);
  });
});

describe("computeSaleProfit", () => {
  it("computes positive profit", () => {
    expect(computeSaleProfit(new Decimal(5000000), new Decimal(3000000)).toNumber()).toBe(2000000);
  });

  it("computes negative profit (loss)", () => {
    expect(computeSaleProfit(new Decimal(2000000), new Decimal(3000000)).toNumber()).toBe(-1000000);
  });

  it("returns 0 when sale price equals cost basis", () => {
    expect(computeSaleProfit(new Decimal(1000000), new Decimal(1000000)).toNumber()).toBe(0);
  });
});

describe("computePaymentStatus", () => {
  it("returns PENDING when totalPaid is 0", () => {
    expect(computePaymentStatus(new Decimal(0), new Decimal(5000000))).toBe("PENDING");
  });

  it("returns PARTIAL when totalPaid is less than salePrice", () => {
    expect(computePaymentStatus(new Decimal(1000000), new Decimal(5000000))).toBe("PARTIAL");
    expect(computePaymentStatus(new Decimal(4999999), new Decimal(5000000))).toBe("PARTIAL");
  });

  it("returns PAID when totalPaid equals salePrice", () => {
    expect(computePaymentStatus(new Decimal(5000000), new Decimal(5000000))).toBe("PAID");
  });

  it("returns PAID when totalPaid exceeds salePrice", () => {
    expect(computePaymentStatus(new Decimal(6000000), new Decimal(5000000))).toBe("PAID");
  });
});
