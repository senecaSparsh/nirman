/**
 * Unit tests for the pure tenancy helpers extracted from tenancy.ts.
 *
 *   validateRentPayment   — validate amount/TDS and compute net received
 *   computeRentGst        — compute GST breakdown for rent
 *   computeEscalatedRent  — apply yearly escalation
 */
import { describe, it, expect } from "vitest";
import { validateRentPayment, computeRentGst, computeEscalatedRent } from "./tenancy";
import { ServiceError } from "./errors";
import Decimal from "decimal.js";

describe("validateRentPayment", () => {
  it("computes net received for valid payment with TDS", () => {
    const r = validateRentPayment(new Decimal(50000), new Decimal(5000));
    expect(r.netReceived.toNumber()).toBe(45000);
  });

  it("computes net received with zero TDS", () => {
    const r = validateRentPayment(new Decimal(50000), new Decimal(0));
    expect(r.netReceived.toNumber()).toBe(50000);
  });

  it("throws when amount is 0", () => {
    expect(() => validateRentPayment(new Decimal(0), new Decimal(0))).toThrow("Amount must be > 0");
  });

  it("throws when amount is negative", () => {
    expect(() => validateRentPayment(new Decimal(-100), new Decimal(0))).toThrow("Amount must be > 0");
  });

  it("throws when TDS is negative", () => {
    expect(() => validateRentPayment(new Decimal(50000), new Decimal(-500))).toThrow(
      "TDS amount cannot be negative",
    );
  });

  it("throws when TDS exceeds amount", () => {
    expect(() => validateRentPayment(new Decimal(1000), new Decimal(1500))).toThrow(
      "TDS amount cannot exceed rent amount",
    );
  });

  it("allows TDS equal to amount (full TDS deduction)", () => {
    const r = validateRentPayment(new Decimal(1000), new Decimal(1000));
    expect(r.netReceived.toNumber()).toBe(0);
  });
});

describe("computeRentGst", () => {
  it("computes GST at 18% (default for commercial rent)", () => {
    const r = computeRentGst(new Decimal(50000), new Decimal(18));
    expect(r.gstAmount.toNumber()).toBe(9000);
    expect(r.revenueAmount.toNumber()).toBe(41000);
  });

  it("computes GST at 0% (residential rent exemption)", () => {
    const r = computeRentGst(new Decimal(50000), new Decimal(0));
    expect(r.gstAmount.toNumber()).toBe(0);
    expect(r.revenueAmount.toNumber()).toBe(50000);
  });

  it("handles fractional GST rate", () => {
    const r = computeRentGst(new Decimal(10000), new Decimal(12.5));
    expect(r.gstAmount.toNumber()).toBe(1250);
    expect(r.revenueAmount.toNumber()).toBe(8750);
  });

  it("handles zero amount", () => {
    const r = computeRentGst(new Decimal(0), new Decimal(18));
    expect(r.gstAmount.toNumber()).toBe(0);
    expect(r.revenueAmount.toNumber()).toBe(0);
  });
});

describe("computeEscalatedRent", () => {
  it("applies 10% escalation", () => {
    const r = computeEscalatedRent(new Decimal(50000), new Decimal(10));
    expect(r.increase.toNumber()).toBe(5000);
    expect(r.newRent.toNumber()).toBe(55000);
  });

  it("applies 0% escalation (no change)", () => {
    const r = computeEscalatedRent(new Decimal(50000), new Decimal(0));
    expect(r.increase.toNumber()).toBe(0);
    expect(r.newRent.toNumber()).toBe(50000);
  });

  it("applies fractional escalation percentage", () => {
    const r = computeEscalatedRent(new Decimal(50000), new Decimal(7.5));
    expect(r.increase.toNumber()).toBe(3750);
    expect(r.newRent.toNumber()).toBe(53750);
  });

  it("rounds new rent to 2 decimal places", () => {
    const r = computeEscalatedRent(new Decimal(333.33), new Decimal(10));
    // increase = 33.333, newRent = 366.663 → 366.66
    expect(r.newRent.toNumber()).toBe(366.66);
  });
});
