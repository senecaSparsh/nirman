/**
 * Unit tests for the pure helper `amountInWords()` in issue.ts.
 *
 * Converts a numeric amount into Indian-system English words
 * (Crore, Lakh, Thousand, Hundred) with "Rupees ... Only" wrapping.
 *
 * No DB, no mocking — pure function.
 */
import { describe, it, expect } from "vitest";
import { amountInWords } from "./issue";

describe("amountInWords", () => {
  it("returns 'Zero' for 0", () => {
    expect(amountInWords(0)).toBe("Zero");
  });

  it("returns 'Zero' for NaN", () => {
    expect(amountInWords(NaN)).toBe("Zero");
  });

  it("handles single digits", () => {
    expect(amountInWords(5)).toBe("Rupees Five Only");
  });

  it("handles teens", () => {
    expect(amountInWords(15)).toBe("Rupees Fifteen Only");
  });

  it("handles tens", () => {
    expect(amountInWords(20)).toBe("Rupees Twenty Only");
    expect(amountInWords(25)).toBe("Rupees Twenty Five Only");
  });

  it("handles hundreds", () => {
    expect(amountInWords(100)).toBe("Rupees One Hundred Only");
    expect(amountInWords(250)).toBe("Rupees Two Hundred Fifty Only");
    expect(amountInWords(999)).toBe("Rupees Nine Hundred Ninety Nine Only");
  });

  it("handles thousands", () => {
    expect(amountInWords(1000)).toBe("Rupees One Thousand Only");
    expect(amountInWords(25000)).toBe("Rupees Twenty Five Thousand Only");
    expect(amountInWords(99999)).toBe("Rupees Ninety Nine Thousand Nine Hundred Ninety Nine Only");
  });

  it("handles lakhs (10^5)", () => {
    expect(amountInWords(100000)).toBe("Rupees One Lakh Only");
    expect(amountInWords(1500000)).toBe("Rupees Fifteen Lakh Only");
    expect(amountInWords(9999999)).toContain("Lakh");
  });

  it("handles crores (10^7)", () => {
    expect(amountInWords(10000000)).toBe("Rupees One Crore Only");
    expect(amountInWords(150000000)).toBe("Rupees Fifteen Crore Only");
    expect(amountInWords(1000000000)).toBe("Rupees One Hundred Crore Only");
  });

  it("handles mixed crore + lakh + thousand + hundred", () => {
    const result = amountInWords(12345678);
    expect(result).toContain("Crore");
    expect(result).toContain("Lakh");
    expect(result).toContain("Thousand");
    expect(result).toContain("Hundred");
  });

  it("handles paise (decimal portion)", () => {
    const result = amountInWords(100.5);
    expect(result).toContain("and");
    expect(result).toContain("Paise");
  });

  it("handles negative amounts", () => {
    const result = amountInWords(-100);
    expect(result).toContain("Minus");
    expect(result).toContain("Hundred");
  });

  it("accepts string input", () => {
    expect(amountInWords("1000")).toBe("Rupees One Thousand Only");
    expect(amountInWords("0")).toBe("Zero");
  });

  it("accepts Decimal-like string with decimals", () => {
    const result = amountInWords("1234.56");
    expect(result).toContain("Thousand");
    expect(result).toContain("Paise");
  });
});
