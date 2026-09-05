/**
 * Unit tests for the pure quote comparison helpers in quote-comparison.ts.
 *
 *   cheapestQuoteId      — find the ID of the cheapest non-rejected quote
 *   quoteVariances       — variance of each quote vs the cheapest
 *   isQuoteGateSatisfied — check if min-quotes gate is met or waived
 *   winningLineCosts     — map materialId → unitPrice from winning quote lines
 *
 * No DB, no mocking — pure functions.
 */
import { describe, it, expect } from "vitest";
import {
  cheapestQuoteId,
  quoteVariances,
  isQuoteGateSatisfied,
  winningLineCosts,
} from "./quote-comparison";
import Decimal from "decimal.js";

describe("cheapestQuoteId", () => {
  it("returns the ID of the quote with the lowest landedTotal", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(10000), status: "PENDING" },
      { id: "q2", landedTotal: new Decimal(8000), status: "PENDING" },
      { id: "q3", landedTotal: new Decimal(12000), status: "PENDING" },
    ];
    expect(cheapestQuoteId(quotes)).toBe("q2");
  });

  it("excludes REJECTED quotes from comparison", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(5000), status: "REJECTED" },
      { id: "q2", landedTotal: new Decimal(8000), status: "PENDING" },
      { id: "q3", landedTotal: new Decimal(12000), status: "PENDING" },
    ];
    // q1 is cheapest but rejected → q2 is the cheapest eligible
    expect(cheapestQuoteId(quotes)).toBe("q2");
  });

  it("includes SELECTED quotes in comparison", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(5000), status: "SELECTED" },
      { id: "q2", landedTotal: new Decimal(8000), status: "PENDING" },
    ];
    expect(cheapestQuoteId(quotes)).toBe("q1");
  });

  it("returns null when all quotes are REJECTED", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(5000), status: "REJECTED" },
      { id: "q2", landedTotal: new Decimal(8000), status: "REJECTED" },
    ];
    expect(cheapestQuoteId(quotes)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(cheapestQuoteId([])).toBeNull();
  });

  it("handles a single eligible quote", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(10000), status: "PENDING" },
    ];
    expect(cheapestQuoteId(quotes)).toBe("q1");
  });

  it("handles ties by returning the first one encountered", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(5000), status: "PENDING" },
      { id: "q2", landedTotal: new Decimal(5000), status: "PENDING" },
    ];
    expect(cheapestQuoteId(quotes)).toBe("q1");
  });
});

describe("quoteVariances", () => {
  it("computes variance from cheapest for each non-rejected quote", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(10000), status: "PENDING" },
      { id: "q2", landedTotal: new Decimal(8000), status: "PENDING" },
      { id: "q3", landedTotal: new Decimal(12000), status: "PENDING" },
    ];
    const variances = quoteVariances(quotes);
    // q2 is cheapest (8000)
    expect(variances.get("q1")?.toNumber()).toBe(2000);  // 10000 - 8000
    expect(variances.get("q2")?.toNumber()).toBe(0);     // cheapest itself
    expect(variances.get("q3")?.toNumber()).toBe(4000);  // 12000 - 8000
  });

  it("excludes REJECTED quotes from variance map", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(5000), status: "REJECTED" },
      { id: "q2", landedTotal: new Decimal(8000), status: "PENDING" },
      { id: "q3", landedTotal: new Decimal(10000), status: "PENDING" },
    ];
    const variances = quoteVariances(quotes);
    expect(variances.has("q1")).toBe(false);
    expect(variances.get("q2")?.toNumber()).toBe(0);
    expect(variances.get("q3")?.toNumber()).toBe(2000);
  });

  it("returns empty map when no eligible quotes", () => {
    const quotes = [
      { id: "q1", landedTotal: new Decimal(5000), status: "REJECTED" },
    ];
    expect(quoteVariances(quotes).size).toBe(0);
  });

  it("returns empty map for empty array", () => {
    expect(quoteVariances([]).size).toBe(0);
  });
});

describe("isQuoteGateSatisfied", () => {
  it("returns true when waived regardless of count", () => {
    expect(isQuoteGateSatisfied(0, 3, true)).toBe(true);
    expect(isQuoteGateSatisfied(1, 3, true)).toBe(true);
  });

  it("returns true when quote count meets minimum", () => {
    expect(isQuoteGateSatisfied(3, 3, false)).toBe(true);
    expect(isQuoteGateSatisfied(5, 3, false)).toBe(true);
  });

  it("returns false when quote count is below minimum and not waived", () => {
    expect(isQuoteGateSatisfied(0, 3, false)).toBe(false);
    expect(isQuoteGateSatisfied(1, 3, false)).toBe(false);
    expect(isQuoteGateSatisfied(2, 3, false)).toBe(false);
  });
});

describe("winningLineCosts", () => {
  it("maps materialId to unitPrice", () => {
    const lines = [
      { materialId: "m1", unitPrice: new Decimal(100) },
      { materialId: "m2", unitPrice: new Decimal(200) },
      { materialId: "m3", unitPrice: new Decimal(50.5) },
    ];
    const costs = winningLineCosts(lines);
    expect(costs["m1"]?.toNumber()).toBe(100);
    expect(costs["m2"]?.toNumber()).toBe(200);
    expect(costs["m3"]?.toNumber()).toBe(50.5);
  });

  it("returns empty object for empty lines", () => {
    expect(Object.keys(winningLineCosts([])).length).toBe(0);
  });

  it("handles duplicate materialIds (last one wins)", () => {
    const lines = [
      { materialId: "m1", unitPrice: new Decimal(100) },
      { materialId: "m1", unitPrice: new Decimal(150) },
    ];
    const costs = winningLineCosts(lines);
    expect(costs["m1"]?.toNumber()).toBe(150);
  });
});
