import { describe, expect, it } from "vitest";
import { quoteEntryTotals } from "./quote-pricing";

describe("quote entry pricing", () => {
  it("includes GST rather than comparing delivered price with pre-tax subtotal", () => {
    expect(quoteEntryTotals([{ qty: 7, unitPrice: 350, gstRate: 28, freightPerUnit: 0 }])).toEqual({
      subtotal: 2450, gst: 686, freight: 0, landed: 3136,
      otherLandedCosts: 0, discount: 0,
    });
  });

  it("includes freight without taxing it as material value", () => {
    expect(quoteEntryTotals([{ qty: 7, unitPrice: 350, gstRate: 28, freightPerUnit: 10 }])).toEqual({
      subtotal: 2450, gst: 686, freight: 70, landed: 3206,
      otherLandedCosts: 0, discount: 0,
    });
  });

  it("supports zero-rated goods and different per-line tax rates", () => {
    expect(quoteEntryTotals([
      { qty: 2, unitPrice: 100, gstRate: 0, freightPerUnit: 0 },
      { qty: 1, unitPrice: 100, gstRate: 18, freightPerUnit: 5 },
    ])).toEqual({ subtotal: 300, gst: 18, freight: 5, landed: 323, otherLandedCosts: 0, discount: 0 });
  });

  it("uses decimal arithmetic for money and rounds the final total", () => {
    expect(quoteEntryTotals([{ qty: 3, unitPrice: 0.1, gstRate: 18, freightPerUnit: 0 }])).toEqual({
      subtotal: 0.3, gst: 0.05, freight: 0, landed: 0.35,
      otherLandedCosts: 0, discount: 0,
    });
  });

  it("taxes packing and subtracts discounts before calculating GST", () => {
    expect(quoteEntryTotals([{
      qty: 1, unitPrice: 100, gstRate: 18, freightPerUnit: 30,
      discountPerUnit: 10, packingPerUnit: 5,
    }])).toEqual({
      subtotal: 100, gst: 17.1, freight: 30, landed: 142.1,
      otherLandedCosts: 5, discount: 10,
    });
  });
});
