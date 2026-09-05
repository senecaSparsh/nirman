import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { computeDepreciatedValue } from "./equipment";
import { computeNrvWriteDown, computeWilsonEoq } from "./alerts";
import { computePropertyTds } from "./sale";

describe("equipment: computeDepreciatedValue (straight-line)", () => {
  it("depreciates correctly over time", () => {
    // ₹10,00,000 equipment, 15% per year, after 2 years
    // depreciation = 1000000 × 0.15 × 2 = 300000
    // value = 1000000 - 300000 = 700000
    const value = computeDepreciatedValue(
      new Decimal(1000000),
      new Decimal(0.15),
      new Decimal(2),
    );
    expect(value.toNumber()).toBe(700000);
  });

  it("depreciates to zero but not below", () => {
    // ₹1,00,000 equipment, 20% per year, after 10 years
    // depreciation = 100000 × 0.20 × 10 = 200000 > 100000 → value = 0
    const value = computeDepreciatedValue(
      new Decimal(100000),
      new Decimal(0.20),
      new Decimal(10),
    );
    expect(value.toNumber()).toBe(0);
  });

  it("no depreciation at year 0", () => {
    const value = computeDepreciatedValue(
      new Decimal(500000),
      new Decimal(0.15),
      new Decimal(0),
    );
    expect(value.toNumber()).toBe(500000);
  });

  it("partial year depreciation", () => {
    // ₹5,00,000, 10% per year, 1.5 years
    // depreciation = 500000 × 0.10 × 1.5 = 75000
    // value = 500000 - 75000 = 425000
    const value = computeDepreciatedValue(
      new Decimal(500000),
      new Decimal(0.10),
      new Decimal(1.5),
    );
    expect(value.toNumber()).toBe(425000);
  });
});

describe("alerts: computeWilsonEoq (Economic Order Quantity)", () => {
  it("computes EOQ using the Wilson formula sqrt(2DS/H)", () => {
    // D = 1200 units/year, S = ₹100/order, H = ₹12/unit/year
    // EOQ = sqrt(2 × 1200 × 100 / 12) = sqrt(20000) ≈ 141.42
    const eoq = computeWilsonEoq(
      new Decimal(1200),
      new Decimal(100),
      new Decimal(12),
    );
    expect(eoq).not.toBeNull();
    expect(eoq!.toNumber()).toBeCloseTo(141.42, 1);
  });

  it("returns null when any parameter is missing", () => {
    expect(computeWilsonEoq(null, new Decimal(100), new Decimal(12))).toBeNull();
    expect(computeWilsonEoq(new Decimal(1200), null, new Decimal(12))).toBeNull();
    expect(computeWilsonEoq(new Decimal(1200), new Decimal(100), null)).toBeNull();
  });

  it("returns null when any parameter is zero or negative", () => {
    expect(computeWilsonEoq(new Decimal(0), new Decimal(100), new Decimal(12))).toBeNull();
    expect(computeWilsonEoq(new Decimal(1200), new Decimal(0), new Decimal(12))).toBeNull();
    expect(computeWilsonEoq(new Decimal(1200), new Decimal(100), new Decimal(0))).toBeNull();
    expect(computeWilsonEoq(new Decimal(-100), new Decimal(100), new Decimal(12))).toBeNull();
  });
});

describe("sale: computePropertyTds (Section 194-IA)", () => {
  it("computes 1% TDS when sale price ≥ ₹50 lakh", () => {
    // Sale price = ₹60,00,000 → TDS = 1% = ₹60,000
    const tds = computePropertyTds(new Decimal(6000000), null);
    expect(tds).not.toBeNull();
    expect(tds!.toNumber()).toBe(60000);
  });

  it("computes 1% TDS exactly at the ₹50 lakh threshold", () => {
    const tds = computePropertyTds(new Decimal(5000000), null);
    expect(tds).not.toBeNull();
    expect(tds!.toNumber()).toBe(50000);
  });

  it("returns null when sale price < ₹50 lakh", () => {
    const tds = computePropertyTds(new Decimal(4999999), null);
    expect(tds).toBeNull();
  });

  it("uses manual TDS when provided, regardless of threshold", () => {
    // Manual TDS takes precedence even below threshold
    const tds = computePropertyTds(new Decimal(3000000), new Decimal(30000));
    expect(tds).not.toBeNull();
    expect(tds!.toNumber()).toBe(30000);
  });

  it("rounds TDS to 2 decimal places", () => {
    // ₹50,00,001 × 1% = ₹50,000.01
    const tds = computePropertyTds(new Decimal(5000001), null);
    expect(tds).not.toBeNull();
    expect(tds!.toNumber()).toBe(50000.01);
  });
});

describe("alerts: computeNrvWriteDown (IAS 2 lower of cost or NRV)", () => {
  it("returns write-down when NRV < cost", () => {
    // Cost ₹50,00,000, NRV ₹45,00,000 → write-down = ₹5,00,000
    const wd = computeNrvWriteDown(new Decimal(5000000), new Decimal(4500000));
    expect(wd.toNumber()).toBe(500000);
  });

  it("returns zero when NRV = cost (break-even)", () => {
    const wd = computeNrvWriteDown(new Decimal(3000000), new Decimal(3000000));
    expect(wd.toNumber()).toBe(0);
  });

  it("returns zero when NRV > cost (asset appreciated)", () => {
    const wd = computeNrvWriteDown(new Decimal(2000000), new Decimal(3500000));
    expect(wd.toNumber()).toBe(0);
  });

  it("handles large write-downs", () => {
    // Cost ₹2,00,00,000, NRV ₹50,00,000 → write-down = ₹1,50,00,000
    const wd = computeNrvWriteDown(new Decimal(20000000), new Decimal(5000000));
    expect(wd.toNumber()).toBe(15000000);
  });
});
