import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  computeMovingAverageCost,
  stockValueAfterIssue,
  movementDirection,
} from "./moving-average-cost";

describe("computeMovingAverageCost", () => {
  it("computes MAC for first receipt into empty stock", () => {
    const mac = computeMovingAverageCost(
      new Decimal(0),
      new Decimal(0),
      new Decimal(100),
      new Decimal(50),
    );
    expect(mac.toNumber()).toBe(50);
  });

  it("blends old and new cost proportionally", () => {
    // 100 units @ ₹50 = ₹5000, + 100 units @ ₹70 = ₹7000 → 200 units, ₹12000 → MAC = ₹60
    const mac = computeMovingAverageCost(
      new Decimal(100),
      new Decimal(50),
      new Decimal(100),
      new Decimal(70),
    );
    expect(mac.toNumber()).toBe(60);
  });

  it("weights correctly when quantities differ", () => {
    // 200 units @ ₹40 = ₹8000, + 50 units @ ₹100 = ₹5000 → 250 units, ₹13000 → MAC = ₹52
    const mac = computeMovingAverageCost(
      new Decimal(200),
      new Decimal(40),
      new Decimal(50),
      new Decimal(100),
    );
    expect(mac.toNumber()).toBe(52);
  });

  it("returns 0 when total qty is 0 (edge case)", () => {
    const mac = computeMovingAverageCost(
      new Decimal(0),
      new Decimal(0),
      new Decimal(0),
      new Decimal(50),
    );
    expect(mac.toNumber()).toBe(0);
  });

  it("MAC does not change on issues (handled by caller, but verify the math)", () => {
    // After issuing 50 of 200 @ ₹52, remaining 150 @ ₹52 = ₹7800
    const value = stockValueAfterIssue(new Decimal(150), new Decimal(52));
    expect(value.toNumber()).toBe(7800);
  });
});

describe("movementDirection", () => {
  it("classifies inbound movements", () => {
    expect(movementDirection("PURCHASE_RECEIPT")).toBe("IN");
    expect(movementDirection("TRANSFER_IN")).toBe("IN");
    expect(movementDirection("ADJUSTMENT_IN")).toBe("IN");
    expect(movementDirection("RETURN")).toBe("IN");
  });

  it("classifies outbound movements", () => {
    expect(movementDirection("TRANSFER_OUT")).toBe("OUT");
    expect(movementDirection("ISSUE_TO_PROJECT")).toBe("OUT");
    expect(movementDirection("ADJUSTMENT_OUT")).toBe("OUT");
    expect(movementDirection("SALE")).toBe("OUT");
  });

  it("throws on unknown type", () => {
    expect(() => movementDirection("UNKNOWN")).toThrow();
  });
});
