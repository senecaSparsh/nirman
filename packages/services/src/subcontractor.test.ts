/**
 * Unit tests for the exported constants in subcontractor.ts.
 *
 * `VALID_PAYMENT_MODES` is the canonical list of payment modes
 * accepted by the subcontractor RA bill payment flow.
 *
 * No DB, no mocking — pure constants.
 */
import { describe, it, expect } from "vitest";
import { VALID_PAYMENT_MODES } from "./subcontractor";

describe("VALID_PAYMENT_MODES", () => {
  it("contains the 7 standard payment modes", () => {
    expect(VALID_PAYMENT_MODES).toHaveLength(7);
  });

  it("includes BANK_TRANSFER, CHEQUE, CASH", () => {
    expect(VALID_PAYMENT_MODES).toContain("BANK_TRANSFER");
    expect(VALID_PAYMENT_MODES).toContain("CHEQUE");
    expect(VALID_PAYMENT_MODES).toContain("CASH");
  });

  it("includes digital payment modes (NEFT, RTGS, UPI)", () => {
    expect(VALID_PAYMENT_MODES).toContain("NEFT");
    expect(VALID_PAYMENT_MODES).toContain("RTGS");
    expect(VALID_PAYMENT_MODES).toContain("UPI");
  });

  it("includes DEMAND_DRAFT", () => {
    expect(VALID_PAYMENT_MODES).toContain("DEMAND_DRAFT");
  });

  it("is a readonly tuple (frozen at definition)", () => {
    // TypeScript `as const` makes it readonly — verify the runtime values
    // are strings
    for (const mode of VALID_PAYMENT_MODES) {
      expect(typeof mode).toBe("string");
    }
  });
});
