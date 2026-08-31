import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { getStateCodeFromGstin, isIntraState, splitGst } from "./gst-reports";

describe("GST CGST/SGST/IGST split", () => {
  describe("getStateCodeFromGstin", () => {
    it("extracts the 2-digit state code from a valid GSTIN", () => {
      expect(getStateCodeFromGstin("27AAACJ5678K1Z2")).toBe("27"); // Maharashtra
      expect(getStateCodeFromGstin("07AAACJ5678K1Z2")).toBe("07"); // Delhi
      expect(getStateCodeFromGstin("29AAACJ5678K1Z2")).toBe("29"); // Karnataka
    });

    it("returns null for null/undefined/short inputs", () => {
      expect(getStateCodeFromGstin(null)).toBeNull();
      expect(getStateCodeFromGstin(undefined)).toBeNull();
      expect(getStateCodeFromGstin("")).toBeNull();
      expect(getStateCodeFromGstin("A")).toBeNull();
    });

    it("returns null for non-numeric state codes", () => {
      expect(getStateCodeFromGstin("AA1234567890123")).toBeNull();
    });
  });

  describe("isIntraState", () => {
    it("returns true when both parties are in the same state", () => {
      expect(isIntraState("27AAACJ5678K1Z2", "27AAACP3344C1Z7")).toBe(true);
    });

    it("returns false when parties are in different states", () => {
      expect(isIntraState("27AAACJ5678K1Z2", "07AAACU1234F1Z5")).toBe(false);
    });

    it("returns false (conservative IGST) when either GSTIN is unknown", () => {
      expect(isIntraState("27AAACJ5678K1Z2", null)).toBe(false);
      expect(isIntraState(null, "27AAACP3344C1Z7")).toBe(false);
      expect(isIntraState(null, null)).toBe(false);
    });
  });

  describe("splitGst", () => {
    it("splits intra-state GST into equal CGST + SGST", () => {
      const result = splitGst(new Decimal(1800), "27AAACJ5678K1Z2", "27AAACP3344C1Z7");
      expect(result.cgst.toNumber()).toBe(900);
      expect(result.sgst.toNumber()).toBe(900);
      expect(result.igst.toNumber()).toBe(0);
    });

    it("assigns all GST as IGST for inter-state transactions", () => {
      const result = splitGst(new Decimal(1800), "27AAACJ5678K1Z2", "07AAACU1234F1Z5");
      expect(result.cgst.toNumber()).toBe(0);
      expect(result.sgst.toNumber()).toBe(0);
      expect(result.igst.toNumber()).toBe(1800);
    });

    it("defaults to IGST when party GSTIN is unknown", () => {
      const result = splitGst(new Decimal(1800), "27AAACJ5678K1Z2", null);
      expect(result.cgst.toNumber()).toBe(0);
      expect(result.sgst.toNumber()).toBe(0);
      expect(result.igst.toNumber()).toBe(1800);
    });

    it("handles zero GST amount", () => {
      const result = splitGst(new Decimal(0), "27AAACJ5678K1Z2", "27AAACP3344C1Z7");
      expect(result.cgst.toNumber()).toBe(0);
      expect(result.sgst.toNumber()).toBe(0);
      expect(result.igst.toNumber()).toBe(0);
    });
  });
});
