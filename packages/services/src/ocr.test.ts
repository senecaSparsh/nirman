/**
 * Unit tests for the pure OCR parsing functions in ocr.ts.
 *
 *   parseDprOcrJson    — parse structured JSON from OpenAI vision OCR
 *   parseDprFromRawText — parse raw text from Google Vision / Azure DI
 *
 * No DB, no mocking — pure functions.
 */
import { describe, it, expect } from "vitest";
import { parseDprOcrJson, parseDprFromRawText } from "./ocr";

describe("parseDprOcrJson", () => {
  it("parses valid JSON with all fields", () => {
    const json = JSON.stringify({
      workType: "Foundation",
      workQty: 50,
      workUnit: "cum",
      materials: [
        { materialName: "Cement", quantity: 100, unit: "bag" },
        { materialName: "Steel", quantity: 2.5, unit: "ton" },
      ],
      labor: [
        { trade: "Mason", count: 5, overtimeHours: 2 },
        { trade: "Helper", count: 10 },
      ],
      progressPercent: 45,
      notes: "Work progressing well",
    });
    const result = parseDprOcrJson(json);
    expect(result.workType).toBe("Foundation");
    expect(result.workQty).toBe(50);
    expect(result.workUnit).toBe("cum");
    expect(result.materials).toHaveLength(2);
    expect(result.materials[0]!.materialName).toBe("Cement");
    expect(result.materials[0]!.quantity).toBe(100);
    expect(result.labor).toHaveLength(2);
    expect(result.labor[0]!.trade).toBe("Mason");
    expect(result.labor[0]!.count).toBe(5);
    expect(result.labor[0]!.overtimeHours).toBe(2);
    expect(result.progressPercent).toBe(45);
    expect(result.notes).toBe("Work progressing well");
    expect(result.confidence).toBe(0.85);
  });

  it("handles JSON with missing fields (defaults to undefined/empty)", () => {
    const json = JSON.stringify({ workType: "RCC" });
    const result = parseDprOcrJson(json);
    expect(result.workType).toBe("RCC");
    expect(result.workQty).toBeUndefined();
    expect(result.materials).toEqual([]);
    expect(result.labor).toEqual([]);
    expect(result.progressPercent).toBeUndefined();
  });

  it("handles empty JSON object", () => {
    const result = parseDprOcrJson("{}");
    expect(result.materials).toEqual([]);
    expect(result.labor).toEqual([]);
    expect(result.confidence).toBe(0.85);
  });

  it("falls back to raw text parsing for invalid JSON", () => {
    const result = parseDprOcrJson("not valid json");
    // Should fall back to parseDprFromRawText
    expect(result.confidence).toBe(0.6);
  });

  it("handles materials with missing fields (defaults)", () => {
    const json = JSON.stringify({
      materials: [{ materialName: "Cement" }], // missing quantity and unit
    });
    const result = parseDprOcrJson(json);
    expect(result.materials[0]!.materialName).toBe("Cement");
    expect(result.materials[0]!.quantity).toBe(0);
    expect(result.materials[0]!.unit).toBe("");
  });

  it("handles non-array materials gracefully", () => {
    const json = JSON.stringify({ materials: "not an array" });
    const result = parseDprOcrJson(json);
    expect(result.materials).toEqual([]);
  });
});

describe("parseDprFromRawText", () => {
  it("extracts work type from 'Work: Foundation'", () => {
    const result = parseDprFromRawText("Work: Foundation\nCement: 50 bag");
    // Note: the parser lowercases the line before regex matching,
    // so the captured value is lowercase
    expect(result.workType).toBe("foundation");
  });

  it("extracts work type from 'Work Type: RCC'", () => {
    const result = parseDprFromRawText("Work Type: RCC");
    expect(result.workType).toBe("rcc");
  });

  it("extracts work type from 'Scope: Excavation'", () => {
    const result = parseDprFromRawText("Scope: Excavation");
    expect(result.workType).toBe("excavation");
  });

  it("extracts progress percentage", () => {
    const result = parseDprFromRawText("Progress: 45%");
    expect(result.progressPercent).toBe(45);
  });

  it("extracts progress without % sign", () => {
    const result = parseDprFromRawText("Progress: 30");
    expect(result.progressPercent).toBe(30);
  });

  it("extracts materials with quantities", () => {
    const text = "Cement: 50 bag\nSteel: 2.5 ton";
    const result = parseDprFromRawText(text);
    expect(result.materials.length).toBeGreaterThanOrEqual(2);
    const cement = result.materials.find((m) => m.materialName === "Cement");
    expect(cement).toBeDefined();
    expect(cement!.quantity).toBe(50);
    expect(cement!.unit).toBe("bag");
  });

  it("extracts labor counts", () => {
    const text = "Mason: 5\nLabour: 10\nCarpenter: 3";
    const result = parseDprFromRawText(text);
    expect(result.labor.length).toBeGreaterThanOrEqual(3);
    const mason = result.labor.find((l) => l.trade === "Mason");
    expect(mason).toBeDefined();
    expect(mason!.count).toBe(5);
  });

  it("sets confidence to 0.6 for raw text parsing", () => {
    const result = parseDprFromRawText("Work: Test");
    expect(result.confidence).toBe(0.6);
  });

  it("preserves raw text in result", () => {
    const text = "Work: Foundation\nCement: 50 bag";
    const result = parseDprFromRawText(text);
    expect(result.rawText).toBe(text);
  });

  it("handles empty text", () => {
    const result = parseDprFromRawText("");
    expect(result.materials).toEqual([]);
    expect(result.labor).toEqual([]);
  });

  it("handles text with no recognizable patterns", () => {
    const result = parseDprFromRawText("Some random text\nwith no patterns");
    expect(result.workType).toBeUndefined();
    expect(result.progressPercent).toBeUndefined();
    expect(result.materials).toEqual([]);
    expect(result.labor).toEqual([]);
  });

  it("handles various material units", () => {
    const text = "Cement: 100 kg\nSand: 5 cft\nPaint: 2 litre";
    const result = parseDprFromRawText(text);
    expect(result.materials.length).toBeGreaterThanOrEqual(2);
  });
});
