import { describe, expect, it } from "vitest";
import { computeLeadScore, isLeadStageTransitionAllowed } from "./crm";

describe("crm: computeLeadScore", () => {
  it("scores a complete walk-in lead higher than an incomplete digital lead", () => {
    const complete = computeLeadScore({
      source: "WALK_IN",
      priority: "HIGH",
      hasBudget: true,
      hasProject: true,
      hasInterestedUnit: true,
      activityCount: 2,
      hasSiteVisit: true,
    });
    const incomplete = computeLeadScore({
      source: "DIGITAL_AD",
      priority: "LOW",
      hasBudget: false,
      hasProject: false,
      hasInterestedUnit: false,
      activityCount: 0,
      hasSiteVisit: false,
    });

    expect(complete).toBeGreaterThan(incomplete);
  });

  it("caps the score at 100", () => {
    expect(computeLeadScore({
      source: "WALK_IN",
      priority: "HOT",
      hasBudget: true,
      hasProject: true,
      hasInterestedUnit: true,
      activityCount: 50,
      hasSiteVisit: true,
    })).toBe(100);
  });
});

describe("crm: lead stage transitions", () => {
  it("allows the normal qualification path", () => {
    expect(isLeadStageTransitionAllowed("NEW", "CONTACTED")).toBe(true);
    expect(isLeadStageTransitionAllowed("CONTACTED", "SITE_VISIT")).toBe(true);
    expect(isLeadStageTransitionAllowed("SITE_VISIT", "NEGOTIATION")).toBe(true);
    expect(isLeadStageTransitionAllowed("NEGOTIATION", "BOOKED")).toBe(true);
  });

  it("prevents skipping directly from new to booked", () => {
    expect(isLeadStageTransitionAllowed("NEW", "BOOKED")).toBe(false);
  });

  it("allows a lost lead to be reopened", () => {
    expect(isLeadStageTransitionAllowed("LOST", "CONTACTED")).toBe(true);
  });

  it("keeps booked leads terminal", () => {
    expect(isLeadStageTransitionAllowed("BOOKED", "NEGOTIATION")).toBe(false);
  });
});
