/**
 * Unit tests for the pure supplier return helpers in supplier-return.ts.
 *
 *   validateSupplierReturnLines          — validate return line quantities
 *   computeSupplierReturnTotal           — Σ(qty × unitCost)
 *   isSupplierReturnTransitionAllowed    — validate status transitions
 */
import { describe, it, expect } from "vitest";
import {
  validateSupplierReturnLines,
  computeSupplierReturnTotal,
  isSupplierReturnTransitionAllowed,
} from "./supplier-return";
import { ServiceError } from "./errors";
import Decimal from "decimal.js";

describe("validateSupplierReturnLines", () => {
  it("passes for valid lines with positive qty", () => {
    expect(() =>
      validateSupplierReturnLines([{ qty: 10 }, { qty: 5 }]),
    ).not.toThrow();
  });

  it("throws when lines array is empty", () => {
    expect(() => validateSupplierReturnLines([])).toThrow("at least one line");
  });

  it("throws when any qty is 0", () => {
    expect(() =>
      validateSupplierReturnLines([{ qty: 10 }, { qty: 0 }]),
    ).toThrow("Return qty must be > 0");
  });

  it("throws when any qty is negative", () => {
    expect(() =>
      validateSupplierReturnLines([{ qty: -5 }]),
    ).toThrow("Return qty must be > 0");
  });

  it("accepts Decimal qty", () => {
    expect(() =>
      validateSupplierReturnLines([{ qty: new Decimal(10) }]),
    ).not.toThrow();
  });

  it("accepts string qty", () => {
    expect(() =>
      validateSupplierReturnLines([{ qty: "10.5" }]),
    ).not.toThrow();
  });
});

describe("computeSupplierReturnTotal", () => {
  it("computes total for single line", () => {
    expect(
      computeSupplierReturnTotal([{ qty: new Decimal(10), unitCost: new Decimal(100) }]).toNumber(),
    ).toBe(1000);
  });

  it("computes total for multiple lines", () => {
    const total = computeSupplierReturnTotal([
      { qty: new Decimal(10), unitCost: new Decimal(100) },
      { qty: new Decimal(5), unitCost: new Decimal(200) },
      { qty: new Decimal(2), unitCost: new Decimal(50) },
    ]);
    expect(total.toNumber()).toBe(2100); // 1000 + 1000 + 100
  });

  it("returns 0 for empty lines", () => {
    expect(computeSupplierReturnTotal([]).toNumber()).toBe(0);
  });

  it("handles fractional quantities and costs", () => {
    const total = computeSupplierReturnTotal([
      { qty: new Decimal(2.5), unitCost: new Decimal(33.33) },
    ]);
    expect(total.toNumber()).toBeCloseTo(83.325, 2);
  });
});

describe("isSupplierReturnTransitionAllowed", () => {
  it("allows DRAFT → SUBMITTED", () => {
    expect(isSupplierReturnTransitionAllowed("DRAFT", "SUBMITTED")).toBe(true);
  });

  it("allows DRAFT → CANCELLED", () => {
    expect(isSupplierReturnTransitionAllowed("DRAFT", "CANCELLED")).toBe(true);
  });

  it("disallows DRAFT → COMPLETED (must submit first)", () => {
    expect(isSupplierReturnTransitionAllowed("DRAFT", "COMPLETED")).toBe(false);
  });

  it("allows SUBMITTED → COMPLETED", () => {
    expect(isSupplierReturnTransitionAllowed("SUBMITTED", "COMPLETED")).toBe(true);
  });

  it("allows SUBMITTED → CANCELLED", () => {
    expect(isSupplierReturnTransitionAllowed("SUBMITTED", "CANCELLED")).toBe(true);
  });

  it("disallows COMPLETED → any (terminal)", () => {
    expect(isSupplierReturnTransitionAllowed("COMPLETED", "DRAFT")).toBe(false);
    expect(isSupplierReturnTransitionAllowed("COMPLETED", "SUBMITTED")).toBe(false);
  });

  it("disallows CANCELLED → any (terminal)", () => {
    expect(isSupplierReturnTransitionAllowed("CANCELLED", "DRAFT")).toBe(false);
  });

  it("allows same-stage transitions (no-op)", () => {
    expect(isSupplierReturnTransitionAllowed("DRAFT", "DRAFT")).toBe(true);
    expect(isSupplierReturnTransitionAllowed("COMPLETED", "COMPLETED")).toBe(true);
  });
});
