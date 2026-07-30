import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { computeDepreciatedValue } from "./equipment";
import { computeNrvWriteDown } from "./alerts";

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
