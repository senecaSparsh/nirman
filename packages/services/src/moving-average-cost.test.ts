/**
 * Unit tests for the pure Moving Average Cost functions in moving-average-cost.ts.
 *
 *   computeMovingAverageCost — newMAC = (oldQty×oldMAC + recvQty×recvCost) / (oldQty+recvQty)
 *   stockValueAfterIssue     — remainingQty × MAC
 *   movementDirection        — classify movement type as IN or OUT
 */
import { describe, it, expect } from "vitest";
import {
  computeMovingAverageCost,
  stockValueAfterIssue,
  movementDirection,
} from "./moving-average-cost";
import Decimal from "decimal.js";

describe("computeMovingAverageCost", () => {
  it("computes weighted average for first receipt", () => {
    // old: 0 qty × 0 MAC, received: 100 × 50 → MAC = 5000/100 = 50
    const mac = computeMovingAverageCost(
      new Decimal(0), new Decimal(0),
      new Decimal(100), new Decimal(50),
    );
    expect(mac.toNumber()).toBe(50);
  });

  it("computes weighted average for subsequent receipt", () => {
    // old: 100 × 50, received: 50 × 60 → MAC = (5000 + 3000) / 150 = 53.33
    const mac = computeMovingAverageCost(
      new Decimal(100), new Decimal(50),
      new Decimal(50), new Decimal(60),
    );
    expect(mac.toNumber()).toBeCloseTo(53.3333, 3);
  });

  it("handles receiving at same cost (MAC unchanged)", () => {
    const mac = computeMovingAverageCost(
      new Decimal(100), new Decimal(50),
      new Decimal(50), new Decimal(50),
    );
    expect(mac.toNumber()).toBe(50);
  });

  it("handles receiving at lower cost (MAC decreases)", () => {
    const mac = computeMovingAverageCost(
      new Decimal(100), new Decimal(60),
      new Decimal(100), new Decimal(40),
    );
    // (6000 + 4000) / 200 = 50
    expect(mac.toNumber()).toBe(50);
  });

  it("throws when old MAC is negative", () => {
    expect(() =>
      computeMovingAverageCost(new Decimal(100), new Decimal(-1), new Decimal(50), new Decimal(50)),
    ).toThrow("Old MAC cannot be negative");
  });

  it("throws when received unit cost is negative", () => {
    expect(() =>
      computeMovingAverageCost(new Decimal(100), new Decimal(50), new Decimal(50), new Decimal(-1)),
    ).toThrow("Received unit cost cannot be negative");
  });

  it("throws when old quantity is negative", () => {
    expect(() =>
      computeMovingAverageCost(new Decimal(-1), new Decimal(50), new Decimal(50), new Decimal(50)),
    ).toThrow("Old quantity cannot be negative");
  });

  it("throws when received quantity is negative", () => {
    expect(() =>
      computeMovingAverageCost(new Decimal(100), new Decimal(50), new Decimal(-1), new Decimal(50)),
    ).toThrow("Received quantity cannot be negative");
  });

  it("throws when both quantities are zero", () => {
    expect(() =>
      computeMovingAverageCost(new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(50)),
    ).toThrow("total quantity is zero");
  });
});

describe("stockValueAfterIssue", () => {
  it("computes remaining value = qty × MAC", () => {
    expect(stockValueAfterIssue(new Decimal(100), new Decimal(50)).toNumber()).toBe(5000);
  });

  it("returns 0 when remaining qty is 0", () => {
    expect(stockValueAfterIssue(new Decimal(0), new Decimal(50)).toNumber()).toBe(0);
  });

  it("returns 0 when MAC is 0", () => {
    expect(stockValueAfterIssue(new Decimal(100), new Decimal(0)).toNumber()).toBe(0);
  });
});

describe("movementDirection", () => {
  it("classifies inbound movements", () => {
    expect(movementDirection("PURCHASE_RECEIPT")).toBe("IN");
    expect(movementDirection("TRANSFER_IN")).toBe("IN");
    expect(movementDirection("ADJUSTMENT_IN")).toBe("IN");
    expect(movementDirection("SCRAP_GENERATED")).toBe("IN");
  });

  it("classifies outbound movements", () => {
    expect(movementDirection("TRANSFER_OUT")).toBe("OUT");
    expect(movementDirection("ISSUE_TO_PROJECT")).toBe("OUT");
    expect(movementDirection("ISSUE_TO_DEPARTMENT")).toBe("OUT");
    expect(movementDirection("ADJUSTMENT_OUT")).toBe("OUT");
    expect(movementDirection("RETURN")).toBe("OUT");
    expect(movementDirection("SALE")).toBe("OUT");
  });

  it("throws for unknown movement type", () => {
    expect(() => movementDirection("UNKNOWN")).toThrow("Unknown StockMovementType");
  });
});
