/**
 * Unit tests for the pure EVM metrics function in boq.ts.
 *
 *   computeEvmMetrics — Earned Value Management derived metrics
 *
 *   PV = Planned Value (BAC)
 *   EV = Earned Value
 *   AC = Actual Cost
 *
 *   CV = EV − AC     (Cost Variance)
 *   SV = EV − PV     (Schedule Variance)
 *   CPI = EV / AC    (Cost Performance Index)
 *   SPI = EV / PV    (Schedule Performance Index)
 *   EAC = BAC / CPI  (Estimate at Completion)
 *   VAC = BAC − EAC  (Variance at Completion)
 *   pctComplete = EV / PV × 100
 */
import { describe, it, expect } from "vitest";
import { computeEvmMetrics } from "./boq";
import Decimal from "decimal.js";

describe("computeEvmMetrics", () => {
  it("computes all metrics for a project on budget and on schedule", () => {
    // PV=1000, EV=1000, AC=1000 → perfect project
    const m = computeEvmMetrics(new Decimal(1000), new Decimal(1000), new Decimal(1000));
    expect(m.cv.toNumber()).toBe(0);    // EV - AC = 0
    expect(m.sv.toNumber()).toBe(0);    // EV - PV = 0
    expect(m.cpi.toNumber()).toBe(1);   // EV / AC = 1
    expect(m.spi.toNumber()).toBe(1);   // EV / PV = 1
    expect(m.eac.toNumber()).toBe(1000); // BAC / CPI = 1000
    expect(m.vac.toNumber()).toBe(0);   // BAC - EAC = 0
    expect(m.pctComplete.toNumber()).toBe(100);
  });

  it("computes metrics for under-budget, ahead-of-schedule project", () => {
    // PV=1000, EV=1200, AC=800
    const m = computeEvmMetrics(new Decimal(1000), new Decimal(1200), new Decimal(800));
    expect(m.cv.toNumber()).toBe(400);   // 1200 - 800 = 400 (positive = under budget)
    expect(m.sv.toNumber()).toBe(200);   // 1200 - 1000 = 200 (positive = ahead)
    expect(m.cpi.toNumber()).toBe(1.5);  // 1200 / 800 = 1.5
    expect(m.spi.toNumber()).toBe(1.2);  // 1200 / 1000 = 1.2
    expect(m.eac.toNumber()).toBeCloseTo(666.67, 1); // 1000 / 1.5 = 666.67
    expect(m.vac.toNumber()).toBeCloseTo(333.33, 1); // 1000 - 666.67
    expect(m.pctComplete.toNumber()).toBe(120);
  });

  it("computes metrics for over-budget, behind-schedule project", () => {
    // PV=1000, EV=600, AC=1200
    const m = computeEvmMetrics(new Decimal(1000), new Decimal(600), new Decimal(1200));
    expect(m.cv.toNumber()).toBe(-600);  // 600 - 1200 = -600 (over budget)
    expect(m.sv.toNumber()).toBe(-400);  // 600 - 1000 = -400 (behind)
    expect(m.cpi.toNumber()).toBe(0.5);  // 600 / 1200 = 0.5
    expect(m.spi.toNumber()).toBe(0.6);  // 600 / 1000 = 0.6
    expect(m.eac.toNumber()).toBe(2000); // 1000 / 0.5 = 2000
    expect(m.vac.toNumber()).toBe(-1000); // 1000 - 2000 = -1000
    expect(m.pctComplete.toNumber()).toBe(60);
  });

  it("handles zero AC (no actual cost yet) — CPI defaults to 1", () => {
    const m = computeEvmMetrics(new Decimal(1000), new Decimal(0), new Decimal(0));
    expect(m.cpi.toNumber()).toBe(1); // guard against division by zero
    expect(m.cv.toNumber()).toBe(0);
    expect(m.eac.toNumber()).toBe(1000); // BAC / 1 = BAC
  });

  it("handles zero PV (no planned work) — SPI defaults to 1, pctComplete = 0", () => {
    const m = computeEvmMetrics(new Decimal(0), new Decimal(0), new Decimal(0));
    expect(m.spi.toNumber()).toBe(1); // guard against division by zero
    expect(m.pctComplete.toNumber()).toBe(0);
    expect(m.sv.toNumber()).toBe(0);
  });

  it("handles zero EV (no work done)", () => {
    const m = computeEvmMetrics(new Decimal(1000), new Decimal(0), new Decimal(500));
    expect(m.cv.toNumber()).toBe(-500);  // 0 - 500 = -500
    expect(m.sv.toNumber()).toBe(-1000); // 0 - 1000 = -1000
    expect(m.cpi.toNumber()).toBe(0);    // 0 / 500 = 0
    expect(m.spi.toNumber()).toBe(0);    // 0 / 1000 = 0
    expect(m.pctComplete.toNumber()).toBe(0);
  });

  it("handles CPI of 0 (EV=0, AC>0) — EAC falls back to PV", () => {
    const m = computeEvmMetrics(new Decimal(1000), new Decimal(0), new Decimal(500));
    // cpi = 0, so eac = pv (guard against division by zero)
    expect(m.eac.toNumber()).toBe(1000);
  });

  it("handles all zeros", () => {
    const m = computeEvmMetrics(new Decimal(0), new Decimal(0), new Decimal(0));
    expect(m.cv.toNumber()).toBe(0);
    expect(m.sv.toNumber()).toBe(0);
    expect(m.cpi.toNumber()).toBe(1); // guard: AC=0 → CPI=1
    expect(m.spi.toNumber()).toBe(1); // guard: PV=0 → SPI=1
    expect(m.eac.toNumber()).toBe(0); // PV/CPI = 0/1 = 0
    expect(m.vac.toNumber()).toBe(0);
    expect(m.pctComplete.toNumber()).toBe(0);
  });

  it("handles very large values", () => {
    const pv = new Decimal("1000000000");
    const ev = new Decimal("800000000");
    const ac = new Decimal("900000000");
    const m = computeEvmMetrics(pv, ev, ac);
    expect(m.cv.toNumber()).toBe(-100000000);
    expect(m.sv.toNumber()).toBe(-200000000);
    expect(m.cpi.toNumber()).toBeCloseTo(0.8889, 3);
    expect(m.spi.toNumber()).toBeCloseTo(0.8, 1);
  });

  it("handles fractional values", () => {
    const m = computeEvmMetrics(new Decimal(1000.5), new Decimal(750.25), new Decimal(800.75));
    expect(m.cv.toNumber()).toBeCloseTo(-50.5, 2); // 750.25 - 800.75
    expect(m.sv.toNumber()).toBeCloseTo(-250.25, 2); // 750.25 - 1000.5
  });

  it("computes pctComplete as EV/PV*100", () => {
    const m = computeEvmMetrics(new Decimal(2000), new Decimal(500), new Decimal(400));
    expect(m.pctComplete.toNumber()).toBe(25); // 500/2000*100 = 25
  });

  it("pctComplete > 100 when EV > PV (ahead of schedule)", () => {
    const m = computeEvmMetrics(new Decimal(1000), new Decimal(1500), new Decimal(1000));
    expect(m.pctComplete.toNumber()).toBe(150);
  });

  it("VAC is positive when under budget (EAC < BAC)", () => {
    const m = computeEvmMetrics(new Decimal(1000), new Decimal(1200), new Decimal(800));
    expect(m.vac.toNumber()).toBeGreaterThan(0);
  });

  it("VAC is negative when over budget (EAC > BAC)", () => {
    const m = computeEvmMetrics(new Decimal(1000), new Decimal(800), new Decimal(1200));
    expect(m.vac.toNumber()).toBeLessThan(0);
  });

  it("EAC = PV / CPI when CPI > 0", () => {
    const pv = new Decimal(10000);
    const ev = new Decimal(5000);
    const ac = new Decimal(2500);
    const m = computeEvmMetrics(pv, ev, ac);
    // CPI = 5000/2500 = 2, EAC = 10000/2 = 5000
    expect(m.cpi.toNumber()).toBe(2);
    expect(m.eac.toNumber()).toBe(5000);
  });

  it("SPI = EV / PV when PV > 0", () => {
    const m = computeEvmMetrics(new Decimal(1000), new Decimal(300), new Decimal(500));
    expect(m.spi.toNumber()).toBe(0.3); // 300/1000
  });

  it("handles negative AC (edge case — should not crash)", () => {
    // Negative AC is unusual but the function should still compute
    const m = computeEvmMetrics(new Decimal(1000), new Decimal(500), new Decimal(-100));
    // AC is not > 0, so CPI defaults to 1
    expect(m.cpi.toNumber()).toBe(1);
    expect(m.cv.toNumber()).toBe(600); // 500 - (-100) = 600
  });
});
