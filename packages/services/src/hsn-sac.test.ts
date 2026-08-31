import { describe, it, expect } from "vitest";
import {
  CbicHsnSacProvider,
  searchHsnSac,
} from "./hsn-sac";

describe("HSN/SAC Auto-Fetch (D24)", () => {
  const provider = new CbicHsnSacProvider();

  describe("CbicHsnSacProvider", () => {
    it("searches HSN codes by keyword (cement)", async () => {
      const results = await provider.searchHsn("cement");
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.type === "HSN")).toBe(true);
      const cement = results.find((r) => r.code === "2523");
      expect(cement).toBeDefined();
      expect(cement!.gstRate).toBe(28);
    });

    it("searches HSN codes by keyword (steel)", async () => {
      const results = await provider.searchHsn("steel");
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.type === "HSN")).toBe(true);
    });

    it("searches SAC codes by keyword (construction)", async () => {
      const results = await provider.searchSac("construction");
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.type === "SAC")).toBe(true);
      const construction = results.find((r) => r.code === "9954");
      expect(construction).toBeDefined();
      expect(construction!.gstRate).toBe(18);
    });

    it("searches SAC codes by keyword (real estate)", async () => {
      const results = await provider.searchSac("real estate");
      expect(results.length).toBeGreaterThan(0);
      const realEstate = results.find((r) => r.code === "9972");
      expect(realEstate).toBeDefined();
    });

    it("looks up a specific code", async () => {
      const result = await provider.lookupCode("25232900");
      expect(result).not.toBeNull();
      expect(result!.code).toBe("25232900");
      expect(result!.description.toLowerCase()).toContain("cement");
    });

    it("returns null for unknown code", async () => {
      const result = await provider.lookupCode("99999999");
      expect(result).toBeNull();
    });

    it("returns empty for empty query", async () => {
      const results = await provider.searchHsn("");
      expect(results).toEqual([]);
    });
  });

  describe("searchHsnSac (combined)", () => {
    it("returns both HSN and SAC results", async () => {
      // "building" matches both HSN goods (building stone, building ceramics)
      // and SAC services (building demolition, building roofs, building site)
      const results = await searchHsnSac(provider, "building");
      const hsnResults = results.filter((r) => r.type === "HSN");
      const sacResults = results.filter((r) => r.type === "SAC");
      expect(hsnResults.length).toBeGreaterThan(0);
      expect(sacResults.length).toBeGreaterThan(0);
    });

    it("sorts exact code match first", async () => {
      const results = await searchHsnSac(provider, "2523");
      const exactMatch = results.find((r) => r.code === "2523");
      expect(exactMatch).toBeDefined();
      // Exact match should be in the first few results
      expect(results.indexOf(exactMatch!)).toBeLessThan(3);
    });
  });
});
