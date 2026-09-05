/**
 * Unit tests for the pure material sale helpers extracted from material-sale.ts.
 *
 *   computeMaterialSaleLine    — per-line financial computation
 *   computeMaterialSaleTotals  — header totals from validated lines
 */
import { describe, it, expect } from "vitest";
import { computeMaterialSaleLine, computeMaterialSaleTotals } from "./material-sale";
import Decimal from "decimal.js";

describe("computeMaterialSaleLine", () => {
  it("computes line values with GST", () => {
    const r = computeMaterialSaleLine(new Decimal(10), new Decimal(100), new Decimal(18), new Decimal(60));
    expect(r.lineSubtotal.toNumber()).toBe(1000);
    expect(r.gstAmount.toNumber()).toBe(180);
    expect(r.lineTotal.toNumber()).toBe(1180);
    expect(r.lineCost.toNumber()).toBe(600);
  });

  it("handles zero GST rate", () => {
    const r = computeMaterialSaleLine(new Decimal(10), new Decimal(100), new Decimal(0), new Decimal(60));
    expect(r.gstAmount.toNumber()).toBe(0);
    expect(r.lineTotal.toNumber()).toBe(1000);
  });

  it("rounds to 2 decimal places", () => {
    const r = computeMaterialSaleLine(new Decimal(3), new Decimal(33.333), new Decimal(18), new Decimal(10));
    // lineSubtotal = 3 × 33.333 = 99.999 → 100.00
    expect(r.lineSubtotal.toNumber()).toBe(100);
  });

  it("handles fractional quantities", () => {
    const r = computeMaterialSaleLine(new Decimal(2.5), new Decimal(100), new Decimal(12), new Decimal(50));
    expect(r.lineSubtotal.toNumber()).toBe(250);
    expect(r.gstAmount.toNumber()).toBe(30);
    expect(r.lineTotal.toNumber()).toBe(280);
    expect(r.lineCost.toNumber()).toBe(125);
  });

  it("does NOT round lineCost per-line (matches original accumulation)", () => {
    // unitCost = 33.333, qty = 1 → lineCost = 33.333 (NOT 33.33)
    // The original accumulates raw unitCost×qty and only rounds the final total.
    const r = computeMaterialSaleLine(new Decimal(1), new Decimal(100), new Decimal(0), new Decimal(33.333));
    expect(r.lineCost.toNumber()).toBe(33.333); // unrounded
  });
});

describe("computeMaterialSaleTotals", () => {
  it("aggregates single line", () => {
    const lines = [{
      lineSubtotal: new Decimal(1000),
      gstAmount: new Decimal(180),
      lineCost: new Decimal(600),
      isScrap: false,
    }];
    const t = computeMaterialSaleTotals(lines, new Decimal(0));
    expect(t.subtotal.toNumber()).toBe(1000);
    expect(t.gstTotal.toNumber()).toBe(180);
    expect(t.totalCost.toNumber()).toBe(600);
    expect(t.totalAmount.toNumber()).toBe(1180);
    expect(t.grossProfit.toNumber()).toBe(400);
    expect(t.scrapSubtotal.toNumber()).toBe(0);
  });

  it("aggregates multiple lines", () => {
    const lines = [
      { lineSubtotal: new Decimal(1000), gstAmount: new Decimal(180), lineCost: new Decimal(600), isScrap: false },
      { lineSubtotal: new Decimal(500), gstAmount: new Decimal(90), lineCost: new Decimal(300), isScrap: false },
    ];
    const t = computeMaterialSaleTotals(lines, new Decimal(0));
    expect(t.subtotal.toNumber()).toBe(1500);
    expect(t.gstTotal.toNumber()).toBe(270);
    expect(t.totalCost.toNumber()).toBe(900);
    expect(t.totalAmount.toNumber()).toBe(1770);
    expect(t.grossProfit.toNumber()).toBe(600);
  });

  it("handles roundOff", () => {
    const lines = [
      { lineSubtotal: new Decimal(1000), gstAmount: new Decimal(180), lineCost: new Decimal(600), isScrap: false },
    ];
    const t = computeMaterialSaleTotals(lines, new Decimal(0.5));
    expect(t.totalAmount.toNumber()).toBe(1180.5);
  });

  it("tracks scrap subtotal separately", () => {
    const lines = [
      { lineSubtotal: new Decimal(1000), gstAmount: new Decimal(180), lineCost: new Decimal(600), isScrap: false },
      { lineSubtotal: new Decimal(200), gstAmount: new Decimal(36), lineCost: new Decimal(50), isScrap: true },
    ];
    const t = computeMaterialSaleTotals(lines, new Decimal(0));
    expect(t.subtotal.toNumber()).toBe(1200);
    expect(t.scrapSubtotal.toNumber()).toBe(200);
    expect(t.grossProfit.toNumber()).toBe(550); // 1200 - 650
  });

  it("returns zeros for empty lines", () => {
    const t = computeMaterialSaleTotals([], new Decimal(0));
    expect(t.subtotal.toNumber()).toBe(0);
    expect(t.gstTotal.toNumber()).toBe(0);
    expect(t.totalCost.toNumber()).toBe(0);
    expect(t.totalAmount.toNumber()).toBe(0);
    expect(t.grossProfit.toNumber()).toBe(0);
    expect(t.scrapSubtotal.toNumber()).toBe(0);
  });

  it("handles negative grossProfit (loss)", () => {
    const lines = [
      { lineSubtotal: new Decimal(500), gstAmount: new Decimal(90), lineCost: new Decimal(600), isScrap: false },
    ];
    const t = computeMaterialSaleTotals(lines, new Decimal(0));
    expect(t.grossProfit.toNumber()).toBe(-100);
  });

  it("rounds totalCost only at the end (not per-line)", () => {
    // 3 lines with unrounded lineCost = 33.333 each
    // totalCost = 33.333 + 33.333 + 33.333 = 99.999 → toDecimalPlaces(2) = 100.00
    // If lineCost were rounded per-line (33.33), total would be 99.99 — WRONG
    const lines = [
      { lineSubtotal: new Decimal(100), gstAmount: new Decimal(0), lineCost: new Decimal(33.333), isScrap: false },
      { lineSubtotal: new Decimal(100), gstAmount: new Decimal(0), lineCost: new Decimal(33.333), isScrap: false },
      { lineSubtotal: new Decimal(100), gstAmount: new Decimal(0), lineCost: new Decimal(33.333), isScrap: false },
    ];
    const t = computeMaterialSaleTotals(lines, new Decimal(0));
    expect(t.totalCost.toNumber()).toBe(100); // 99.999 rounds to 100, NOT 99.99
  });
});
