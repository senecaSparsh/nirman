/**
 * Unit tests for workflow templates.
 *
 *   WORKFLOW_TEMPLATES — predefined workflow graph templates
 */
import { describe, it, expect } from "vitest";
import { WORKFLOW_TEMPLATES } from "./workflow-templates";

describe("WORKFLOW_TEMPLATES", () => {
  it("is a non-empty array", () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("every template has a unique key", () => {
    const keys = WORKFLOW_TEMPLATES.map((t) => t.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("every template has a label, description, and icon", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      expect(t.label).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.icon).toBeTruthy();
    }
  });

  it("every template has a valid graph with steps and edges", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      expect(t.graph).toBeDefined();
      expect(t.graph.steps).toBeDefined();
      expect(t.graph.steps.length).toBeGreaterThan(0);
      expect(t.graph.startStepId).toBeTruthy();
    }
  });

  it("every graph's startStepId exists in its steps", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      const stepIds = t.graph.steps.map((s) => s.id);
      expect(stepIds).toContain(t.graph.startStepId);
    }
  });

  it("every step has an id, type, and label", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      for (const step of t.graph.steps) {
        expect(step.id).toBeTruthy();
        expect(step.type).toBeTruthy();
        expect(step.label).toBeTruthy();
      }
    }
  });

  it("every edge references existing step IDs", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      const stepIds = new Set(t.graph.steps.map((s) => s.id));
      for (const edge of t.graph.edges) {
        expect(stepIds.has(edge.from)).toBe(true);
        expect(stepIds.has(edge.to)).toBe(true);
      }
    }
  });

  it("includes the weekly-site-inspection template", () => {
    const t = WORKFLOW_TEMPLATES.find((x) => x.key === "weekly-site-inspection");
    expect(t).toBeDefined();
    expect(t?.label).toBe("Weekly Site Inspection");
  });

  it("includes the low-stock-reorder template", () => {
    const t = WORKFLOW_TEMPLATES.find((x) => x.key === "low-stock-reorder");
    expect(t).toBeDefined();
    expect(t?.label).toBe("Low Stock Reorder");
  });
});
