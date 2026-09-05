/**
 * Unit tests for the pure reconciliation helper in reconciliation.ts.
 *
 *   computeReconciliationVariances — compute variances, wastage %, and alert level
 */
import { describe, it, expect } from "vitest";
import { computeReconciliationVariances } from "./reconciliation";
import Decimal from "decimal.js";

describe("computeReconciliationVariances", () => {
  it("computes OK when consumption is within tolerance", () => {
    const r = computeReconciliationVariances(
      new Decimal(100), // required
      new Decimal(100), // issued
      new Decimal(100), // consumed
      new Decimal(0),   // current stock
      new Decimal(5),   // 5% tolerance
    );
    expect(r.issueVariance.toNumber()).toBe(0);
    expect(r.consumptionVariance.toNumber()).toBe(0);
    expect(r.stockVariance.toNumber()).toBe(0);
    expect(r.wastagePct.toNumber()).toBe(0);
    expect(r.isOverTolerance).toBe(false);
    expect(r.alertLevel).toBe("OK");
  });

  it("computes WARNING when wastage exceeds tolerance", () => {
    const r = computeReconciliationVariances(
      new Decimal(100), // required
      new Decimal(108), // issued
      new Decimal(108), // consumed → 8% wastage
      new Decimal(0),   // current stock
      new Decimal(5),   // 5% tolerance
    );
    expect(r.consumptionVariance.toNumber()).toBe(8);
    expect(r.wastagePct.toNumber()).toBe(8);
    expect(r.isOverTolerance).toBe(true);
    expect(r.alertLevel).toBe("WARNING");
  });

  it("computes CRITICAL when wastage exceeds 2× tolerance", () => {
    const r = computeReconciliationVariances(
      new Decimal(100), // required
      new Decimal(115), // issued
      new Decimal(115), // consumed → 15% wastage
      new Decimal(0),   // current stock
      new Decimal(5),   // 5% tolerance, 2× = 10%
    );
    expect(r.wastagePct.toNumber()).toBe(15);
    expect(r.alertLevel).toBe("CRITICAL");
  });

  it("computes negative wastage (under-consumed)", () => {
    const r = computeReconciliationVariances(
      new Decimal(100), // required
      new Decimal(90),  // issued
      new Decimal(90),  // consumed → -10% wastage
      new Decimal(0),   // current stock
      new Decimal(5),
    );
    expect(r.wastagePct.toNumber()).toBe(-10);
    expect(r.isOverTolerance).toBe(false);
    expect(r.alertLevel).toBe("OK");
  });

  it("handles zero required qty (wastage = 0)", () => {
    const r = computeReconciliationVariances(
      new Decimal(0),   // required = 0
      new Decimal(50),  // issued
      new Decimal(50),  // consumed
      new Decimal(0),
      new Decimal(5),
    );
    expect(r.wastagePct.toNumber()).toBe(0); // guard against division by zero
    expect(r.alertLevel).toBe("OK");
  });

  it("computes stock variance (issued - consumed - currentStock)", () => {
    const r = computeReconciliationVariances(
      new Decimal(100), // required
      new Decimal(100), // issued
      new Decimal(80),  // consumed
      new Decimal(15),  // current stock → stockVariance = 100 - 80 - 15 = 5
      new Decimal(5),
    );
    expect(r.stockVariance.toNumber()).toBe(5);
  });

  it("computes negative stock variance (unaccounted stock)", () => {
    const r = computeReconciliationVariances(
      new Decimal(100), // required
      new Decimal(100), // issued
      new Decimal(90),  // consumed
      new Decimal(20),  // current stock → stockVariance = 100 - 90 - 20 = -10
      new Decimal(5),
    );
    expect(r.stockVariance.toNumber()).toBe(-10);
  });

  it("computes issue variance (over-issued)", () => {
    const r = computeReconciliationVariances(
      new Decimal(100), // required
      new Decimal(120), // issued → issueVariance = 20
      new Decimal(100), // consumed
      new Decimal(20),  // current stock
      new Decimal(5),
    );
    expect(r.issueVariance.toNumber()).toBe(20);
  });

  it("handles exactly at tolerance boundary (not over)", () => {
    const r = computeReconciliationVariances(
      new Decimal(100), // required
      new Decimal(105), // issued
      new Decimal(105), // consumed → 5% wastage = exactly at tolerance
      new Decimal(0),
      new Decimal(5),
    );
    // wastagePct = 5, tolerance = 5 → gt(5) is false → not over tolerance
    expect(r.wastagePct.toNumber()).toBe(5);
    expect(r.isOverTolerance).toBe(false);
    expect(r.alertLevel).toBe("OK");
  });

  it("handles exactly at critical boundary (not critical)", () => {
    const r = computeReconciliationVariances(
      new Decimal(100), // required
      new Decimal(110), // issued
      new Decimal(110), // consumed → 10% wastage = exactly at 2× tolerance
      new Decimal(0),
      new Decimal(5),
    );
    // wastagePct = 10, criticalThreshold = 10 → gt(10) is false → WARNING not CRITICAL
    expect(r.wastagePct.toNumber()).toBe(10);
    expect(r.isOverTolerance).toBe(true);
    expect(r.alertLevel).toBe("WARNING");
  });
});
