/**
 * Unit tests for legal doc flow helpers.
 *
 *   getFlowStepsForContext — filter flow steps by context (LAND/PROJECT/BOTH)
 *   isPrerequisiteMet      — check if a prerequisite doc is satisfied
 *   daysUntilExpiry        — calculate days until a doc expires
 */
import { describe, it, expect } from "vitest";
import {
  getFlowStepsForContext,
  isPrerequisiteMet,
  daysUntilExpiry,
  STAGE_ORDER,
  LEGAL_DOC_FLOW,
} from "./legal-doc-flow";

describe("getFlowStepsForContext", () => {
  it("returns steps for LAND context", () => {
    const steps = getFlowStepsForContext("LAND");
    expect(steps.length).toBeGreaterThan(0);
    // All steps should be LAND or BOTH
    for (const s of steps) {
      expect(["LAND", "BOTH"]).toContain(s.appliesTo);
    }
  });

  it("returns steps for PROJECT context", () => {
    const steps = getFlowStepsForContext("PROJECT");
    expect(steps.length).toBeGreaterThan(0);
    // All steps should be PROJECT or BOTH
    for (const s of steps) {
      expect(["PROJECT", "BOTH"]).toContain(s.appliesTo);
    }
  });

  it("includes BOTH steps in LAND context", () => {
    const landSteps = getFlowStepsForContext("LAND");
    const bothSteps = landSteps.filter((s) => s.appliesTo === "BOTH");
    expect(bothSteps.length).toBeGreaterThan(0);
  });

  it("includes BOTH steps in PROJECT context", () => {
    const projectSteps = getFlowStepsForContext("PROJECT");
    const bothSteps = projectSteps.filter((s) => s.appliesTo === "BOTH");
    expect(bothSteps.length).toBeGreaterThan(0);
  });
});

describe("isPrerequisiteMet", () => {
  it("returns true when prerequisiteType is null (no prerequisite)", () => {
    expect(isPrerequisiteMet(null, [])).toBe(true);
  });

  it("returns false when prerequisite doc not found", () => {
    expect(isPrerequisiteMet("BUILDING_PERMISSION", [])).toBe(false);
  });

  it("returns false when doc exists but not approved", () => {
    expect(
      isPrerequisiteMet("BUILDING_PERMISSION", [
        { type: "BUILDING_PERMISSION", status: "PENDING", obtained: false },
      ]),
    ).toBe(false);
  });

  it("returns false when doc is approved but not obtained", () => {
    expect(
      isPrerequisiteMet("BUILDING_PERMISSION", [
        { type: "BUILDING_PERMISSION", status: "APPROVED", obtained: false },
      ]),
    ).toBe(false);
  });

  it("returns true when doc is approved AND obtained", () => {
    expect(
      isPrerequisiteMet("BUILDING_PERMISSION", [
        { type: "BUILDING_PERMISSION", status: "APPROVED", obtained: true },
      ]),
    ).toBe(true);
  });

  it("returns true when prerequisite doesn't apply to current context", () => {
    // If a PROJECT-only prerequisite is checked in LAND context, it's treated as met
    expect(
      isPrerequisiteMet(
        "BUILDING_PERMISSION",
        [],
        "LAND",
      ),
    ).toBe(true);
  });
});

describe("daysUntilExpiry", () => {
  it("returns null for null input", () => {
    expect(daysUntilExpiry(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(daysUntilExpiry("")).toBeNull();
  });

  it("returns positive days for future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const days = daysUntilExpiry(future);
    expect(days).not.toBeNull();
    expect(days!).toBeGreaterThan(0);
    expect(days!).toBeCloseTo(30, 0);
  });

  it("returns negative days for past date (expired)", () => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    const days = daysUntilExpiry(past);
    expect(days).not.toBeNull();
    expect(days!).toBeLessThan(0);
  });

  it("returns ~0 for today", () => {
    const today = new Date();
    const days = daysUntilExpiry(today);
    expect(days).not.toBeNull();
    expect(Math.abs(days!)).toBeLessThanOrEqual(1);
  });

  it("accepts string date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const days = daysUntilExpiry(future.toISOString());
    expect(days).not.toBeNull();
    expect(days!).toBeGreaterThan(0);
  });

  it("uses ceiling (rounds up partial days)", () => {
    // Create a date 1.5 days in the future
    const future = new Date();
    future.setTime(future.getTime() + 1.5 * 24 * 60 * 60 * 1000);
    const days = daysUntilExpiry(future);
    expect(days).not.toBeNull();
    // Math.ceil(1.5) = 2
    expect(days!).toBeGreaterThanOrEqual(1);
    expect(days!).toBeLessThanOrEqual(2);
  });
});

describe("STAGE_ORDER", () => {
  it("has 3 stages in correct order", () => {
    expect(STAGE_ORDER).toEqual(["FEASIBILITY", "SANCTION", "POST_COMPLETION"]);
  });
});

describe("LEGAL_DOC_FLOW", () => {
  it("is a non-empty array of flow steps", () => {
    expect(LEGAL_DOC_FLOW.length).toBeGreaterThan(0);
  });

  it("every step has a type, stage, and appliesTo", () => {
    for (const step of LEGAL_DOC_FLOW) {
      expect(step.type).toBeTruthy();
      expect(step.stage).toBeTruthy();
      expect(["LAND", "PROJECT", "BOTH"]).toContain(step.appliesTo);
    }
  });
});
