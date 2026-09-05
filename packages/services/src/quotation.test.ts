/**
 * Unit tests for the pure quotation landed cost functions in quotation.ts.
 *
 *   computeLineLandedCost — per-piece landed cost for a quote line
 *   computeQuoteTotals    — aggregate header totals from line results
 *
 * Landed cost formula (Indian Comparative Statement format):
 *   taxableValuePerUnit = unitPrice − discount + packing
 *   gstPerUnit          = taxableValuePerUnit × gstRate / 100
 *   unitLandedCost      = taxableValuePerUnit + gstPerUnit + freight + buyerTransport + loading + insurance + handling
 *   lineTotal           = qty × unitLandedCost
 */
import { describe, it, expect } from "vitest";
import { computeLineLandedCost, computeQuoteTotals } from "./quotation";
import Decimal from "decimal.js";

describe("computeLineLandedCost", () => {
  it("computes landed cost with all components", () => {
    const result = computeLineLandedCost({
      unitPrice: 100,
      gstRate: 18,
      qty: 10,
      discountPerUnit: 5,
      packingPerUnit: 2,
      freightPerUnit: 10,
      loadingPerUnit: 1,
      insurancePerUnit: 0.5,
      handlingPerUnit: 1,
      buyerTransportPerUnit: 5,
    });
    // taxableValuePerUnit = 100 - 5 + 2 = 97
    expect(result.taxableValuePerUnit.toNumber()).toBe(97);
    // gstPerUnit = 97 × 18% = 17.46
    expect(result.gstAmount.toNumber()).toBeCloseTo(174.6, 1);
    // unitLandedCost = 97 + 17.46 + 10 + 5 + 1 + 0.5 + 1 = 131.96
    expect(result.unitLandedCost.toNumber()).toBeCloseTo(131.96, 2);
    // lineTotal = 10 × 131.96 = 1319.6
    expect(result.lineTotal.toNumber()).toBeCloseTo(1319.6, 1);
    // lineSubtotal = 10 × 100 = 1000
    expect(result.lineSubtotal.toNumber()).toBe(1000);
    // taxableValue = 97 × 10 = 970
    expect(result.taxableValue.toNumber()).toBe(970);
  });

  it("computes landed cost with no extras (just price + GST)", () => {
    const result = computeLineLandedCost({
      unitPrice: 100,
      gstRate: 18,
      qty: 10,
    });
    expect(result.taxableValuePerUnit.toNumber()).toBe(100);
    expect(result.unitLandedCost.toNumber()).toBe(118); // 100 + 18
    expect(result.lineTotal.toNumber()).toBe(1180);
    expect(result.gstAmount.toNumber()).toBe(180);
  });

  it("handles zero GST rate", () => {
    const result = computeLineLandedCost({
      unitPrice: 100,
      gstRate: 0,
      qty: 10,
    });
    expect(result.gstAmount.toNumber()).toBe(0);
    expect(result.unitLandedCost.toNumber()).toBe(100);
  });

  it("handles zero quantity", () => {
    const result = computeLineLandedCost({
      unitPrice: 100,
      gstRate: 18,
      qty: 0,
    });
    expect(result.lineTotal.toNumber()).toBe(0);
    expect(result.gstAmount.toNumber()).toBe(0);
  });

  it("handles discount reducing taxable value below zero", () => {
    const result = computeLineLandedCost({
      unitPrice: 100,
      gstRate: 18,
      qty: 10,
      discountPerUnit: 150, // more than unit price
    });
    // taxableValuePerUnit = 100 - 150 = -50
    expect(result.taxableValuePerUnit.toNumber()).toBe(-50);
  });

  it("handles packing added to taxable value", () => {
    const result = computeLineLandedCost({
      unitPrice: 100,
      gstRate: 0,
      qty: 1,
      packingPerUnit: 10,
    });
    // taxableValuePerUnit = 100 + 10 = 110
    expect(result.taxableValuePerUnit.toNumber()).toBe(110);
  });

  it("accepts Decimal inputs", () => {
    const result = computeLineLandedCost({
      unitPrice: new Decimal(100),
      gstRate: new Decimal(18),
      qty: new Decimal(10),
    });
    expect(result.unitLandedCost.toNumber()).toBe(118);
  });

  it("accepts string inputs", () => {
    const result = computeLineLandedCost({
      unitPrice: "100",
      gstRate: "18",
      qty: "10",
    });
    expect(result.unitLandedCost.toNumber()).toBe(118);
  });
});

describe("computeQuoteTotals", () => {
  it("returns zeros for empty array", () => {
    const totals = computeQuoteTotals([]);
    expect(totals.subtotal.toNumber()).toBe(0);
    expect(totals.gstTotal.toNumber()).toBe(0);
    expect(totals.landedTotal.toNumber()).toBe(0);
  });

  it("aggregates single line", () => {
    const line = computeLineLandedCost({
      unitPrice: 100, gstRate: 18, qty: 10,
      freightPerUnit: 10, discountPerUnit: 5, packingPerUnit: 2,
    });
    const totals = computeQuoteTotals([line]);
    expect(totals.subtotal.toNumber()).toBe(1000);
    expect(totals.gstTotal.toNumber()).toBeCloseTo(174.6, 1);
    expect(totals.freightTotal.toNumber()).toBe(100);
    expect(totals.discountTotal.toNumber()).toBe(50);
    expect(totals.packingTotal.toNumber()).toBe(20);
    expect(totals.landedTotal.toNumber()).toBe(line.lineTotal.toNumber());
  });

  it("aggregates multiple lines", () => {
    const line1 = computeLineLandedCost({ unitPrice: 100, gstRate: 18, qty: 10 });
    const line2 = computeLineLandedCost({ unitPrice: 50, gstRate: 12, qty: 20 });
    const totals = computeQuoteTotals([line1, line2]);
    // subtotal = 100×10 + 50×20 = 1000 + 1000 = 2000
    expect(totals.subtotal.toNumber()).toBe(2000);
    // gstTotal = 180 + 120 = 300
    expect(totals.gstTotal.toNumber()).toBe(300);
    // landedTotal = 1180 + 1120 = 2300
    expect(totals.landedTotal.toNumber()).toBe(2300);
  });

  it("aggregates freight across lines", () => {
    const line1 = computeLineLandedCost({ unitPrice: 100, gstRate: 0, qty: 10, freightPerUnit: 5 });
    const line2 = computeLineLandedCost({ unitPrice: 200, gstRate: 0, qty: 5, freightPerUnit: 10 });
    const totals = computeQuoteTotals([line1, line2]);
    // freightTotal = 5×10 + 10×5 = 50 + 50 = 100
    expect(totals.freightTotal.toNumber()).toBe(100);
  });
});
