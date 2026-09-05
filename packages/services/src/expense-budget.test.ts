/**
 * Unit tests for the pure expense budget helpers.
 *
 *   computeUtilizationPct       — actual / budget × 100 (1 dp)
 *   computeBudgetVarianceAmount — budget − actual
 */
import { describe, it, expect } from "vitest";
import { computeUtilizationPct, computeBudgetVarianceAmount } from "./expense-budget";

describe("computeUtilizationPct", () => {
  it("computes utilization percentage with 1 decimal place", () => {
    // 750 / 1000 × 100 = 75.0
    expect(computeUtilizationPct(1000, 750)).toBe(75);
  });

  it("rounds to 1 decimal place", () => {
    // 333 / 1000 × 100 = 33.3
    expect(computeUtilizationPct(1000, 333)).toBe(33.3);
  });

  it("rounds 33.33% to 33.3", () => {
    // 333.3 / 1000 × 100 = 33.33 → Math.round(333.3) / 10 = 33.3
    expect(computeUtilizationPct(1000, 333.3)).toBe(33.3);
  });

  it("returns 0 when budget is 0", () => {
    expect(computeUtilizationPct(0, 500)).toBe(0);
  });

  it("returns 0 when budget is negative", () => {
    expect(computeUtilizationPct(-100, 500)).toBe(0);
  });

  it("handles 100% utilization", () => {
    expect(computeUtilizationPct(1000, 1000)).toBe(100);
  });

  it("handles 0% utilization (no actual spend)", () => {
    expect(computeUtilizationPct(1000, 0)).toBe(0);
  });

  it("handles over-utilization (> 100%)", () => {
    expect(computeUtilizationPct(1000, 1500)).toBe(150);
  });
});

describe("computeBudgetVarianceAmount", () => {
  it("computes positive variance (under-spent)", () => {
    expect(computeBudgetVarianceAmount(1000, 750)).toBe(250);
  });

  it("computes negative variance (over-spent)", () => {
    expect(computeBudgetVarianceAmount(1000, 1200)).toBe(-200);
  });

  it("computes zero variance (exact spend)", () => {
    expect(computeBudgetVarianceAmount(1000, 1000)).toBe(0);
  });

  it("handles zero actual", () => {
    expect(computeBudgetVarianceAmount(1000, 0)).toBe(1000);
  });

  it("handles zero budget", () => {
    expect(computeBudgetVarianceAmount(0, 500)).toBe(-500);
  });
});
