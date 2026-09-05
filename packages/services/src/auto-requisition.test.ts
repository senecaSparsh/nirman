/**
 * Unit tests for the pure auto-requisition helper.
 *
 *   computeAutoRequisitionQty — compute order qty from reorder point
 */
import { describe, it, expect } from "vitest";
import { computeAutoRequisitionQty } from "./auto-requisition";
import Decimal from "decimal.js";

describe("computeAutoRequisitionQty", () => {
  it("uses suggestedOrderQty when provided and > 0", () => {
    const qty = computeAutoRequisitionQty(
      new Decimal(100),
      new Decimal(50),
      new Decimal(200),
    );
    expect(qty.toNumber()).toBe(200);
  });

  it("computes qty as (reorderPoint×2) − totalStock when no suggestion", () => {
    // target = 100 × 2 = 200, qty = 200 − 50 = 150
    const qty = computeAutoRequisitionQty(new Decimal(100), new Decimal(50));
    expect(qty.toNumber()).toBe(150);
  });

  it("defaults to 1 when computed qty ≤ 0", () => {
    // target = 50 × 2 = 100, qty = 100 − 100 = 0 → default to 1
    const qty = computeAutoRequisitionQty(new Decimal(50), new Decimal(100));
    expect(qty.toNumber()).toBe(1);
  });

  it("defaults to 1 when stock exceeds target", () => {
    // target = 50 × 2 = 100, qty = 100 − 200 = -100 → default to 1
    const qty = computeAutoRequisitionQty(new Decimal(50), new Decimal(200));
    expect(qty.toNumber()).toBe(1);
  });

  it("ignores suggestedOrderQty when it is 0", () => {
    // suggestedOrderQty = 0 → fall through to formula
    const qty = computeAutoRequisitionQty(new Decimal(100), new Decimal(50), new Decimal(0));
    expect(qty.toNumber()).toBe(150);
  });

  it("ignores suggestedOrderQty when it is null", () => {
    const qty = computeAutoRequisitionQty(new Decimal(100), new Decimal(50), null);
    expect(qty.toNumber()).toBe(150);
  });

  it("ignores suggestedOrderQty when it is negative", () => {
    const qty = computeAutoRequisitionQty(new Decimal(100), new Decimal(50), new Decimal(-50));
    expect(qty.toNumber()).toBe(150);
  });

  it("handles zero reorder point (target = 0, qty = −stock → default 1)", () => {
    const qty = computeAutoRequisitionQty(new Decimal(0), new Decimal(50));
    expect(qty.toNumber()).toBe(1);
  });

  it("handles zero total stock (qty = target = reorderPoint × 2)", () => {
    const qty = computeAutoRequisitionQty(new Decimal(100), new Decimal(0));
    expect(qty.toNumber()).toBe(200);
  });
});
