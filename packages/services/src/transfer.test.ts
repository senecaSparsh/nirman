/**
 * Unit tests for the pure transfer price function in transfer.ts.
 *
 *   computeTransferPrice — compute transfer price with freight, handling, markup
 */
import { describe, it, expect } from "vitest";
import { computeTransferPrice } from "./transfer";
import Decimal from "decimal.js";

describe("computeTransferPrice", () => {
  it("returns zeros for empty lines", () => {
    const result = computeTransferPrice([]);
    expect(result.lines).toHaveLength(0);
    expect(result.totalBaseCost.toNumber()).toBe(0);
    expect(result.transferPriceTotal.toNumber()).toBe(0);
  });

  it("computes base cost without freight/handling/markup", () => {
    const result = computeTransferPrice([
      { qty: 10, unitCostAtSource: 100 },
    ]);
    expect(result.lines[0]!.baseCost.toNumber()).toBe(1000);
    expect(result.lines[0]!.freight.toNumber()).toBe(0);
    expect(result.lines[0]!.handling.toNumber()).toBe(0);
    expect(result.lines[0]!.markup.toNumber()).toBe(0);
    expect(result.lines[0]!.lineTransferTotal.toNumber()).toBe(1000);
    expect(result.lines[0]!.unitTransferPrice.toNumber()).toBe(100);
  });

  it("allocates freight by base-cost weight", () => {
    const result = computeTransferPrice(
      [
        { qty: 10, unitCostAtSource: 100 }, // base = 1000 (50%)
        { qty: 5, unitCostAtSource: 200 },  // base = 1000 (50%)
      ],
      200, // freight
    );
    expect(result.lines[0]!.freight.toNumber()).toBe(100); // 50% of 200
    expect(result.lines[1]!.freight.toNumber()).toBe(100);
    expect(result.totalFreight.toNumber()).toBe(200);
  });

  it("computes markup as percentage of base cost", () => {
    const result = computeTransferPrice(
      [{ qty: 10, unitCostAtSource: 100 }],
      0, // freight
      0, // handling
      10, // 10% markup
    );
    // markup = 1000 × 10% = 100
    expect(result.lines[0]!.markup.toNumber()).toBe(100);
    expect(result.lines[0]!.lineTransferTotal.toNumber()).toBe(1100);
  });

  it("computes unit transfer price correctly", () => {
    const result = computeTransferPrice(
      [{ qty: 10, unitCostAtSource: 100 }],
      100, // freight
      50,  // handling
      10,  // 10% markup
    );
    // base = 1000, freight = 100, handling = 50, markup = 100
    // total = 1250, unit price = 1250 / 10 = 125
    expect(result.lines[0]!.unitTransferPrice.toNumber()).toBe(125);
  });

  it("handles zero qty (unit price = 0)", () => {
    const result = computeTransferPrice([
      { qty: 0, unitCostAtSource: 100 },
    ]);
    expect(result.lines[0]!.unitTransferPrice.toNumber()).toBe(0);
  });

  it("handles multiple lines with all charges", () => {
    const result = computeTransferPrice(
      [
        { qty: 10, unitCostAtSource: 100 }, // base = 1000
        { qty: 5, unitCostAtSource: 200 },  // base = 1000
      ],
      200,  // freight
      100,  // handling
      5,    // 5% markup
    );
    // Total base = 2000, each line is 50% weight
    // Line 1: base=1000, freight=100, handling=50, markup=50 → total=1200
    // Line 2: base=1000, freight=100, handling=50, markup=50 → total=1200
    expect(result.totalBaseCost.toNumber()).toBe(2000);
    expect(result.totalFreight.toNumber()).toBe(200);
    expect(result.totalHandling.toNumber()).toBe(100);
    expect(result.totalMarkup.toNumber()).toBe(100);
    expect(result.transferPriceTotal.toNumber()).toBe(2400);
  });
});
