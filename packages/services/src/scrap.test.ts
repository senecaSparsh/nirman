/**
 * Unit tests for the pure scrap helpers.
 *
 *   computeScrapLineTotal  — qty × unitCost
 *   computeScrapTotalValue — Σ(qty × unitCost)
 */
import { describe, it, expect } from "vitest";
import { computeScrapLineTotal, computeScrapTotalValue } from "./scrap";
import Decimal from "decimal.js";

describe("computeScrapLineTotal", () => {
  it("computes line total", () => {
    expect(computeScrapLineTotal(new Decimal(10), new Decimal(50)).toNumber()).toBe(500);
  });

  it("handles fractional values", () => {
    expect(computeScrapLineTotal(new Decimal(2.5), new Decimal(33.33)).toNumber()).toBeCloseTo(83.325, 2);
  });

  it("handles zero qty", () => {
    expect(computeScrapLineTotal(new Decimal(0), new Decimal(50)).toNumber()).toBe(0);
  });

  it("handles zero unitCost", () => {
    expect(computeScrapLineTotal(new Decimal(10), new Decimal(0)).toNumber()).toBe(0);
  });
});

describe("computeScrapTotalValue", () => {
  it("computes total for single line", () => {
    const lines = [{ qty: new Decimal(10), unitCost: new Decimal(50) }];
    expect(computeScrapTotalValue(lines).toNumber()).toBe(500);
  });

  it("computes total for multiple lines", () => {
    const lines = [
      { qty: new Decimal(10), unitCost: new Decimal(50) },
      { qty: new Decimal(5), unitCost: new Decimal(100) },
      { qty: new Decimal(2), unitCost: new Decimal(25) },
    ];
    expect(computeScrapTotalValue(lines).toNumber()).toBe(1050); // 500 + 500 + 50
  });

  it("returns 0 for empty lines", () => {
    expect(computeScrapTotalValue([]).toNumber()).toBe(0);
  });

  it("handles all zero values", () => {
    const lines = [
      { qty: new Decimal(0), unitCost: new Decimal(50) },
      { qty: new Decimal(10), unitCost: new Decimal(0) },
    ];
    expect(computeScrapTotalValue(lines).toNumber()).toBe(0);
  });
});
