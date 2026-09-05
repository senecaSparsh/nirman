/**
 * Unit tests for the pure land helpers extracted from land.ts.
 *
 *   validateAreaConservation — Σ sections = total area
 *   allocateCostProRata      — pro-rata cost by area
 *   validateLandPayment      — payment amount + overpayment check
 */
import { describe, it, expect } from "vitest";
import { validateAreaConservation, allocateCostProRata, validateLandPayment } from "./land";
import { ServiceError } from "./errors";
import Decimal from "decimal.js";

describe("validateAreaConservation", () => {
  it("passes when sections sum to total area", () => {
    expect(() =>
      validateAreaConservation([new Decimal(500), new Decimal(300), new Decimal(200)], new Decimal(1000)),
    ).not.toThrow();
  });

  it("throws when sections sum exceeds total area", () => {
    expect(() =>
      validateAreaConservation([new Decimal(600), new Decimal(500)], new Decimal(1000)),
    ).toThrow("Area conservation violated");
  });

  it("throws when sections sum is less than total area", () => {
    expect(() =>
      validateAreaConservation([new Decimal(400), new Decimal(500)], new Decimal(1000)),
    ).toThrow("Area conservation violated");
  });

  it("passes for single section equal to total", () => {
    expect(() =>
      validateAreaConservation([new Decimal(1000)], new Decimal(1000)),
    ).not.toThrow();
  });

  it("passes for empty sections with zero total", () => {
    expect(() => validateAreaConservation([], new Decimal(0))).not.toThrow();
  });

  it("handles fractional areas", () => {
    expect(() =>
      validateAreaConservation([new Decimal(333.33), new Decimal(333.33), new Decimal(333.34)], new Decimal(1000)),
    ).not.toThrow();
  });
});

describe("allocateCostProRata", () => {
  it("allocates cost proportionally by area", () => {
    const costs = allocateCostProRata(new Decimal(1000000), [new Decimal(500), new Decimal(300), new Decimal(200)]);
    expect(costs[0]!.toNumber()).toBe(500000);
    expect(costs[1]!.toNumber()).toBe(300000);
    expect(costs[2]!.toNumber()).toBe(200000);
  });

  it("allocates full cost to single section", () => {
    const costs = allocateCostProRata(new Decimal(1000000), [new Decimal(1000)]);
    expect(costs[0]!.toNumber()).toBe(1000000);
  });

  it("handles equal sections", () => {
    const costs = allocateCostProRata(new Decimal(900), [new Decimal(100), new Decimal(100), new Decimal(100)]);
    expect(costs[0]!.toNumber()).toBe(300);
    expect(costs[1]!.toNumber()).toBe(300);
    expect(costs[2]!.toNumber()).toBe(300);
  });

  it("throws when sum of areas is 0", () => {
    expect(() => allocateCostProRata(new Decimal(1000), [new Decimal(0), new Decimal(0)])).toThrow(
      "Sum of section areas must be > 0",
    );
  });

  it("handles fractional areas", () => {
    const costs = allocateCostProRata(new Decimal(1000), [new Decimal(33.33), new Decimal(66.67)]);
    expect(costs[0]!.toNumber()).toBeCloseTo(333.3, 1);
    expect(costs[1]!.toNumber()).toBeCloseTo(666.7, 1);
  });
});

describe("validateLandPayment", () => {
  it("passes for valid payment within total cost", () => {
    expect(() => validateLandPayment(new Decimal(500), new Decimal(0), new Decimal(1000))).not.toThrow();
  });

  it("throws when amount is 0", () => {
    expect(() => validateLandPayment(new Decimal(0), new Decimal(0), new Decimal(1000))).toThrow(
      "Payment amount must be > 0",
    );
  });

  it("throws when amount is negative", () => {
    expect(() => validateLandPayment(new Decimal(-100), new Decimal(0), new Decimal(1000))).toThrow(
      "Payment amount must be > 0",
    );
  });

  it("throws when cumulative payment exceeds total cost", () => {
    expect(() => validateLandPayment(new Decimal(600), new Decimal(500), new Decimal(1000))).toThrow(
      "Overpayment",
    );
  });

  it("allows payment exactly up to total cost", () => {
    expect(() => validateLandPayment(new Decimal(500), new Decimal(500), new Decimal(1000))).not.toThrow();
  });
});
