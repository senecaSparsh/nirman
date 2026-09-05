/**
 * Unit tests for the pure function `threeWayMatch()` in supplier-invoice.ts.
 *
 * Three-way matching compares invoice lines against PO lines and GRN lines:
 *   - Quantity: invoice qty ≤ PO qty, and ≤ GRN qty (if GRN exists)
 *   - Price: invoice unit price ≤ PO unit price (within tolerance)
 *
 * Match outcomes:
 *   THREE_WAY_MATCH — invoice + PO + GRN all agree
 *   TWO_WAY_MATCH   — invoice + PO agree, no GRN
 *   UNMATCHED       — variances found
 *
 * No DB, no mocking — pure function.
 */
import { describe, it, expect } from "vitest";
import { threeWayMatch } from "./supplier-invoice";

describe("threeWayMatch", () => {
  it("returns THREE_WAY_MATCH when all lines match perfectly", () => {
    const result = threeWayMatch(
      [{ materialId: "m1", quantity: 10, unitPrice: 100 }],
      [{ materialId: "m1", qtyOrdered: 10, unitCost: 100 }],
      [{ materialId: "m1", qtyReceived: 10 }],
    );
    expect(result.matched).toBe(true);
    expect(result.matchType).toBe("THREE_WAY_MATCH");
    expect(result.variances).toHaveLength(0);
  });

  it("returns TWO_WAY_MATCH when no GRN lines (services)", () => {
    const result = threeWayMatch(
      [{ materialId: "m1", quantity: 10, unitPrice: 100 }],
      [{ materialId: "m1", qtyOrdered: 10, unitCost: 100 }],
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.matchType).toBe("TWO_WAY_MATCH");
  });

  it("flags quantity variance when invoice qty > PO qty", () => {
    const result = threeWayMatch(
      [{ materialId: "m1", quantity: 15, unitPrice: 100 }],
      [{ materialId: "m1", qtyOrdered: 10, unitCost: 100 }],
      [{ materialId: "m1", qtyReceived: 15 }],
    );
    expect(result.matched).toBe(false);
    expect(result.matchType).toBe("UNMATCHED");
    expect(result.variances).toHaveLength(1);
    expect(result.variances[0]!.field).toBe("quantity");
    expect(result.variances[0]!.line).toBe(1);
  });

  it("flags quantity variance when invoice qty > GRN qty", () => {
    const result = threeWayMatch(
      [{ materialId: "m1", quantity: 15, unitPrice: 100 }],
      [{ materialId: "m1", qtyOrdered: 20, unitCost: 100 }],
      [{ materialId: "m1", qtyReceived: 10 }],
    );
    expect(result.matched).toBe(false);
    expect(result.variances.some((v) => v.field === "quantity")).toBe(true);
  });

  it("flags price variance when invoice price exceeds PO price + tolerance", () => {
    const result = threeWayMatch(
      [{ materialId: "m1", quantity: 10, unitPrice: 105 }],
      [{ materialId: "m1", qtyOrdered: 10, unitCost: 100 }],
      [{ materialId: "m1", qtyReceived: 10 }],
    );
    // 1% tolerance → max allowed = 101. Invoice 105 > 101 → variance
    expect(result.matched).toBe(false);
    expect(result.variances.some((v) => v.field === "unitPrice")).toBe(true);
  });

  it("allows price within tolerance (1% default)", () => {
    const result = threeWayMatch(
      [{ materialId: "m1", quantity: 10, unitPrice: 100.5 }],
      [{ materialId: "m1", qtyOrdered: 10, unitCost: 100 }],
      [{ materialId: "m1", qtyReceived: 10 }],
    );
    // 1% of 100 = 1 → max allowed = 101. Invoice 100.5 ≤ 101 → OK
    expect(result.matched).toBe(true);
  });

  it("flags variance when invoice material not on PO", () => {
    const result = threeWayMatch(
      [{ materialId: "m2", quantity: 10, unitPrice: 100 }],
      [{ materialId: "m1", qtyOrdered: 10, unitCost: 100 }],
      [{ materialId: "m1", qtyReceived: 10 }],
    );
    expect(result.matched).toBe(false);
    expect(result.variances.some((v) => v.field === "quantity")).toBe(true);
  });

  it("sums duplicate PO lines for same material", () => {
    const result = threeWayMatch(
      [{ materialId: "m1", quantity: 15, unitPrice: 100 }],
      [
        { materialId: "m1", qtyOrdered: 10, unitCost: 100 },
        { materialId: "m1", qtyOrdered: 5, unitCost: 100 },
      ],
      [{ materialId: "m1", qtyReceived: 15 }],
    );
    expect(result.matched).toBe(true);
    expect(result.matchType).toBe("THREE_WAY_MATCH");
  });

  it("sums duplicate GRN lines for same material", () => {
    const result = threeWayMatch(
      [{ materialId: "m1", quantity: 15, unitPrice: 100 }],
      [{ materialId: "m1", qtyOrdered: 20, unitCost: 100 }],
      [
        { materialId: "m1", qtyReceived: 10 },
        { materialId: "m1", qtyReceived: 5 },
      ],
    );
    expect(result.matched).toBe(true);
  });

  it("handles multiple invoice lines with mixed match results", () => {
    const result = threeWayMatch(
      [
        { materialId: "m1", quantity: 10, unitPrice: 100 },
        { materialId: "m2", quantity: 5, unitPrice: 200 },
      ],
      [
        { materialId: "m1", qtyOrdered: 10, unitCost: 100 },
        { materialId: "m2", qtyOrdered: 3, unitCost: 200 },
      ],
      [
        { materialId: "m1", qtyReceived: 10 },
        { materialId: "m2", qtyReceived: 5 },
      ],
    );
    expect(result.matched).toBe(false);
    // Line 2 has qty 5 > PO qty 3
    expect(result.variances.some((v) => v.line === 2)).toBe(true);
  });

  it("respects custom price tolerance", () => {
    const result = threeWayMatch(
      [{ materialId: "m1", quantity: 10, unitPrice: 110 }],
      [{ materialId: "m1", qtyOrdered: 10, unitCost: 100 }],
      [{ materialId: "m1", qtyReceived: 10 }],
      0.15, // 15% tolerance → max allowed = 115
    );
    expect(result.matched).toBe(true);
  });

  // ── Header subtotal vs line totals (M4 fix) ──

  it("passes when header subtotal matches sum of line totals", () => {
    const result = threeWayMatch(
      [
        { materialId: "m1", quantity: 10, unitPrice: 100 },
        { materialId: "m2", quantity: 5, unitPrice: 200 },
      ],
      [
        { materialId: "m1", qtyOrdered: 10, unitCost: 100 },
        { materialId: "m2", qtyOrdered: 5, unitCost: 200 },
      ],
      [
        { materialId: "m1", qtyReceived: 10 },
        { materialId: "m2", qtyReceived: 5 },
      ],
      0.01,
      2000, // 10×100 + 5×200 = 2000
    );
    expect(result.matched).toBe(true);
    expect(result.matchType).toBe("THREE_WAY_MATCH");
  });

  it("flags header subtotal variance when it doesn't match line totals", () => {
    const result = threeWayMatch(
      [
        { materialId: "m1", quantity: 10, unitPrice: 100 },
        { materialId: "m2", quantity: 5, unitPrice: 200 },
      ],
      [
        { materialId: "m1", qtyOrdered: 10, unitCost: 100 },
        { materialId: "m2", qtyOrdered: 5, unitCost: 200 },
      ],
      [
        { materialId: "m1", qtyReceived: 10 },
        { materialId: "m2", qtyReceived: 5 },
      ],
      0.01,
      2500, // actual line total = 2000, header says 2500 → variance
    );
    expect(result.matched).toBe(false);
    expect(result.variances.some((v) => v.field === "lineTotal" && v.line === 0)).toBe(true);
  });

  it("does not flag header variance when headerSubtotal is not provided", () => {
    const result = threeWayMatch(
      [{ materialId: "m1", quantity: 10, unitPrice: 100 }],
      [{ materialId: "m1", qtyOrdered: 10, unitCost: 100 }],
      [{ materialId: "m1", qtyReceived: 10 }],
    );
    expect(result.variances.some((v) => v.field === "lineTotal")).toBe(false);
  });
});
