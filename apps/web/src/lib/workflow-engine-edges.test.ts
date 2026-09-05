/**
 * Unit tests for findNextStep — workflow graph edge traversal.
 */
import { describe, it, expect } from "vitest";
import { findNextStep } from "./workflow-engine";
import type { WorkflowEdge } from "./workflow-engine";

describe("findNextStep", () => {
  const edges: WorkflowEdge[] = [
    { from: "step1", to: "step2", condition: "true" },
    { from: "step1", to: "step3", condition: "false" },
    { from: "step2", to: "step4" },
    { from: "step3", to: "step5" },
  ];

  it("follows the true branch from a condition step", () => {
    expect(findNextStep(edges, "step1", "true")).toBe("step2");
  });

  it("follows the false branch from a condition step", () => {
    expect(findNextStep(edges, "step1", "false")).toBe("step3");
  });

  it("follows non-conditional edge when no branch specified", () => {
    expect(findNextStep(edges, "step2")).toBe("step4");
  });

  it("returns null when no edges from step", () => {
    expect(findNextStep(edges, "nonexistent")).toBeNull();
  });

  it("returns null when no matching branch", () => {
    expect(findNextStep(edges, "step1", "unknown")).toBeNull();
  });

  it("falls back to non-conditional edge when branch not found", () => {
    // step2 has only a non-conditional edge, no condition match
    expect(findNextStep(edges, "step2", "true")).toBe("step4");
  });

  it("handles empty edges array", () => {
    expect(findNextStep([], "step1")).toBeNull();
  });

  it("handles empty branch string", () => {
    // Empty string branch — should fall back to non-conditional
    expect(findNextStep(edges, "step2", "")).toBe("step4");
  });

  it("prefers branch match over fallback", () => {
    const multiEdges: WorkflowEdge[] = [
      { from: "s1", to: "branch_target", condition: "true" },
      { from: "s1", to: "fallback_target" },
    ];
    expect(findNextStep(multiEdges, "s1", "true")).toBe("branch_target");
  });
});
