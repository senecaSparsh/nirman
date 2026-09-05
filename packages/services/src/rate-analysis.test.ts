/**
 * Unit tests for the pure function `computeRateAnalysis()` in rate-analysis.ts.
 *
 * Rate analysis breaks a BOQ line's rate into components:
 *   MATERIAL  — qty × rate × (1 + wastage%)
 *   LABOUR    — qty × rate
 *   EQUIPMENT — qty × rate
 *   OVERHEAD  — % of directSubtotal (material + labour + equipment)
 *   PROFIT    — % of (directSubtotal + overheadSubtotal)
 *   OTHER     — qty × rate OR % of (direct + overhead + profit + other)
 *
 * totalRate = directSubtotal + overheadSubtotal + profitSubtotal + otherSubtotal
 *
 * No DB, no mocking — pure function.
 */
import { describe, it, expect } from "vitest";
import { computeRateAnalysis, type RateAnalysisLineInput } from "./rate-analysis";
import Decimal from "decimal.js";

describe("computeRateAnalysis", () => {
  it("computes a simple material-only rate", () => {
    const lines: RateAnalysisLineInput[] = [
      { componentType: "MATERIAL", description: "Cement", quantity: 1, rate: 300, unit: "bag" },
    ];
    const result = computeRateAnalysis(lines);
    expect(result.materialSubtotal.toNumber()).toBe(300);
    expect(result.directSubtotal.toNumber()).toBe(300);
    expect(result.totalRate.toNumber()).toBe(300);
  });

  it("computes material + labour + equipment (direct subtotal)", () => {
    const lines: RateAnalysisLineInput[] = [
      { componentType: "MATERIAL", description: "Cement", quantity: 2, rate: 300 },
      { componentType: "LABOUR", description: "Mason", quantity: 1, rate: 500 },
      { componentType: "EQUIPMENT", description: "Mixer", quantity: 1, rate: 200 },
    ];
    const result = computeRateAnalysis(lines);
    expect(result.materialSubtotal.toNumber()).toBe(600);
    expect(result.labourSubtotal.toNumber()).toBe(500);
    expect(result.equipmentSubtotal.toNumber()).toBe(200);
    expect(result.directSubtotal.toNumber()).toBe(1300);
    expect(result.totalRate.toNumber()).toBe(1300);
  });

  it("applies wastage percentage to material lines only", () => {
    const lines: RateAnalysisLineInput[] = [
      { componentType: "MATERIAL", description: "Cement", quantity: 100, rate: 10 },
      { componentType: "LABOUR", description: "Mason", quantity: 1, rate: 500 },
    ];
    const result = computeRateAnalysis(lines, 5); // 5% wastage
    // Material: 100 × 10 × 1.05 = 1050
    expect(result.materialSubtotal.toNumber()).toBe(1050);
    // Labour unaffected by wastage
    expect(result.labourSubtotal.toNumber()).toBe(500);
    expect(result.directSubtotal.toNumber()).toBe(1550);
  });

  it("computes overhead as percentage of direct subtotal", () => {
    const lines: RateAnalysisLineInput[] = [
      { componentType: "MATERIAL", description: "Cement", quantity: 1, rate: 1000 },
      { componentType: "OVERHEAD", description: "Site overhead", percentage: 10 },
    ];
    const result = computeRateAnalysis(lines);
    // Direct = 1000, Overhead = 10% of 1000 = 100
    expect(result.directSubtotal.toNumber()).toBe(1000);
    expect(result.overheadSubtotal.toNumber()).toBe(100);
    expect(result.totalRate.toNumber()).toBe(1100);
  });

  it("computes profit as percentage of (direct + overhead)", () => {
    const lines: RateAnalysisLineInput[] = [
      { componentType: "MATERIAL", description: "Cement", quantity: 1, rate: 1000 },
      { componentType: "OVERHEAD", description: "Overhead", percentage: 10 },
      { componentType: "PROFIT", description: "Profit", percentage: 10 },
    ];
    const result = computeRateAnalysis(lines);
    // Direct = 1000, Overhead = 100, Profit = 10% of 1100 = 110
    expect(result.profitSubtotal.toNumber()).toBe(110);
    expect(result.totalRate.toNumber()).toBe(1210);
  });

  it("computes OTHER lines on QUANTITY basis", () => {
    const lines: RateAnalysisLineInput[] = [
      { componentType: "MATERIAL", description: "Cement", quantity: 1, rate: 1000 },
      { componentType: "OTHER", description: "Transport", quantity: 2, rate: 50, basis: "QUANTITY" },
    ];
    const result = computeRateAnalysis(lines);
    // Other = 2 × 50 = 100
    expect(result.otherSubtotal.toNumber()).toBe(100);
    expect(result.totalRate.toNumber()).toBe(1100);
  });

  it("computes OTHER lines on PERCENTAGE basis", () => {
    const lines: RateAnalysisLineInput[] = [
      { componentType: "MATERIAL", description: "Cement", quantity: 1, rate: 1000 },
      { componentType: "OTHER", description: "Contingency", percentage: 5, basis: "PERCENTAGE" },
    ];
    const result = computeRateAnalysis(lines);
    // Other = 5% of (1000 + 0 + 0 + 0) = 50
    expect(result.otherSubtotal.toNumber()).toBe(50);
    expect(result.totalRate.toNumber()).toBe(1050);
  });

  it("computes full rate analysis with all component types", () => {
    const lines: RateAnalysisLineInput[] = [
      { componentType: "MATERIAL", description: "Cement", quantity: 2, rate: 300 },
      { componentType: "LABOUR", description: "Mason", quantity: 1, rate: 500 },
      { componentType: "EQUIPMENT", description: "Mixer", quantity: 1, rate: 200 },
      { componentType: "OVERHEAD", description: "Overhead", percentage: 10 },
      { componentType: "PROFIT", description: "Profit", percentage: 15 },
      { componentType: "OTHER", description: "Transport", quantity: 1, rate: 100, basis: "QUANTITY" },
    ];
    const result = computeRateAnalysis(lines);
    // Direct = 600 + 500 + 200 = 1300
    // Overhead = 10% of 1300 = 130
    // Profit = 15% of (1300 + 130) = 214.5
    // Other = 1 × 100 = 100
    // Total = 1300 + 130 + 214.5 + 100 = 1744.5
    expect(result.directSubtotal.toNumber()).toBe(1300);
    expect(result.overheadSubtotal.toNumber()).toBe(130);
    expect(result.profitSubtotal.toNumber()).toBe(214.5);
    expect(result.otherSubtotal.toNumber()).toBe(100);
    expect(result.totalRate.toNumber()).toBe(1744.5);
  });

  it("handles empty lines array (all zeros)", () => {
    const result = computeRateAnalysis([]);
    expect(result.materialSubtotal.toNumber()).toBe(0);
    expect(result.totalRate.toNumber()).toBe(0);
  });

  it("handles 0% wastage explicitly", () => {
    const lines: RateAnalysisLineInput[] = [
      { componentType: "MATERIAL", description: "Cement", quantity: 100, rate: 10 },
    ];
    const result = computeRateAnalysis(lines, 0);
    expect(result.materialSubtotal.toNumber()).toBe(1000);
  });

  it("preserves line order in computed output", () => {
    const lines: RateAnalysisLineInput[] = [
      { componentType: "MATERIAL", description: "Cement", quantity: 1, rate: 100 },
      { componentType: "LABOUR", description: "Mason", quantity: 1, rate: 200 },
      { componentType: "OVERHEAD", description: "OH", percentage: 10 },
    ];
    const result = computeRateAnalysis(lines);
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]!.componentType).toBe("MATERIAL");
    expect(result.lines[1]!.componentType).toBe("LABOUR");
    expect(result.lines[2]!.componentType).toBe("OVERHEAD");
  });
});
