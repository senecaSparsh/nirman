/**
 * Unit tests for the pure direct purchase helpers.
 *
 *   computeDirectPurchaseLine    — per-line financial computation
 *   computeDirectPurchaseTotals  — header totals from line results
 */
import { describe, it, expect } from "vitest";
import { computeDirectPurchaseLine, computeDirectPurchaseTotals } from "./direct-purchase";
import Decimal from "decimal.js";

describe("computeDirectPurchaseLine", () => {
  it("computes line values with GST", () => {
    const r = computeDirectPurchaseLine(new Decimal(10), new Decimal(100), new Decimal(18));
    expect(r.lineSubtotal.toNumber()).toBe(1000);
    expect(r.gstAmount.toNumber()).toBe(180);
    expect(r.lineTotal.toNumber()).toBe(1180);
  });

  it("handles zero GST rate", () => {
    const r = computeDirectPurchaseLine(new Decimal(10), new Decimal(100), new Decimal(0));
    expect(r.gstAmount.toNumber()).toBe(0);
    expect(r.lineTotal.toNumber()).toBe(1000);
  });

  it("rounds to 2 decimal places", () => {
    const r = computeDirectPurchaseLine(new Decimal(3), new Decimal(33.333), new Decimal(18));
    // lineSubtotal = 3 × 33.333 = 99.999 → 100.00
    expect(r.lineSubtotal.toNumber()).toBe(100);
  });

  it("handles fractional quantities", () => {
    const r = computeDirectPurchaseLine(new Decimal(2.5), new Decimal(100), new Decimal(12));
    expect(r.lineSubtotal.toNumber()).toBe(250);
    expect(r.gstAmount.toNumber()).toBe(30);
    expect(r.lineTotal.toNumber()).toBe(280);
  });

  it("handles zero quantity", () => {
    const r = computeDirectPurchaseLine(new Decimal(0), new Decimal(100), new Decimal(18));
    expect(r.lineSubtotal.toNumber()).toBe(0);
    expect(r.gstAmount.toNumber()).toBe(0);
    expect(r.lineTotal.toNumber()).toBe(0);
  });

  it("handles zero unit cost", () => {
    const r = computeDirectPurchaseLine(new Decimal(10), new Decimal(0), new Decimal(18));
    expect(r.lineSubtotal.toNumber()).toBe(0);
    expect(r.gstAmount.toNumber()).toBe(0);
    expect(r.lineTotal.toNumber()).toBe(0);
  });

  it("handles 100% GST rate", () => {
    const r = computeDirectPurchaseLine(new Decimal(10), new Decimal(100), new Decimal(100));
    expect(r.lineSubtotal.toNumber()).toBe(1000);
    expect(r.gstAmount.toNumber()).toBe(1000);
    expect(r.lineTotal.toNumber()).toBe(2000);
  });

  it("handles fractional GST rate", () => {
    const r = computeDirectPurchaseLine(new Decimal(100), new Decimal(100), new Decimal(2.5));
    expect(r.lineSubtotal.toNumber()).toBe(10000);
    expect(r.gstAmount.toNumber()).toBe(250);
    expect(r.lineTotal.toNumber()).toBe(10250);
  });

  it("handles very small values", () => {
    const r = computeDirectPurchaseLine(new Decimal(0.01), new Decimal(0.01), new Decimal(18));
    // lineSubtotal = 0.0001 → 0.00 (rounded to 2 dp)
    expect(r.lineSubtotal.toNumber()).toBe(0);
    expect(r.gstAmount.toNumber()).toBe(0);
    expect(r.lineTotal.toNumber()).toBe(0);
  });

  it("handles large values", () => {
    const r = computeDirectPurchaseLine(new Decimal(1000000), new Decimal(1000), new Decimal(18));
    expect(r.lineSubtotal.toNumber()).toBe(1000000000);
    expect(r.gstAmount.toNumber()).toBe(180000000);
    expect(r.lineTotal.toNumber()).toBe(1180000000);
  });

  it("produces lineTotal = lineSubtotal + gstAmount", () => {
    const r = computeDirectPurchaseLine(new Decimal(7), new Decimal(42.5), new Decimal(12));
    expect(r.lineTotal.toNumber()).toBe(
      r.lineSubtotal.plus(r.gstAmount).toNumber(),
    );
  });
});

describe("computeDirectPurchaseTotals", () => {
  it("aggregates single line", () => {
    const lines = [{ lineSubtotal: new Decimal(1000), gstAmount: new Decimal(180) }];
    const t = computeDirectPurchaseTotals(lines, new Decimal(0));
    expect(t.subtotal.toNumber()).toBe(1000);
    expect(t.gstTotal.toNumber()).toBe(180);
    expect(t.billAmount.toNumber()).toBe(1180);
  });

  it("aggregates multiple lines", () => {
    const lines = [
      { lineSubtotal: new Decimal(1000), gstAmount: new Decimal(180) },
      { lineSubtotal: new Decimal(500), gstAmount: new Decimal(90) },
    ];
    const t = computeDirectPurchaseTotals(lines, new Decimal(0));
    expect(t.subtotal.toNumber()).toBe(1500);
    expect(t.gstTotal.toNumber()).toBe(270);
    expect(t.billAmount.toNumber()).toBe(1770);
  });

  it("handles roundOff", () => {
    const lines = [{ lineSubtotal: new Decimal(1000), gstAmount: new Decimal(180) }];
    const t = computeDirectPurchaseTotals(lines, new Decimal(0.5));
    expect(t.billAmount.toNumber()).toBe(1180.5);
  });

  it("returns zeros for empty lines", () => {
    const t = computeDirectPurchaseTotals([], new Decimal(0));
    expect(t.subtotal.toNumber()).toBe(0);
    expect(t.gstTotal.toNumber()).toBe(0);
    expect(t.billAmount.toNumber()).toBe(0);
  });

  it("handles negative roundOff (discount)", () => {
    const lines = [{ lineSubtotal: new Decimal(1000), gstAmount: new Decimal(180) }];
    const t = computeDirectPurchaseTotals(lines, new Decimal(-0.5));
    expect(t.billAmount.toNumber()).toBe(1179.5);
  });

  it("handles only roundOff with no lines", () => {
    const t = computeDirectPurchaseTotals([], new Decimal(50));
    expect(t.subtotal.toNumber()).toBe(0);
    expect(t.gstTotal.toNumber()).toBe(0);
    expect(t.billAmount.toNumber()).toBe(50);
  });

  it("handles many lines", () => {
    const lines = Array.from({ length: 100 }, (_, i) => ({
      lineSubtotal: new Decimal(10),
      gstAmount: new Decimal(1.8),
    }));
    const t = computeDirectPurchaseTotals(lines, new Decimal(0));
    expect(t.subtotal.toNumber()).toBe(1000);
    expect(t.gstTotal.toNumber()).toBe(180);
    expect(t.billAmount.toNumber()).toBe(1180);
  });

  it("handles lines with zero values", () => {
    const lines = [
      { lineSubtotal: new Decimal(0), gstAmount: new Decimal(0) },
      { lineSubtotal: new Decimal(500), gstAmount: new Decimal(90) },
    ];
    const t = computeDirectPurchaseTotals(lines, new Decimal(0));
    expect(t.subtotal.toNumber()).toBe(500);
    expect(t.gstTotal.toNumber()).toBe(90);
    expect(t.billAmount.toNumber()).toBe(590);
  });

  it("billAmount = subtotal + gstTotal + roundOff", () => {
    const lines = [
      { lineSubtotal: new Decimal(123.45), gstAmount: new Decimal(22.22) },
      { lineSubtotal: new Decimal(678.9), gstAmount: new Decimal(122.2) },
    ];
    const t = computeDirectPurchaseTotals(lines, new Decimal(1.23));
    expect(t.billAmount.toNumber()).toBe(
      t.subtotal.plus(t.gstTotal).plus(new Decimal(1.23)).toNumber(),
    );
  });
});
