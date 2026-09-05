/**
 * Unit tests for pure reconciliation helpers in reconciliation-health.ts.
 *
 *   decimalDelta    — actual − expected
 *   statusForDelta  — PASS / WARN / FAIL from delta and tolerances
 *   buildCheck      — construct a ReconciliationCheck
 *   summarizeChecks — count PASS/WARN/FAIL
 */
import { describe, it, expect } from "vitest";
import {
  decimalDelta,
  statusForDelta,
  buildCheck,
  summarizeChecks,
} from "./reconciliation-health";
import Decimal from "decimal.js";

describe("decimalDelta", () => {
  it("computes actual - expected", () => {
    expect(decimalDelta(100, 80).toNumber()).toBe(20);
    expect(decimalDelta(80, 100).toNumber()).toBe(-20);
  });

  it("returns 0 when actual equals expected", () => {
    expect(decimalDelta(100, 100).toNumber()).toBe(0);
  });

  it("accepts string and number inputs", () => {
    expect(decimalDelta("100", "80").toNumber()).toBe(20);
    expect(decimalDelta(100, 80).toNumber()).toBe(20);
  });
});

describe("statusForDelta", () => {
  it("returns PASS when |delta| <= tolerance", () => {
    expect(statusForDelta(0, 0.01)).toBe("PASS");
    expect(statusForDelta(0.01, 0.01)).toBe("PASS");
    expect(statusForDelta(-0.01, 0.01)).toBe("PASS");
  });

  it("returns FAIL when |delta| > tolerance and no warnAt", () => {
    expect(statusForDelta(0.02, 0.01)).toBe("FAIL");
    expect(statusForDelta(-0.05, 0.01)).toBe("FAIL");
  });

  it("returns WARN when tolerance < |delta| <= warnAt", () => {
    expect(statusForDelta(0.05, 0.01, 0.1)).toBe("WARN");
    expect(statusForDelta(0.1, 0.01, 0.1)).toBe("WARN");
  });

  it("returns FAIL when |delta| > warnAt", () => {
    expect(statusForDelta(0.15, 0.01, 0.1)).toBe("FAIL");
  });

  it("uses absolute value of delta", () => {
    expect(statusForDelta(-0.05, 0.01, 0.1)).toBe("WARN");
    expect(statusForDelta(-0.15, 0.01, 0.1)).toBe("FAIL");
  });
});

describe("buildCheck", () => {
  it("builds a PASS check when delta is within tolerance", () => {
    const check = buildCheck({
      id: "check-1",
      name: "Stock Reconciliation",
      description: "Verify stock matches ledger",
      expected: 100,
      actual: 100,
      tolerance: 0.01,
    });
    expect(check.status).toBe("PASS");
    expect(check.message).toBeUndefined();
    expect(check.delta).toBe("0");
  });

  it("builds a FAIL check with message when delta exceeds tolerance", () => {
    const check = buildCheck({
      id: "check-2",
      name: "GL Reconciliation",
      description: "Verify GL balances",
      expected: 1000,
      actual: 950,
      tolerance: 0.01,
      message: "GL is out of balance by 50",
    });
    expect(check.status).toBe("FAIL");
    expect(check.message).toBe("GL is out of balance by 50");
    expect(check.delta).toBe("-50");
  });

  it("builds a WARN check when delta is in warn band", () => {
    const check = buildCheck({
      id: "check-3",
      name: "Cost Reconciliation",
      description: "Verify cost allocation",
      expected: 100,
      actual: 105,
      tolerance: 1,
      warnAt: 10,
      message: "Cost drift detected",
    });
    expect(check.status).toBe("WARN");
    expect(check.message).toBe("Cost drift detected");
  });
});

describe("summarizeChecks", () => {
  it("counts checks by status", () => {
    const checks = [
      { status: "PASS" as const, id: "1", name: "", description: "", expected: "", actual: "", delta: "", tolerance: "", details: [] },
      { status: "PASS" as const, id: "2", name: "", description: "", expected: "", actual: "", delta: "", tolerance: "", details: [] },
      { status: "WARN" as const, id: "3", name: "", description: "", expected: "", actual: "", delta: "", tolerance: "", details: [] },
      { status: "FAIL" as const, id: "4", name: "", description: "", expected: "", actual: "", delta: "", tolerance: "", details: [] },
    ];
    const summary = summarizeChecks(checks);
    expect(summary.total).toBe(4);
    expect(summary.passed).toBe(2);
    expect(summary.warned).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it("returns all zeros for empty array", () => {
    const summary = summarizeChecks([]);
    expect(summary.total).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.warned).toBe(0);
    expect(summary.failed).toBe(0);
  });
});
