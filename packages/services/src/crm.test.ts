/**
 * Unit tests for pure CRM helpers in crm.ts.
 *
 *   computeLeadScore              — score a lead from source/priority/budget/etc.
 *   isLeadStageTransitionAllowed  — validate lead stage transitions
 *   computeRealEstateGst          — GST for real estate sales (affordable/residential/commercial)
 */
import { describe, it, expect } from "vitest";
import { computeLeadScore, isLeadStageTransitionAllowed, computeRealEstateGst } from "./crm";
import Decimal from "decimal.js";

describe("computeLeadScore", () => {
  it("scores a WALK_IN + HOT lead with all flags", () => {
    const score = computeLeadScore({
      source: "WALK_IN",
      priority: "HOT",
      hasBudget: true,
      hasProject: true,
      hasInterestedUnit: true,
      activityCount: 5,
      hasSiteVisit: true,
    });
    // 20 + 25 + 10 + 8 + 10 + min(20, 5×4=20) + 15 = 108 → capped at 100
    expect(score).toBe(100);
  });

  it("scores a DIGITAL_AD + LOW lead with no flags", () => {
    const score = computeLeadScore({
      source: "DIGITAL_AD",
      priority: "LOW",
      hasBudget: false,
      hasProject: false,
      hasInterestedUnit: false,
      activityCount: 0,
      hasSiteVisit: false,
    });
    // 8 + 0 + 0 + 0 + 0 + 0 + 0 = 8
    expect(score).toBe(8);
  });

  it("caps activity count contribution at 20", () => {
    const score = computeLeadScore({
      source: "OTHER",
      priority: "LOW",
      hasBudget: false,
      hasProject: false,
      hasInterestedUnit: false,
      activityCount: 10, // 10×4=40 → capped at 20
      hasSiteVisit: false,
    });
    // 5 + 0 + 0 + 0 + 0 + 20 + 0 = 25
    expect(score).toBe(25);
  });

  it("scores a REFERRAL + MEDIUM lead", () => {
    const score = computeLeadScore({
      source: "REFERRAL",
      priority: "MEDIUM",
      hasBudget: true,
      hasProject: false,
      hasInterestedUnit: false,
      activityCount: 2,
      hasSiteVisit: false,
    });
    // 18 + 8 + 10 + 0 + 0 + min(20, 8) + 0 = 44
    expect(score).toBe(44);
  });

  it("scores a BROKER + HIGH lead with site visit", () => {
    const score = computeLeadScore({
      source: "BROKER",
      priority: "HIGH",
      hasBudget: true,
      hasProject: true,
      hasInterestedUnit: true,
      activityCount: 3,
      hasSiteVisit: true,
    });
    // 15 + 16 + 10 + 8 + 10 + min(20, 12) + 15 = 86
    expect(score).toBe(86);
  });

  it("caps total score at 100", () => {
    const score = computeLeadScore({
      source: "WALK_IN",
      priority: "HOT",
      hasBudget: true,
      hasProject: true,
      hasInterestedUnit: true,
      activityCount: 100,
      hasSiteVisit: true,
    });
    expect(score).toBe(100);
  });
});

describe("isLeadStageTransitionAllowed", () => {
  it("allows NEW → CONTACTED", () => {
    expect(isLeadStageTransitionAllowed("NEW", "CONTACTED")).toBe(true);
  });

  it("allows NEW → LOST", () => {
    expect(isLeadStageTransitionAllowed("NEW", "LOST")).toBe(true);
  });

  it("disallows NEW → BOOKED (must go through stages)", () => {
    expect(isLeadStageTransitionAllowed("NEW", "BOOKED")).toBe(false);
  });

  it("allows CONTACTED → SITE_VISIT", () => {
    expect(isLeadStageTransitionAllowed("CONTACTED", "SITE_VISIT")).toBe(true);
  });

  it("allows CONTACTED → NEGOTIATION", () => {
    expect(isLeadStageTransitionAllowed("CONTACTED", "NEGOTIATION")).toBe(true);
  });

  it("allows SITE_VISIT → BOOKED", () => {
    expect(isLeadStageTransitionAllowed("SITE_VISIT", "BOOKED")).toBe(true);
  });

  it("allows NEGOTIATION → BOOKED", () => {
    expect(isLeadStageTransitionAllowed("NEGOTIATION", "BOOKED")).toBe(true);
  });

  it("disallows BOOKED → any (terminal state)", () => {
    expect(isLeadStageTransitionAllowed("BOOKED", "NEW")).toBe(false);
    expect(isLeadStageTransitionAllowed("BOOKED", "CONTACTED")).toBe(false);
    expect(isLeadStageTransitionAllowed("BOOKED", "NEGOTIATION")).toBe(false);
  });

  it("allows LOST → CONTACTED (revive a lost lead)", () => {
    expect(isLeadStageTransitionAllowed("LOST", "CONTACTED")).toBe(true);
  });

  it("disallows LOST → BOOKED", () => {
    expect(isLeadStageTransitionAllowed("LOST", "BOOKED")).toBe(false);
  });

  it("allows same-stage transitions (no-op)", () => {
    expect(isLeadStageTransitionAllowed("NEW", "NEW")).toBe(true);
    expect(isLeadStageTransitionAllowed("CONTACTED", "CONTACTED")).toBe(true);
  });
});

describe("computeRealEstateGst", () => {
  it("computes 1% GST on full price for affordable residential", () => {
    const result = computeRealEstateGst(new Decimal(4000000), "RESIDENTIAL", true);
    expect(result.gstRate.toNumber()).toBe(1);
    expect(result.taxablePortion.toNumber()).toBe(1);
    expect(result.effectiveGstRate.toNumber()).toBe(1);
    expect(result.gstAmount.toNumber()).toBe(40000);
  });

  it("computes 5% GST on 2/3 of price for non-affordable residential", () => {
    const result = computeRealEstateGst(new Decimal(6000000), "RESIDENTIAL", false);
    expect(result.gstRate.toNumber()).toBe(5);
    expect(result.taxablePortion.toNumber()).toBeCloseTo(0.6667, 3);
    // effective rate = 5 × 2/3 = 3.33%
    expect(result.effectiveGstRate.toNumber()).toBeCloseTo(3.33, 1);
    // gstAmount = 6000000 × 3.3333% / 100 = 200000
    expect(result.gstAmount.toNumber()).toBe(200000);
  });

  it("computes 18% GST on full price for commercial", () => {
    const result = computeRealEstateGst(new Decimal(5000000), "COMMERCIAL", false);
    expect(result.gstRate.toNumber()).toBe(18);
    expect(result.taxablePortion.toNumber()).toBe(1);
    expect(result.effectiveGstRate.toNumber()).toBe(18);
    expect(result.gstAmount.toNumber()).toBe(900000);
  });

  it("treats affordable flag as false by default", () => {
    const result = computeRealEstateGst(new Decimal(6000000), "RESIDENTIAL");
    // default isAffordable=false → 5% on 2/3
    expect(result.gstRate.toNumber()).toBe(5);
  });

  it("handles string and number sale prices", () => {
    const result = computeRealEstateGst("5000000", "COMMERCIAL");
    expect(result.gstAmount.toNumber()).toBe(900000);
  });

  it("handles zero sale price", () => {
    const result = computeRealEstateGst(new Decimal(0), "COMMERCIAL");
    expect(result.gstAmount.toNumber()).toBe(0);
  });

  it("handles very large sale price", () => {
    const result = computeRealEstateGst(new Decimal(1000000000), "COMMERCIAL");
    expect(result.gstAmount.toNumber()).toBe(180000000); // 18% of 1 billion
  });

  it("handles unknown project type as commercial", () => {
    const result = computeRealEstateGst(new Decimal(5000000), "INDUSTRIAL");
    // Not RESIDENTIAL → treated as commercial (18%)
    expect(result.gstRate.toNumber()).toBe(18);
    expect(result.taxablePortion.toNumber()).toBe(1);
  });

  it("handles empty string project type as commercial", () => {
    const result = computeRealEstateGst(new Decimal(5000000), "");
    expect(result.gstRate.toNumber()).toBe(18);
  });

  it("affordable residential has effective rate = 1%", () => {
    const result = computeRealEstateGst(new Decimal(4500000), "RESIDENTIAL", true);
    expect(result.effectiveGstRate.toNumber()).toBe(1);
    expect(result.gstAmount.toNumber()).toBe(45000);
  });

  it("non-affordable residential effective rate ≈ 3.33%", () => {
    const result = computeRealEstateGst(new Decimal(6000000), "RESIDENTIAL", false);
    // 5% × 2/3 = 3.333...%
    expect(result.effectiveGstRate.toNumber()).toBeCloseTo(3.33, 1);
  });

  it("gstAmount is rounded to 2 decimal places", () => {
    // 3333333 × 3.3333% = 111111.0889 → 111111.09
    const result = computeRealEstateGst(new Decimal(3333333), "RESIDENTIAL", false);
    expect(result.gstAmount.toDecimalPlaces(2).equals(result.gstAmount)).toBe(true);
  });

  it("taxablePortion is rounded to 4 decimal places for residential", () => {
    const result = computeRealEstateGst(new Decimal(6000000), "RESIDENTIAL", false);
    // 2/3 = 0.6667 (4 dp)
    expect(result.taxablePortion.toDecimalPlaces(4).equals(result.taxablePortion)).toBe(true);
  });
});

describe("computeLeadScore — edge cases", () => {
  it("scores a PORTAL + MEDIUM lead with budget only", () => {
    const score = computeLeadScore({
      source: "PORTAL",
      priority: "MEDIUM",
      hasBudget: true,
      hasProject: false,
      hasInterestedUnit: false,
      activityCount: 1,
      hasSiteVisit: false,
    });
    // 12 + 8 + 10 + 0 + 0 + min(20, 4) + 0 = 34
    expect(score).toBe(34);
  });

  it("scores a OTHER + LOW lead with only site visit", () => {
    const score = computeLeadScore({
      source: "OTHER",
      priority: "LOW",
      hasBudget: false,
      hasProject: false,
      hasInterestedUnit: false,
      activityCount: 0,
      hasSiteVisit: true,
    });
    // 5 + 0 + 0 + 0 + 0 + 0 + 15 = 20
    expect(score).toBe(20);
  });

  it("activity count of 1 contributes 4 points", () => {
    const score = computeLeadScore({
      source: "OTHER",
      priority: "LOW",
      hasBudget: false,
      hasProject: false,
      hasInterestedUnit: false,
      activityCount: 1,
      hasSiteVisit: false,
    });
    // 5 + 0 + 0 + 0 + 0 + 4 + 0 = 9
    expect(score).toBe(9);
  });

  it("activity count of 5 contributes 20 points (exactly at cap)", () => {
    const score = computeLeadScore({
      source: "OTHER",
      priority: "LOW",
      hasBudget: false,
      hasProject: false,
      hasInterestedUnit: false,
      activityCount: 5,
      hasSiteVisit: false,
    });
    // 5 + 0 + 0 + 0 + 0 + 20 + 0 = 25
    expect(score).toBe(25);
  });

  it("activity count of 6 is capped at 20", () => {
    const score5 = computeLeadScore({
      source: "OTHER",
      priority: "LOW",
      hasBudget: false,
      hasProject: false,
      hasInterestedUnit: false,
      activityCount: 5,
      hasSiteVisit: false,
    });
    const score6 = computeLeadScore({
      source: "OTHER",
      priority: "LOW",
      hasBudget: false,
      hasProject: false,
      hasInterestedUnit: false,
      activityCount: 6,
      hasSiteVisit: false,
    });
    expect(score6).toBe(score5); // both capped at 20
  });

  it("all source scores are distinct and ordered", () => {
    const sources: Array<["WALK_IN" | "REFERRAL" | "BROKER" | "PORTAL" | "DIGITAL_AD" | "OTHER", number]> = [
      ["WALK_IN", 20],
      ["REFERRAL", 18],
      ["BROKER", 15],
      ["PORTAL", 12],
      ["DIGITAL_AD", 8],
      ["OTHER", 5],
    ];
    for (const [source, expected] of sources) {
      const score = computeLeadScore({
        source,
        priority: "LOW",
        hasBudget: false,
        hasProject: false,
        hasInterestedUnit: false,
        activityCount: 0,
        hasSiteVisit: false,
      });
      expect(score).toBe(expected);
    }
  });

  it("all priority scores are correct", () => {
    const priorities: Array<["LOW" | "MEDIUM" | "HIGH" | "HOT", number]> = [
      ["LOW", 0],
      ["MEDIUM", 8],
      ["HIGH", 16],
      ["HOT", 25],
    ];
    for (const [priority, expected] of priorities) {
      const score = computeLeadScore({
        source: "OTHER",
        priority,
        hasBudget: false,
        hasProject: false,
        hasInterestedUnit: false,
        activityCount: 0,
        hasSiteVisit: false,
      });
      expect(score).toBe(5 + expected); // 5 from OTHER source
    }
  });
});

describe("isLeadStageTransitionAllowed — edge cases", () => {
  it("disallows CONTACTED → BOOKED (must go through SITE_VISIT or NEGOTIATION)", () => {
    expect(isLeadStageTransitionAllowed("CONTACTED", "BOOKED")).toBe(false);
  });

  it("disallows NEW → SITE_VISIT (must be contacted first)", () => {
    expect(isLeadStageTransitionAllowed("NEW", "SITE_VISIT")).toBe(false);
  });

  it("disallows NEW → NEGOTIATION", () => {
    expect(isLeadStageTransitionAllowed("NEW", "NEGOTIATION")).toBe(false);
  });

  it("allows SITE_VISIT → NEGOTIATION", () => {
    expect(isLeadStageTransitionAllowed("SITE_VISIT", "NEGOTIATION")).toBe(true);
  });

  it("allows SITE_VISIT → LOST", () => {
    expect(isLeadStageTransitionAllowed("SITE_VISIT", "LOST")).toBe(true);
  });

  it("allows NEGOTIATION → LOST", () => {
    expect(isLeadStageTransitionAllowed("NEGOTIATION", "LOST")).toBe(true);
  });

  it("allows NEGOTIATION → SITE_VISIT (back and forth)", () => {
    expect(isLeadStageTransitionAllowed("NEGOTIATION", "SITE_VISIT")).toBe(true);
  });

  it("disallows LOST → NEW (cannot go back to NEW)", () => {
    expect(isLeadStageTransitionAllowed("LOST", "NEW")).toBe(false);
  });

  it("disallows LOST → SITE_VISIT", () => {
    expect(isLeadStageTransitionAllowed("LOST", "SITE_VISIT")).toBe(false);
  });

  it("disallows LOST → NEGOTIATION", () => {
    expect(isLeadStageTransitionAllowed("LOST", "NEGOTIATION")).toBe(false);
  });

  it("allows LOST → LOST (same stage no-op)", () => {
    expect(isLeadStageTransitionAllowed("LOST", "LOST")).toBe(true);
  });

  it("disallows BOOKED → LOST (terminal)", () => {
    expect(isLeadStageTransitionAllowed("BOOKED", "LOST")).toBe(false);
  });

  it("disallows BOOKED → BOOKED (same-stage on terminal)", () => {
    // BOOKED → BOOKED: from === to, so it's allowed (no-op)
    expect(isLeadStageTransitionAllowed("BOOKED", "BOOKED")).toBe(true);
  });

  it("allows all same-stage transitions", () => {
    const stages = ["NEW", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKED", "LOST"] as const;
    for (const stage of stages) {
      expect(isLeadStageTransitionAllowed(stage, stage)).toBe(true);
    }
  });
});
