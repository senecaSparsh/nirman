/**
 * Unit tests for the pure stock adjustment helper in stock-adjustment.ts.
 *
 *   validateStockAdjustmentInput — validate qty, reason, and determine movement type
 */
import { describe, it, expect } from "vitest";
import { validateStockAdjustmentInput } from "./stock-adjustment";
import { ServiceError } from "./errors";
import Decimal from "decimal.js";

describe("validateStockAdjustmentInput", () => {
  it("validates IN adjustment with positive qty and reason", () => {
    const r = validateStockAdjustmentInput({ qty: 10, reason: "Opening stock", direction: "IN" });
    expect(r.qty.toNumber()).toBe(10);
    expect(r.movementType).toBe("ADJUSTMENT_IN");
  });

  it("validates OUT adjustment with positive qty and reason", () => {
    const r = validateStockAdjustmentInput({ qty: 5, reason: "Damaged goods", direction: "OUT" });
    expect(r.qty.toNumber()).toBe(5);
    expect(r.movementType).toBe("ADJUSTMENT_OUT");
  });

  it("throws when qty is 0", () => {
    expect(() =>
      validateStockAdjustmentInput({ qty: 0, reason: "Test", direction: "IN" }),
    ).toThrow("Adjustment quantity must be greater than 0");
  });

  it("throws when qty is negative", () => {
    expect(() =>
      validateStockAdjustmentInput({ qty: -5, reason: "Test", direction: "IN" }),
    ).toThrow("Adjustment quantity must be greater than 0");
  });

  it("throws when reason is empty", () => {
    expect(() =>
      validateStockAdjustmentInput({ qty: 10, reason: "", direction: "IN" }),
    ).toThrow("A reason is required");
  });

  it("throws when reason is whitespace only", () => {
    expect(() =>
      validateStockAdjustmentInput({ qty: 10, reason: "   ", direction: "IN" }),
    ).toThrow("A reason is required");
  });

  it("accepts Decimal qty", () => {
    const r = validateStockAdjustmentInput({ qty: new Decimal(10.5), reason: "Correction", direction: "IN" });
    expect(r.qty.toNumber()).toBe(10.5);
  });

  it("accepts string qty", () => {
    const r = validateStockAdjustmentInput({ qty: "10", reason: "Correction", direction: "OUT" });
    expect(r.qty.toNumber()).toBe(10);
  });
});
