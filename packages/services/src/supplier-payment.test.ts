/**
 * Unit tests for the pure supplier payment helpers in supplier-payment.ts.
 *
 *   validateSupplierPaymentAmounts — validate amount/TDS and compute net paid
 *   wouldExceedPoTotal              — check if payment would exceed PO total
 */
import { describe, it, expect } from "vitest";
import { validateSupplierPaymentAmounts, wouldExceedPoTotal, suggestSupplierTds, TDS_SECTION_DEFAULTS } from "./supplier-payment";
import { ServiceError } from "./errors";
import Decimal from "decimal.js";

describe("validateSupplierPaymentAmounts", () => {
  it("computes net paid amount for valid payment with TDS", () => {
    const r = validateSupplierPaymentAmounts(new Decimal(10000), new Decimal(1000));
    expect(r.netPaidAmount.toNumber()).toBe(9000);
  });

  it("computes net paid amount with zero TDS", () => {
    const r = validateSupplierPaymentAmounts(new Decimal(10000), new Decimal(0));
    expect(r.netPaidAmount.toNumber()).toBe(10000);
  });

  it("throws when amount is 0", () => {
    expect(() => validateSupplierPaymentAmounts(new Decimal(0), new Decimal(0))).toThrow(
      "Payment amount must be greater than 0",
    );
  });

  it("throws when amount is negative", () => {
    expect(() => validateSupplierPaymentAmounts(new Decimal(-100), new Decimal(0))).toThrow(
      "Payment amount must be greater than 0",
    );
  });

  it("throws when TDS is negative", () => {
    expect(() => validateSupplierPaymentAmounts(new Decimal(10000), new Decimal(-500))).toThrow(
      "TDS amount cannot be negative",
    );
  });

  it("throws when TDS exceeds amount", () => {
    expect(() => validateSupplierPaymentAmounts(new Decimal(1000), new Decimal(1500))).toThrow(
      "TDS amount cannot exceed payment amount",
    );
  });

  it("allows TDS equal to amount (full TDS deduction)", () => {
    const r = validateSupplierPaymentAmounts(new Decimal(1000), new Decimal(1000));
    expect(r.netPaidAmount.toNumber()).toBe(0);
  });
});

describe("wouldExceedPoTotal", () => {
  it("returns true when payment would exceed PO total", () => {
    expect(wouldExceedPoTotal(new Decimal(800), new Decimal(300), new Decimal(1000))).toBe(true);
  });

  it("returns false when payment is within PO total", () => {
    expect(wouldExceedPoTotal(new Decimal(500), new Decimal(300), new Decimal(1000))).toBe(false);
  });

  it("returns false when payment exactly equals remaining balance", () => {
    expect(wouldExceedPoTotal(new Decimal(700), new Decimal(300), new Decimal(1000))).toBe(false);
  });

  it("returns false when nothing has been paid yet", () => {
    expect(wouldExceedPoTotal(new Decimal(0), new Decimal(1000), new Decimal(1000))).toBe(false);
  });
});


describe("suggestSupplierTds", () => {
  it("suggests section default rate when PAN present", () => {
    const r = suggestSupplierTds({ amount: 100000, pan: "ABCDE1234F", tdsSection: "194C" });
    expect(r).not.toBeNull();
    expect(r!.rate).toBe(2);
    expect(r!.amount.toNumber()).toBe(2000);
  });

  it("applies the 206AA 20% floor when PAN absent", () => {
    const r = suggestSupplierTds({ amount: 100000, pan: null, tdsSection: "194C" });
    expect(r!.rate).toBe(20);
    expect(r!.amount.toNumber()).toBe(20000);
    expect(r!.reason).toContain("206AA");
  });

  it("supplier tdsRate override beats the section default", () => {
    const r = suggestSupplierTds({ amount: 100000, pan: "ABCDE1234F", tdsSection: "194C", tdsRate: 1 });
    expect(r!.rate).toBe(1);
    expect(r!.amount.toNumber()).toBe(1000);
  });

  it("206AA does not lower a rate already above 20", () => {
    // e.g. a 197 LDC scenario would never see this; but a non-PAN 194J with a
    // hypothetical 25% override stays 25, not 20.
    const r = suggestSupplierTds({ amount: 1000, pan: "", tdsRate: 25 });
    expect(r!.rate).toBe(25);
  });

  it("returns null when no section and no rate are configured", () => {
    expect(suggestSupplierTds({ amount: 100000, pan: "ABCDE1234F" })).toBeNull();
  });

  it("returns null on zero/negative amount", () => {
    expect(suggestSupplierTds({ amount: 0, tdsSection: "194C" })).toBeNull();
  });

  it("rounds to 2dp", () => {
    const r = suggestSupplierTds({ amount: 33333, tdsSection: "194C", tdsRate: 1, pan: "X" });
    expect(r!.amount.toNumber()).toBe(333.33);
  });
});
