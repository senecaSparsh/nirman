/**
 * Unit tests for the pure supplier payment helpers in supplier-payment.ts.
 *
 *   validateSupplierPaymentAmounts — validate amount/TDS and compute net paid
 *   wouldExceedPoTotal              — check if payment would exceed PO total
 */
import { describe, it, expect } from "vitest";
import { validateSupplierPaymentAmounts, wouldExceedPoTotal } from "./supplier-payment";
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
