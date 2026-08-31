import { describe, it, expect } from "vitest";
import { StubOcrProvider } from "./ocr";

describe("OCR Service (M19 — Photo-driven DPR)", () => {
  describe("StubOcrProvider", () => {
    const provider = new StubOcrProvider();

    it("returns empty result without calling any API", async () => {
      const result = await provider.extractDpr({ base64: "fake-base64" });
      expect(result.materials).toEqual([]);
      expect(result.labor).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    it("returns empty result for URL input", async () => {
      const result = await provider.extractDpr({ url: "https://example.com/dpr.jpg" });
      expect(result.materials).toEqual([]);
      expect(result.labor).toEqual([]);
    });
  });
});
