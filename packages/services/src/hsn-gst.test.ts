/**
 * Unit tests for the pure HSN helpers.
 *
 *   scoreHsnDescription  — score an HSN description against search words
 *   extractSearchWords   — extract ≥3-char words from a query string
 */
import { describe, it, expect } from "vitest";
import { scoreHsnDescription, extractSearchWords } from "./hsn-gst";

describe("scoreHsnDescription", () => {
  it("scores +10 for each included word", () => {
    expect(scoreHsnDescription("TMT steel bars", ["steel"])).toBe(10);
    expect(scoreHsnDescription("TMT steel bars", ["steel", "bars"])).toBe(20);
  });

  it("scores +5 additional for startsWith match", () => {
    // "steel" is included (+10) AND description starts with "steel" (+5)
    expect(scoreHsnDescription("steel TMT bars", ["steel"])).toBe(15);
  });

  it("scores 0 when no words match", () => {
    expect(scoreHsnDescription("cement concrete", ["steel"])).toBe(0);
  });

  it("is case-insensitive (lowercases description)", () => {
    expect(scoreHsnDescription("TMT STEEL BARS", ["steel"])).toBe(10);
  });

  it("handles empty words array", () => {
    expect(scoreHsnDescription("steel bars", [])).toBe(0);
  });

  it("handles word that is included but not starts-with", () => {
    // "bars" is included but description starts with "TMT"
    expect(scoreHsnDescription("TMT steel bars", ["bars"])).toBe(10);
  });

  it("handles multiple words with mixed matches", () => {
    // "steel" → included (+10), not starts-with
    // "tmt" → included (+10) AND starts-with (+5) = 15
    expect(scoreHsnDescription("TMT steel bars", ["steel", "tmt"])).toBe(25);
  });
});

describe("extractSearchWords", () => {
  it("extracts words with ≥3 chars", () => {
    expect(extractSearchWords("TMT steel bars")).toEqual(["tmt", "steel", "bars"]);
  });

  it("filters out words shorter than 3 chars", () => {
    expect(extractSearchWords("TMT steel 2 bars")).toEqual(["tmt", "steel", "bars"]);
  });

  it("returns empty for empty string", () => {
    expect(extractSearchWords("")).toEqual([]);
  });

  it("returns empty for whitespace-only string", () => {
    expect(extractSearchWords("   ")).toEqual([]);
  });

  it("lowercases all words", () => {
    expect(extractSearchWords("STEEL BARS")).toEqual(["steel", "bars"]);
  });

  it("handles multiple spaces between words", () => {
    expect(extractSearchWords("steel    bars")).toEqual(["steel", "bars"]);
  });

  it("returns empty when all words are < 3 chars", () => {
    expect(extractSearchWords("a b c")).toEqual([]);
  });
});
