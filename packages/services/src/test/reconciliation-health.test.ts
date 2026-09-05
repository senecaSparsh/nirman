/**
 * Unit tests for the pure helpers in reconciliation-health.ts:
 *   - decimalDelta
 *   - statusForDelta (PASS / WARN / FAIL bands)
 *   - buildCheck
 *   - summarizeChecks
 *
 * These are pure functions — no DB, no mocking needed.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  decimalDelta,
  statusForDelta,
  buildCheck,
  summarizeChecks,
  type ReconciliationCheck,
} from "../reconciliation-health";

describe("decimalDelta", () => {
  it("returns actual − expected as a Decimal", () => {
    expect(decimalDelta("105", "100").toString()).toBe("5");
    expect(decimalDelta(100, 105).toString()).toBe("-5");
    expect(decimalDelta(new Decimal("12.34"), new Decimal("10.00")).toString()).toBe("2.34");
  });

  it("returns 0 when actual equals expected", () => {
    expect(decimalDelta("100", "100").toString()).toBe("0");
  });

  it("accepts mixed input types", () => {
    expect(decimalDelta(new Decimal("50"), "40").toString()).toBe("10");
    expect(decimalDelta("40", new Decimal("50")).toString()).toBe("-10");
  });
});

describe("statusForDelta", () => {
  it("returns PASS when |delta| ≤ tolerance", () => {
    expect(statusForDelta("0", "0.01")).toBe("PASS");
    expect(statusForDelta("0.01", "0.01")).toBe("PASS");
    expect(statusForDelta("-0.01", "0.01")).toBe("PASS");
    expect(statusForDelta("0.005", "0.01")).toBe("PASS");
  });

  it("returns FAIL when |delta| > tolerance and no warnAt", () => {
    expect(statusForDelta("0.02", "0.01")).toBe("FAIL");
    expect(statusForDelta("-0.02", "0.01")).toBe("FAIL");
    expect(statusForDelta("100", "0.01")).toBe("FAIL");
  });

  it("returns WARN when tolerance < |delta| ≤ warnAt", () => {
    expect(statusForDelta("0.05", "0.01", "0.10")).toBe("WARN");
    expect(statusForDelta("0.10", "0.01", "0.10")).toBe("WARN");
    expect(statusForDelta("-0.05", "0.01", "0.10")).toBe("WARN");
  });

  it("returns FAIL when |delta| > warnAt", () => {
    expect(statusForDelta("0.11", "0.01", "0.10")).toBe("FAIL");
    expect(statusForDelta("-0.11", "0.01", "0.10")).toBe("FAIL");
  });

  it("returns PASS for exactly 0 delta regardless of tolerance", () => {
    expect(statusForDelta(0, 0)).toBe("PASS");
    expect(statusForDelta(0, "0.001")).toBe("PASS");
  });
});

describe("buildCheck", () => {
  it("builds a PASS check when actual is within tolerance", () => {
    const check = buildCheck({
      id: "test-1",
      name: "Test Check",
      description: "A test",
      expected: "100.00",
      actual: "100.00",
      tolerance: "0.01",
    });
    expect(check.status).toBe("PASS");
    expect(check.delta).toBe("0");
    expect(check.message).toBeUndefined();
    expect(check.details).toEqual([]);
  });

  it("builds a FAIL check when actual exceeds tolerance", () => {
    const check = buildCheck({
      id: "test-2",
      name: "Test Check",
      description: "A test",
      expected: "100.00",
      actual: "105.00",
      tolerance: "0.01",
      message: "Something is wrong",
    });
    expect(check.status).toBe("FAIL");
    expect(check.delta).toBe("5");
    expect(check.message).toBe("Something is wrong");
  });

  it("builds a WARN check when delta is in the warn band", () => {
    const check = buildCheck({
      id: "test-3",
      name: "Test Check",
      description: "A test",
      expected: "100.00",
      actual: "100.05",
      tolerance: "0.01",
      warnAt: "0.10",
    });
    expect(check.status).toBe("WARN");
    expect(check.delta).toBe("0.05");
  });

  it("includes details when provided", () => {
    const check = buildCheck({
      id: "test-4",
      name: "Test Check",
      description: "A test",
      expected: "100.00",
      actual: "100.00",
      tolerance: "0.01",
      details: [
        { id: "a:b", label: "Cement @ Warehouse", expected: "50", actual: "50", delta: "0" },
      ],
    });
    expect(check.details).toHaveLength(1);
    expect(check.details[0]!.label).toBe("Cement @ Warehouse");
  });

  it("serializes all Decimal values as strings", () => {
    const check = buildCheck({
      id: "test-5",
      name: "Test Check",
      description: "A test",
      expected: new Decimal("100.00"),
      actual: new Decimal("100.02"),
      tolerance: new Decimal("0.01"),
    });
    expect(typeof check.expected).toBe("string");
    expect(typeof check.actual).toBe("string");
    expect(typeof check.delta).toBe("string");
    expect(typeof check.tolerance).toBe("string");
    expect(check.expected).toBe("100");
    expect(check.actual).toBe("100.02");
    expect(check.delta).toBe("0.02");
  });
});

describe("summarizeChecks", () => {
  it("counts PASS / FAIL / WARN correctly", () => {
    const checks: ReconciliationCheck[] = [
      { id: "1", name: "A", description: "", status: "PASS", expected: "0", actual: "0", delta: "0", tolerance: "0.01", details: [] },
      { id: "2", name: "B", description: "", status: "PASS", expected: "0", actual: "0", delta: "0", tolerance: "0.01", details: [] },
      { id: "3", name: "C", description: "", status: "FAIL", expected: "0", actual: "1", delta: "1", tolerance: "0.01", details: [] },
      { id: "4", name: "D", description: "", status: "WARN", expected: "0", actual: "0.05", delta: "0.05", tolerance: "0.01", details: [] },
    ];
    const summary = summarizeChecks(checks);
    expect(summary.total).toBe(4);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.warned).toBe(1);
  });

  it("returns zeros for an empty array", () => {
    const summary = summarizeChecks([]);
    expect(summary.total).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.warned).toBe(0);
  });
});
