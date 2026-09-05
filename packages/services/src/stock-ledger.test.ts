/**
 * Unit tests for the pure stock ledger helper.
 *
 *   validateMovementInput — validate movement direction, location, and qty
 *
 * Uses the actual StockMovementType values from movementDirection():
 *   IN:  PURCHASE_RECEIPT, TRANSFER_IN, ADJUSTMENT_IN, SCRAP_GENERATED
 *   OUT: TRANSFER_OUT, ISSUE_TO_PROJECT, ISSUE_TO_DEPARTMENT, ADJUSTMENT_OUT, RETURN, SALE
 */
import { describe, it, expect } from "vitest";
import { validateMovementInput } from "./stock-ledger";
import { ServiceError } from "./errors";
import Decimal from "decimal.js";

describe("validateMovementInput", () => {
  it("returns IN direction with toLocationId for PURCHASE_RECEIPT", () => {
    const r = validateMovementInput("PURCHASE_RECEIPT", undefined, "loc-1", new Decimal(10));
    expect(r.direction).toBe("IN");
    expect(r.locationId).toBe("loc-1");
  });

  it("returns OUT direction with fromLocationId for ISSUE_TO_PROJECT", () => {
    const r = validateMovementInput("ISSUE_TO_PROJECT", "loc-1", undefined, new Decimal(10));
    expect(r.direction).toBe("OUT");
    expect(r.locationId).toBe("loc-1");
  });

  it("returns IN for TRANSFER_IN", () => {
    const r = validateMovementInput("TRANSFER_IN", undefined, "loc-2", new Decimal(5));
    expect(r.direction).toBe("IN");
  });

  it("returns OUT for TRANSFER_OUT", () => {
    const r = validateMovementInput("TRANSFER_OUT", "loc-1", undefined, new Decimal(5));
    expect(r.direction).toBe("OUT");
  });

  it("returns OUT for SALE", () => {
    const r = validateMovementInput("SALE", "loc-1", undefined, new Decimal(3));
    expect(r.direction).toBe("OUT");
  });

  it("returns IN for SCRAP_GENERATED", () => {
    const r = validateMovementInput("SCRAP_GENERATED", undefined, "loc-1", new Decimal(2));
    expect(r.direction).toBe("IN");
  });

  it("throws if toLocationId missing for IN movement", () => {
    expect(() =>
      validateMovementInput("PURCHASE_RECEIPT", undefined, undefined, new Decimal(10)),
    ).toThrow("requires a toLocationId");
  });

  it("throws if fromLocationId missing for OUT movement", () => {
    expect(() =>
      validateMovementInput("ISSUE_TO_PROJECT", undefined, undefined, new Decimal(10)),
    ).toThrow("requires a fromLocationId");
  });

  it("throws if qty is 0", () => {
    expect(() =>
      validateMovementInput("PURCHASE_RECEIPT", undefined, "loc-1", new Decimal(0)),
    ).toThrow("Movement quantity must be > 0");
  });

  it("throws if qty is negative", () => {
    expect(() =>
      validateMovementInput("ISSUE_TO_PROJECT", "loc-1", undefined, new Decimal(-5)),
    ).toThrow("Movement quantity must be > 0");
  });

  it("accepts ADJUSTMENT_IN as IN direction", () => {
    const r = validateMovementInput("ADJUSTMENT_IN", undefined, "loc-1", new Decimal(5));
    expect(r.direction).toBe("IN");
  });

  it("accepts ADJUSTMENT_OUT as OUT direction", () => {
    const r = validateMovementInput("ADJUSTMENT_OUT", "loc-1", undefined, new Decimal(5));
    expect(r.direction).toBe("OUT");
  });

  it("accepts fractional qty", () => {
    const r = validateMovementInput("PURCHASE_RECEIPT", undefined, "loc-1", new Decimal(2.5));
    expect(r.locationId).toBe("loc-1");
  });

  it("throws for unknown movement type", () => {
    expect(() =>
      validateMovementInput("UNKNOWN_TYPE" as never, undefined, "loc-1", new Decimal(10)),
    ).toThrow("Unknown StockMovementType");
  });
});
