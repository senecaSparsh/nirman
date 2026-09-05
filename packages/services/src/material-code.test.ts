/**
 * Unit tests for the pure material code helpers in material-code.ts.
 *
 *   categoryPrefix    — derive a 3-letter prefix from category name
 *   sanitizeGrade     — clean grade string (alphanumeric only, uppercase)
 *   previewMaterialCode — show what code WOULD be generated (without creating)
 */
import { describe, it, expect } from "vitest";
import { categoryPrefix, sanitizeGrade, previewMaterialCode } from "./material-code";

describe("categoryPrefix", () => {
  it("returns STL for steel-related categories", () => {
    expect(categoryPrefix("Steel")).toBe("STL");
    expect(categoryPrefix("Structural Steel")).toBe("STL");
    // Note: "Reinforcement" contains substring "cement" (reinfor-cement)
    // which matches CEM before reaching "reinforcement" → STL. This is a
    // known quirk of the substring matching approach.
    expect(categoryPrefix("Reinforcement Steel")).toBe("STL"); // "steel" matches first
  });

  it("returns CEM for cement categories", () => {
    expect(categoryPrefix("Cement")).toBe("CEM");
    expect(categoryPrefix("Portland Cement")).toBe("CEM");
  });

  it("returns AGG for aggregate categories", () => {
    expect(categoryPrefix("Aggregate")).toBe("AGG");
    expect(categoryPrefix("Coarse Aggregate")).toBe("AGG");
  });

  it("returns SND for sand categories", () => {
    expect(categoryPrefix("Sand")).toBe("SND");
    expect(categoryPrefix("River Sand")).toBe("SND");
  });

  it("returns BRK for brick categories", () => {
    expect(categoryPrefix("Brick")).toBe("BRK");
    expect(categoryPrefix("Fly Ash Bricks")).toBe("BRK");
  });

  it("returns TMB for timber/wood categories", () => {
    expect(categoryPrefix("Timber")).toBe("TMB");
    expect(categoryPrefix("Wood")).toBe("TMB");
  });

  it("returns HDW for hardware categories", () => {
    expect(categoryPrefix("Hardware")).toBe("HDW");
  });

  it("returns ELC for electrical categories", () => {
    expect(categoryPrefix("Electrical")).toBe("ELC");
  });

  it("returns PLB for plumbing categories", () => {
    expect(categoryPrefix("Plumbing")).toBe("PLB");
  });

  it("falls back to first 3 alpha chars for unknown categories", () => {
    expect(categoryPrefix("Custom")).toBe("CUS");
    expect(categoryPrefix("Roofing Material")).toBe("ROF"); // "roofing" is known
  });

  it("handles category with numbers and special chars", () => {
    // "Cat 123" → alpha = "cat" → "CAT"
    expect(categoryPrefix("Cat 123")).toBe("CAT");
  });

  it("handles short category names (pads with X)", () => {
    // "AB" → alpha = "ab" → padded to "abx" → "ABX"
    expect(categoryPrefix("AB")).toBe("ABX");
  });

  it("handles empty category name", () => {
    expect(categoryPrefix("")).toBe("XXX");
  });

  it("is case-insensitive", () => {
    expect(categoryPrefix("STEEL")).toBe("STL");
    expect(categoryPrefix("steel")).toBe("STL");
    expect(categoryPrefix("StEeL")).toBe("STL");
  });
});

describe("sanitizeGrade", () => {
  it("returns empty string for null/undefined", () => {
    expect(sanitizeGrade(null)).toBe("");
    expect(sanitizeGrade(undefined)).toBe("");
    expect(sanitizeGrade("")).toBe("");
  });

  it("removes non-alphanumeric characters", () => {
    expect(sanitizeGrade("Fe 500 D")).toBe("FE500D");
    expect(sanitizeGrade("OPC-53")).toBe("OPC53");
    expect(sanitizeGrade("Grade A+")).toBe("GRADEA");
  });

  it("converts to uppercase", () => {
    expect(sanitizeGrade("fe500d")).toBe("FE500D");
    expect(sanitizeGrade("opc53")).toBe("OPC53");
  });

  it("trims whitespace", () => {
    expect(sanitizeGrade("  Fe500  ")).toBe("FE500");
  });

  it("handles special characters only", () => {
    expect(sanitizeGrade("@#$%")).toBe("");
  });

  it("preserves numbers", () => {
    expect(sanitizeGrade("20mm")).toBe("20MM");
    expect(sanitizeGrade("Grade 53")).toBe("GRADE53");
  });
});

describe("previewMaterialCode", () => {
  it("previews code with grade", () => {
    expect(previewMaterialCode("Steel", "Fe500D")).toBe("STL-FE500D-???");
  });

  it("previews code without grade", () => {
    expect(previewMaterialCode("Cement", null)).toBe("CEM-???");
    expect(previewMaterialCode("Cement", undefined)).toBe("CEM-???");
    expect(previewMaterialCode("Cement", "")).toBe("CEM-???");
  });

  it("previews code with sanitized grade", () => {
    // "OPC 53" → sanitized to "OPC53"
    expect(previewMaterialCode("Cement", "OPC 53")).toBe("CEM-OPC53-???");
  });

  it("previews code for unknown category", () => {
    expect(previewMaterialCode("Custom Category", "A1")).toBe("CUS-A1-???");
  });
});
