/**
 * Unit tests for the pure sale payment helper.
 *
 *   validateSalePayment — validate amount and determine payment status
 */
import { describe, it, expect } from "vitest";
import { validateSalePayment } from "./sale-payment";
import { ServiceError } from "./errors";
import Decimal from "decimal.js";

describe("validateSalePayment", () => {
  it("returns PARTIAL for partial payment", () => {
    const r = validateSalePayment(new Decimal(500), new Decimal(0), new Decimal(1000));
    expect(r.totalAfterPayment.toNumber()).toBe(500);
    expect(r.paymentStatus).toBe("PARTIAL");
  });

  it("returns PAID when payment completes the sale", () => {
    const r = validateSalePayment(new Decimal(1000), new Decimal(0), new Decimal(1000));
    expect(r.totalAfterPayment.toNumber()).toBe(1000);
    expect(r.paymentStatus).toBe("PAID");
  });

  it("returns PAID when final installment completes", () => {
    const r = validateSalePayment(new Decimal(500), new Decimal(500), new Decimal(1000));
    expect(r.totalAfterPayment.toNumber()).toBe(1000);
    expect(r.paymentStatus).toBe("PAID");
  });

  it("throws when amount is 0", () => {
    expect(() => validateSalePayment(new Decimal(0), new Decimal(0), new Decimal(1000))).toThrow(
      "Payment amount must be greater than 0",
    );
  });

  it("throws when amount is negative", () => {
    expect(() => validateSalePayment(new Decimal(-100), new Decimal(0), new Decimal(1000))).toThrow(
      "Payment amount must be greater than 0",
    );
  });

  it("throws when payment exceeds outstanding balance", () => {
    expect(() => validateSalePayment(new Decimal(600), new Decimal(500), new Decimal(1000))).toThrow(
      "exceeds outstanding balance",
    );
  });

  it("allows payment exactly equal to outstanding balance", () => {
    const r = validateSalePayment(new Decimal(500), new Decimal(500), new Decimal(1000));
    expect(r.paymentStatus).toBe("PAID");
  });
});
