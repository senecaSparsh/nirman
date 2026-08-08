import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  cheapestQuoteId,
  quoteVariances,
  isQuoteGateSatisfied,
  winningLineCosts,
} from "./quote-comparison";

describe("quote-comparison: cheapestQuoteId", () => {
  it("returns the cheapest quote by landedTotal", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(100), status: "PENDING" },
      { id: "q2", landedTotal: new Decimal(90), status: "PENDING" },
      { id: "q3", landedTotal: new Decimal(99), status: "PENDING" },
    ];
    expect(cheapestQuoteId(quotes)).toBe("q2");
  });

  it("returns null for an empty list", () => {
    expect(cheapestQuoteId([])).toBeNull();
  });

  it("excludes REJECTED quotes from the comparison", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(100), status: "PENDING" },
      { id: "q2", landedTotal: new Decimal(50), status: "REJECTED" },
      { id: "q3", landedTotal: new Decimal(90), status: "PENDING" },
    ];
    // q2 is cheapest but rejected → q3 should win
    expect(cheapestQuoteId(quotes)).toBe("q3");
  });

  it("handles ties by returning the first encountered cheapest", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(90), status: "PENDING" },
      { id: "q2", landedTotal: new Decimal(90), status: "PENDING" },
    ];
    expect(cheapestQuoteId(quotes)).toBe("q1");
  });

  it("includes SELECTED quotes in the comparison", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(100), status: "PENDING" },
      { id: "q2", landedTotal: new Decimal(85), status: "SELECTED" },
      { id: "q3", landedTotal: new Decimal(90), status: "PENDING" },
    ];
    expect(cheapestQuoteId(quotes)).toBe("q2");
  });
});

describe("quote-comparison: quoteVariances", () => {
  it("computes variance vs cheapest for each quote", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(100), status: "PENDING" },
      { id: "q2", landedTotal: new Decimal(90), status: "PENDING" },
      { id: "q3", landedTotal: new Decimal(99), status: "PENDING" },
    ];
    const v = quoteVariances(quotes);
    expect(v.get("q1")!.toNumber()).toBe(10); // 100 - 90
    expect(v.get("q2")!.toNumber()).toBe(0); // cheapest
    expect(v.get("q3")!.toNumber()).toBe(9); // 99 - 90
  });

  it("returns empty map for no eligible quotes", () => {
    const v = quoteVariances([]);
    expect(v.size).toBe(0);
  });

  it("excludes REJECTED quotes from the variance map", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(100), status: "PENDING" },
      { id: "q2", landedTotal: new Decimal(50), status: "REJECTED" },
      { id: "q3", landedTotal: new Decimal(90), status: "PENDING" },
    ];
    const v = quoteVariances(quotes);
    expect(v.has("q2")).toBe(false);
    expect(v.get("q1")!.toNumber()).toBe(10);
    expect(v.get("q3")!.toNumber()).toBe(0);
  });
});

describe("quote-comparison: isQuoteGateSatisfied", () => {
  it("returns true when quote count meets minimum", () => {
    expect(isQuoteGateSatisfied(3, 3, false)).toBe(true);
    expect(isQuoteGateSatisfied(5, 3, false)).toBe(true);
  });

  it("returns false when quote count is below minimum", () => {
    expect(isQuoteGateSatisfied(2, 3, false)).toBe(false);
    expect(isQuoteGateSatisfied(0, 3, false)).toBe(false);
  });

  it("returns true when waived regardless of count", () => {
    expect(isQuoteGateSatisfied(0, 3, true)).toBe(true);
    expect(isQuoteGateSatisfied(1, 3, true)).toBe(true);
  });

  it("returns true when count equals minimum exactly", () => {
    expect(isQuoteGateSatisfied(3, 3, false)).toBe(true);
  });
});

describe("quote-comparison: winningLineCosts", () => {
  it("maps materialId → unitPrice from winning quote lines", () => {
    const lines = [
      { materialId: "m1", unitPrice: new Decimal(50) },
      { materialId: "m2", unitPrice: new Decimal(75.5) },
      { materialId: "m3", unitPrice: new Decimal(100) },
    ];
    const costs = winningLineCosts(lines);
    expect(costs["m1"]!.toNumber()).toBe(50);
    expect(costs["m2"]!.toNumber()).toBe(75.5);
    expect(costs["m3"]!.toNumber()).toBe(100);
  });

  it("returns empty map for no lines", () => {
    const costs = winningLineCosts([]);
    expect(Object.keys(costs).length).toBe(0);
  });

  it("handles a single line", () => {
    const costs = winningLineCosts([{ materialId: "m1", unitPrice: new Decimal(42) }]);
    expect(costs["m1"]!.toNumber()).toBe(42);
  });
});
