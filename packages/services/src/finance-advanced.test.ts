/**
 * Unit tests for the pure finance advanced helpers.
 *
 *   computeProfitCenterMetrics  — derived P&L metrics from raw cost/revenue
 *   computeBudgetVariance       — budget vs actual variance + status
 */
import { describe, it, expect } from "vitest";
import { computeProfitCenterMetrics, computeBudgetVariance } from "./finance-advanced";
import Decimal from "decimal.js";

describe("computeProfitCenterMetrics", () => {
  it("computes metrics for a profitable project", () => {
    const r = computeProfitCenterMetrics({
      totalRevenue: new Decimal(10000000),
      costRecovery: new Decimal(50000),
      landCost: new Decimal(2000000),
      materialCost: new Decimal(3000000),
      labourCost: new Decimal(1000000),
      equipmentCost: new Decimal(500000),
      subcontractorCost: new Decimal(800000),
      overheadCost: new Decimal(200000),
      totalSellableArea: new Decimal(5000),
    });
    expect(r.totalInflow.toNumber()).toBe(10050000);
    expect(r.totalCost.toNumber()).toBe(7500000);
    expect(r.grossProfit.toNumber()).toBe(2550000);
    // marginPct = 2550000 / 10050000 × 100 = 25.37%
    expect(r.marginPct.toNumber()).toBeCloseTo(25.37, 1);
    // costPerSqft = 7500000 / 5000 = 1500
    expect(r.costPerSqft.toNumber()).toBe(1500);
    // revenuePerSqft = 10000000 / 5000 = 2000
    expect(r.revenuePerSqft.toNumber()).toBe(2000);
  });

  it("computes metrics for a loss-making project", () => {
    const r = computeProfitCenterMetrics({
      totalRevenue: new Decimal(5000000),
      costRecovery: new Decimal(0),
      landCost: new Decimal(3000000),
      materialCost: new Decimal(3000000),
      labourCost: new Decimal(1000000),
      equipmentCost: new Decimal(500000),
      subcontractorCost: new Decimal(800000),
      overheadCost: new Decimal(200000),
      totalSellableArea: new Decimal(5000),
    });
    expect(r.totalInflow.toNumber()).toBe(5000000);
    expect(r.totalCost.toNumber()).toBe(8500000);
    expect(r.grossProfit.toNumber()).toBe(-3500000);
    expect(r.marginPct.toNumber()).toBe(-70); // -3500000 / 5000000 × 100
  });

  it("handles zero inflow (marginPct = 0)", () => {
    const r = computeProfitCenterMetrics({
      totalRevenue: new Decimal(0),
      costRecovery: new Decimal(0),
      landCost: new Decimal(100000),
      materialCost: new Decimal(50000),
      labourCost: new Decimal(0),
      equipmentCost: new Decimal(0),
      subcontractorCost: new Decimal(0),
      overheadCost: new Decimal(0),
      totalSellableArea: new Decimal(1000),
    });
    expect(r.marginPct.toNumber()).toBe(0);
    expect(r.grossProfit.toNumber()).toBe(-150000);
  });

  it("handles zero sellable area (per-sqft = 0)", () => {
    const r = computeProfitCenterMetrics({
      totalRevenue: new Decimal(1000000),
      costRecovery: new Decimal(0),
      landCost: new Decimal(500000),
      materialCost: new Decimal(0),
      labourCost: new Decimal(0),
      equipmentCost: new Decimal(0),
      subcontractorCost: new Decimal(0),
      overheadCost: new Decimal(0),
      totalSellableArea: new Decimal(0),
    });
    expect(r.costPerSqft.toNumber()).toBe(0);
    expect(r.revenuePerSqft.toNumber()).toBe(0);
  });

  it("handles cost recovery only (no direct revenue)", () => {
    const r = computeProfitCenterMetrics({
      totalRevenue: new Decimal(0),
      costRecovery: new Decimal(100000),
      landCost: new Decimal(50000),
      materialCost: new Decimal(0),
      labourCost: new Decimal(0),
      equipmentCost: new Decimal(0),
      subcontractorCost: new Decimal(0),
      overheadCost: new Decimal(0),
      totalSellableArea: new Decimal(1000),
    });
    expect(r.totalInflow.toNumber()).toBe(100000);
    expect(r.grossProfit.toNumber()).toBe(50000);
  });
});

describe("computeBudgetVariance", () => {
  it("returns ON_TRACK when actual is within ±5% of budget", () => {
    const r = computeBudgetVariance(new Decimal(1000), new Decimal(980));
    expect(r.variance.toNumber()).toBe(20);
    expect(r.variancePct.toNumber()).toBe(2);
    expect(r.status).toBe("ON_TRACK");
  });

  it("returns OVER when actual exceeds budget by > 5%", () => {
    const r = computeBudgetVariance(new Decimal(1000), new Decimal(1100));
    expect(r.variance.toNumber()).toBe(-100);
    expect(r.variancePct.toNumber()).toBe(-10);
    expect(r.status).toBe("OVER");
  });

  it("returns UNDER when actual is < budget by > 5%", () => {
    const r = computeBudgetVariance(new Decimal(1000), new Decimal(800));
    expect(r.variance.toNumber()).toBe(200);
    expect(r.variancePct.toNumber()).toBe(20);
    expect(r.status).toBe("UNDER");
  });

  it("returns ON_TRACK at exactly 5% boundary", () => {
    const r = computeBudgetVariance(new Decimal(1000), new Decimal(950));
    // variancePct = 5, gt(5) is false → ON_TRACK
    expect(r.variancePct.toNumber()).toBe(5);
    expect(r.status).toBe("ON_TRACK");
  });

  it("returns ON_TRACK at exactly -5% boundary", () => {
    const r = computeBudgetVariance(new Decimal(1000), new Decimal(1050));
    // variancePct = -5, lt(-5) is false → ON_TRACK
    expect(r.variancePct.toNumber()).toBe(-5);
    expect(r.status).toBe("ON_TRACK");
  });

  it("handles zero budget (variancePct = 0)", () => {
    const r = computeBudgetVariance(new Decimal(0), new Decimal(100));
    expect(r.variance.toNumber()).toBe(-100);
    expect(r.variancePct.toNumber()).toBe(0);
    expect(r.status).toBe("ON_TRACK");
  });

  it("handles zero actual (full budget unspent)", () => {
    const r = computeBudgetVariance(new Decimal(1000), new Decimal(0));
    expect(r.variance.toNumber()).toBe(1000);
    expect(r.variancePct.toNumber()).toBe(100);
    expect(r.status).toBe("UNDER");
  });
});
