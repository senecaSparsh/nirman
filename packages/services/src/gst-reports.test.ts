/**
 * Unit tests for the pure GST helper functions in gst-reports.ts.
 *
 *   getStateCodeFromGstin — extracts 2-digit state code from GSTIN
 *   isIntraState          — determines if transaction is intra-state
 *   splitGst              — splits GST into CGST/SGST/IGST components
 *
 * GSTIN format: 2-digit state code + 10-char PAN + 1-char entity + Z + checksum
 *   e.g. "27AAAPL1234C1Z5" → state code "27" (Maharashtra)
 *
 * GST split rules:
 *   Intra-state (same state): CGST = 50%, SGST = 50%, IGST = 0
 *   Inter-state (diff state): CGST = 0, SGST = 0, IGST = 100%
 *   Unknown state (either GSTIN null): defaults to inter-state (IGST)
 *
 * No DB, no mocking — pure functions.
 */
import { describe, it, expect } from "vitest";
import { getStateCodeFromGstin, isIntraState, splitGst } from "./gst-reports";
import Decimal from "decimal.js";

// Valid GSTINs for testing:
//   27AAAPL1234C1Z5 — Maharashtra (27)
//   29AAAPL1234C1Z5 — Karnataka (29)
//   07AAAPL1234C1Z5 — Delhi (07)
const MH_GSTIN = "27AAAPL1234C1Z5";
const KA_GSTIN = "29AAAPL1234C1Z5";
const DL_GSTIN = "07AAAPL1234C1Z5";

describe("getStateCodeFromGstin", () => {
  it("extracts state code from valid GSTIN", () => {
    expect(getStateCodeFromGstin(MH_GSTIN)).toBe("27"); // Maharashtra
    expect(getStateCodeFromGstin(KA_GSTIN)).toBe("29"); // Karnataka
    expect(getStateCodeFromGstin(DL_GSTIN)).toBe("07"); // Delhi
  });

  it("returns null for null or undefined GSTIN", () => {
    expect(getStateCodeFromGstin(null)).toBeNull();
    expect(getStateCodeFromGstin(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getStateCodeFromGstin("")).toBeNull();
  });

  it("returns null for GSTIN shorter than 2 chars", () => {
    expect(getStateCodeFromGstin("A")).toBeNull();
  });

  it("returns null when first 2 chars are not digits", () => {
    expect(getStateCodeFromGstin("AAAPL1234C1Z5")).toBeNull();
    expect(getStateCodeFromGstin("ABAAAPL1234C1Z5")).toBeNull();
  });

  it("handles GSTIN with leading zeros in state code", () => {
    expect(getStateCodeFromGstin("01AAAPL1234C1Z5")).toBe("01"); // J&K
    expect(getStateCodeFromGstin("07AAAPL1234C1Z5")).toBe("07"); // Delhi
  });
});

describe("isIntraState", () => {
  it("returns true when both GSTINs have the same state code", () => {
    expect(isIntraState(MH_GSTIN, MH_GSTIN)).toBe(true);
    expect(isIntraState(KA_GSTIN, KA_GSTIN)).toBe(true);
  });

  it("returns false when GSTINs have different state codes", () => {
    expect(isIntraState(MH_GSTIN, KA_GSTIN)).toBe(false);
    expect(isIntraState(DL_GSTIN, MH_GSTIN)).toBe(false);
  });

  it("returns false when company GSTIN is null (conservative default)", () => {
    expect(isIntraState(null, MH_GSTIN)).toBe(false);
    expect(isIntraState(undefined, MH_GSTIN)).toBe(false);
  });

  it("returns false when party GSTIN is null (conservative default)", () => {
    expect(isIntraState(MH_GSTIN, null)).toBe(false);
    expect(isIntraState(MH_GSTIN, undefined)).toBe(false);
  });

  it("returns false when both GSTINs are null", () => {
    expect(isIntraState(null, null)).toBe(false);
  });

  it("returns false when either GSTIN is malformed", () => {
    expect(isIntraState("ABCD", MH_GSTIN)).toBe(false);
    expect(isIntraState(MH_GSTIN, "ABCD")).toBe(false);
  });
});

describe("splitGst", () => {
  it("splits intra-state GST into equal CGST and SGST", () => {
    const result = splitGst(new Decimal(18000), MH_GSTIN, MH_GSTIN);
    expect(result.cgst.toNumber()).toBe(9000);
    expect(result.sgst.toNumber()).toBe(9000);
    expect(result.igst.toNumber()).toBe(0);
  });

  it("assigns full GST as IGST for inter-state transactions", () => {
    const result = splitGst(new Decimal(18000), MH_GSTIN, KA_GSTIN);
    expect(result.cgst.toNumber()).toBe(0);
    expect(result.sgst.toNumber()).toBe(0);
    expect(result.igst.toNumber()).toBe(18000);
  });

  it("assigns full GST as IGST when company GSTIN is null", () => {
    const result = splitGst(new Decimal(18000), null, MH_GSTIN);
    expect(result.cgst.toNumber()).toBe(0);
    expect(result.sgst.toNumber()).toBe(0);
    expect(result.igst.toNumber()).toBe(18000);
  });

  it("assigns full GST as IGST when party GSTIN is null", () => {
    const result = splitGst(new Decimal(18000), MH_GSTIN, null);
    expect(result.cgst.toNumber()).toBe(0);
    expect(result.sgst.toNumber()).toBe(0);
    expect(result.igst.toNumber()).toBe(18000);
  });

  it("handles zero GST amount", () => {
    const intraResult = splitGst(new Decimal(0), MH_GSTIN, MH_GSTIN);
    expect(intraResult.cgst.toNumber()).toBe(0);
    expect(intraResult.sgst.toNumber()).toBe(0);
    expect(intraResult.igst.toNumber()).toBe(0);

    const interResult = splitGst(new Decimal(0), MH_GSTIN, KA_GSTIN);
    expect(interResult.cgst.toNumber()).toBe(0);
    expect(interResult.sgst.toNumber()).toBe(0);
    expect(interResult.igst.toNumber()).toBe(0);
  });

  it("handles odd GST amount (not evenly divisible by 2)", () => {
    // 18001 / 2 = 9000.5 — Decimal handles this precisely
    const result = splitGst(new Decimal(18001), MH_GSTIN, MH_GSTIN);
    expect(result.cgst.toNumber()).toBe(9000.5);
    expect(result.sgst.toNumber()).toBe(9000.5);
    expect(result.igst.toNumber()).toBe(0);
  });

  it("handles large GST amounts", () => {
    const result = splitGst(new Decimal(1250000), MH_GSTIN, KA_GSTIN);
    expect(result.igst.toNumber()).toBe(1250000);
    expect(result.cgst.toNumber()).toBe(0);
    expect(result.sgst.toNumber()).toBe(0);
  });
});
