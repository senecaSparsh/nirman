/**
 * Unit tests for workflow engine pure helpers.
 *
 *   evaluateCondition — evaluate a condition operator against field/value
 *   findNextStep      — find the next edge to follow from a step
 */
import { describe, it, expect } from "vitest";
import { evaluateCondition, findNextStep } from "./workflow-engine";
import type { WorkflowEdge } from "./workflow-engine";

describe("evaluateCondition", () => {
  it("eq returns true when values match", () => {
    expect(evaluateCondition("eq", "APPROVED", "APPROVED")).toBe(true);
  });

  it("eq returns false when values differ", () => {
    expect(evaluateCondition("eq", "DRAFT", "APPROVED")).toBe(false);
  });

  it("ne returns true when values differ", () => {
    expect(evaluateCondition("ne", "DRAFT", "APPROVED")).toBe(true);
  });

  it("ne returns false when values match", () => {
    expect(evaluateCondition("ne", "APPROVED", "APPROVED")).toBe(false);
  });

  it("gt returns true when fieldValue > value", () => {
    expect(evaluateCondition("gt", "100", "50")).toBe(true);
  });

  it("gt returns false when fieldValue = value", () => {
    expect(evaluateCondition("gt", "100", "100")).toBe(false);
  });

  it("gt returns false when fieldValue < value", () => {
    expect(evaluateCondition("gt", "50", "100")).toBe(false);
  });

  it("lt returns true when fieldValue < value", () => {
    expect(evaluateCondition("lt", "50", "100")).toBe(true);
  });

  it("lt returns false when fieldValue = value", () => {
    expect(evaluateCondition("lt", "100", "100")).toBe(false);
  });

  it("lt returns false when fieldValue > value", () => {
    expect(evaluateCondition("lt", "100", "50")).toBe(false);
  });

  it("contains returns true when fieldValue includes value", () => {
    expect(evaluateCondition("contains", "hello world", "world")).toBe(true);
  });

  it("contains returns false when fieldValue does not include value", () => {
    expect(evaluateCondition("contains", "hello", "world")).toBe(false);
  });

  it("unknown operator returns false", () => {
    expect(evaluateCondition("unknown", "abc", "abc")).toBe(false);
  });

  it("handles numeric comparison with decimals", () => {
    expect(evaluateCondition("gt", "99.5", "99.4")).toBe(true);
    expect(evaluateCondition("lt", "99.4", "99.5")).toBe(true);
  });

  it("handles empty strings", () => {
    expect(evaluateCondition("eq", "", "")).toBe(true);
    expect(evaluateCondition("contains", "", "")).toBe(true);
  });
});
