/**
 * Unit tests for the pure change order helpers in change-order.ts.
 *
 *   computeLine    — compute originalAmount, revisedAmount, amountDelta for a line
 *   computeTotals  — aggregate all line amounts into header totals
 *   validateLines  — validate line inputs (description, unit, rate, quantities)
 */
import { describe, it, expect } from "vitest";
import { computeLine, computeTotals, validateLines } from "./change-order";
import { ServiceError } from "./errors";
import Decimal from "decimal.js";

describe("computeLine", () => {
  it("computes original and revised amounts plus delta", () => {
    const result = computeLine(new Decimal(10), new Decimal(15), new Decimal(100));
    expect(result.originalAmount.toNumber()).toBe(1000);
    expect(result.revisedAmount.toNumber()).toBe(1500);
    expect(result.amountDelta.toNumber()).toBe(500);
  });

  it("computes negative delta when revised < original", () => {
    const result = computeLine(new Decimal(15), new Decimal(10), new Decimal(100));
    expect(result.originalAmount.toNumber()).toBe(1500);
    expect(result.revisedAmount.toNumber()).toBe(1000);
    expect(result.amountDelta.toNumber()).toBe(-500);
  });

  it("returns zero delta when quantities are equal", () => {
    const result = computeLine(new Decimal(10), new Decimal(10), new Decimal(100));
    expect(result.amountDelta.toNumber()).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    // 10 × 33.333 = 333.33 (rounded)
    const result = computeLine(new Decimal(10), new Decimal(10), new Decimal(33.333));
    expect(result.originalAmount.toNumber()).toBe(333.33);
  });

  it("handles zero rate", () => {
    const result = computeLine(new Decimal(10), new Decimal(15), new Decimal(0));
    expect(result.originalAmount.toNumber()).toBe(0);
    expect(result.revisedAmount.toNumber()).toBe(0);
    expect(result.amountDelta.toNumber()).toBe(0);
  });

  it("handles zero quantities", () => {
    const result = computeLine(new Decimal(0), new Decimal(0), new Decimal(100));
    expect(result.originalAmount.toNumber()).toBe(0);
    expect(result.revisedAmount.toNumber()).toBe(0);
  });
});

describe("computeTotals", () => {
  it("aggregates multiple lines", () => {
    const lines = [
      { description: "Item A", unit: "PCS", rate: 100, originalQty: 10, revisedQty: 15 },
      { description: "Item B", unit: "KG", rate: 50, originalQty: 20, revisedQty: 18 },
    ];
    const result = computeTotals(lines);
    // Line A: orig=1000, rev=1500, delta=500
    // Line B: orig=1000, rev=900, delta=-100
    // Totals: orig=2000, rev=2400, delta=400
    expect(result.originalAmount.toNumber()).toBe(2000);
    expect(result.revisedAmount.toNumber()).toBe(2400);
    expect(result.costDelta.toNumber()).toBe(400);
  });

  it("returns zeros for empty array", () => {
    const result = computeTotals([]);
    expect(result.originalAmount.toNumber()).toBe(0);
    expect(result.revisedAmount.toNumber()).toBe(0);
    expect(result.costDelta.toNumber()).toBe(0);
  });

  it("handles null quantities (defaults to 0)", () => {
    const lines = [
      { description: "Item A", unit: "PCS", rate: 100, originalQty: null as unknown as number, revisedQty: null as unknown as number },
    ];
    const result = computeTotals(lines);
    expect(result.originalAmount.toNumber()).toBe(0);
    expect(result.revisedAmount.toNumber()).toBe(0);
  });

  it("handles single line", () => {
    const lines = [
      { description: "Item A", unit: "PCS", rate: 200, originalQty: 5, revisedQty: 8 },
    ];
    const result = computeTotals(lines);
    expect(result.originalAmount.toNumber()).toBe(1000);
    expect(result.revisedAmount.toNumber()).toBe(1600);
    expect(result.costDelta.toNumber()).toBe(600);
  });
});

describe("validateLines", () => {
  it("throws when lines array is empty", () => {
    expect(() => validateLines([])).toThrow(ServiceError);
    expect(() => validateLines([])).toThrow("At least one change order line");
  });

  it("throws when lines is null/undefined", () => {
    expect(() => validateLines(null as unknown as never[])).toThrow(ServiceError);
  });

  it("throws when a line has no description", () => {
    const lines = [
      { description: "", unit: "PCS", rate: 100 },
    ];
    expect(() => validateLines(lines)).toThrow("description");
  });

  it("throws when a line has whitespace-only description", () => {
    const lines = [
      { description: "   ", unit: "PCS", rate: 100 },
    ];
    expect(() => validateLines(lines)).toThrow("description");
  });

  it("throws when a line has no unit", () => {
    const lines = [
      { description: "Item A", unit: "", rate: 100 },
    ];
    expect(() => validateLines(lines)).toThrow("unit");
  });

  it("throws when rate is negative", () => {
    const lines = [
      { description: "Item A", unit: "PCS", rate: -10 },
    ];
    expect(() => validateLines(lines)).toThrow("rate cannot be negative");
  });

  it("throws when originalQty is negative", () => {
    const lines = [
      { description: "Item A", unit: "PCS", rate: 100, originalQty: -5, revisedQty: 10 },
    ];
    expect(() => validateLines(lines)).toThrow("quantities cannot be negative");
  });

  it("throws when revisedQty is negative", () => {
    const lines = [
      { description: "Item A", unit: "PCS", rate: 100, originalQty: 10, revisedQty: -5 },
    ];
    expect(() => validateLines(lines)).toThrow("quantities cannot be negative");
  });

  it("passes for valid lines", () => {
    const lines = [
      { description: "Item A", unit: "PCS", rate: 100, originalQty: 10, revisedQty: 15 },
      { description: "Item B", unit: "KG", rate: 50, originalQty: 20, revisedQty: 18 },
    ];
    expect(() => validateLines(lines)).not.toThrow();
  });

  it("passes with zero rate and quantities", () => {
    const lines = [
      { description: "Item A", unit: "PCS", rate: 0, originalQty: 0, revisedQty: 0 },
    ];
    expect(() => validateLines(lines)).not.toThrow();
  });

  it("passes with missing quantities (defaults to 0)", () => {
    const lines = [
      { description: "Item A", unit: "PCS", rate: 100 },
    ];
    expect(() => validateLines(lines)).not.toThrow();
  });
});
